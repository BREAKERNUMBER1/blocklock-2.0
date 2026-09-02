/**
 * BlockLock — ESP32 Firmware
 *
 * Connects to MQTT broker over TLS.
 * Subscribes to unlock topic, verifies HMAC signature,
 * then pulses the relay to open the electric strike for the specified duration.
 *
 * Required Arduino libraries (install via Library Manager):
 *   - PubSubClient     by Nick O'Leary
 *   - ArduinoJson      by Benoit Blanchon (v7)
 *   - Crypto (mbedTLS) — built into ESP32 Arduino core, no install needed
 *
 * Board: "ESP32 Dev Module" in Arduino IDE / esp32 by Espressif
 */

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <mbedtls/md.h>
#include <time.h>
#include "config.h"

// ─────────────────────────────────────────────────────────────
//  Globals
// ─────────────────────────────────────────────────────────────
WiFiClientSecure wifiClient;
PubSubClient     mqttClient(wifiClient);

unsigned long lastHeartbeat   = 0;
unsigned long lockCloseTime   = 0;   // millis() when relay should close again
bool          relayActive     = false;
bool          timeSynced      = false;

// Nonce dedup ring — stores the last NONCE_RING_SIZE nonces we've accepted,
// so a captured, validly-signed unlock message can't be replayed even
// within the MAX_COMMAND_AGE_SECONDS freshness window.
#define NONCE_RING_SIZE 32
String        nonceRing[NONCE_RING_SIZE];
int           nonceRingPos   = 0;

bool isNonceReplayed(const String &nonce) {
  for (int i = 0; i < NONCE_RING_SIZE; i++) {
    if (nonceRing[i] == nonce) return true;
  }
  return false;
}

void recordNonce(const String &nonce) {
  nonceRing[nonceRingPos] = nonce;
  nonceRingPos = (nonceRingPos + 1) % NONCE_RING_SIZE;
}

// ─────────────────────────────────────────────────────────────
//  HMAC-SHA256 verification
// ─────────────────────────────────────────────────────────────
bool verifyHMAC(const String &body, const String &receivedHmac) {
  byte result[32];
  const char *key     = HMAC_SECRET;
  const char *message = body.c_str();

  mbedtls_md_context_t ctx;
  mbedtls_md_init(&ctx);
  mbedtls_md_setup(&ctx, mbedtls_md_info_from_type(MBEDTLS_MD_SHA256), 1);
  mbedtls_md_hmac_starts(&ctx, (const byte *)key, strlen(key));
  mbedtls_md_hmac_update(&ctx, (const byte *)message, strlen(message));
  mbedtls_md_hmac_finish(&ctx, result);
  mbedtls_md_free(&ctx);

  // Convert to hex string
  char computed[65];
  for (int i = 0; i < 32; i++) {
    sprintf(&computed[i * 2], "%02x", result[i]);
  }
  computed[64] = '\0';

  return receivedHmac.equals(String(computed));
}

// ─────────────────────────────────────────────────────────────
//  Relay control
// ─────────────────────────────────────────────────────────────
void openLock(unsigned long durationMs) {
  Serial.printf("[LOCK] Opening for %lu ms\n", durationMs);
  digitalWrite(RELAY_PIN, LOW);   // LOW = relay energizes (active-LOW) = lock unlocks
  digitalWrite(STATUS_LED_PIN, HIGH);
  relayActive   = true;
  lockCloseTime = millis() + durationMs;
}

void closeLock() {
  Serial.println("[LOCK] Closing");
  digitalWrite(RELAY_PIN, HIGH);  // HIGH = relay de-energized (active-LOW) = lock locks
  digitalWrite(STATUS_LED_PIN, LOW);
  relayActive = false;

  // Publish closed status
  mqttClient.publish(TOPIC_STATUS, "{\"status\":\"locked\"}");
}

// ─────────────────────────────────────────────────────────────
//  MQTT message handler
// ─────────────────────────────────────────────────────────────
void onMqttMessage(char *topic, byte *payload, unsigned int length) {
  String raw = "";
  for (unsigned int i = 0; i < length; i++) raw += (char)payload[i];

  Serial.printf("[MQTT] Message on %s: %s\n", topic, raw.c_str());

  // Parse JSON
  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, raw);
  if (err) {
    Serial.println("[MQTT] JSON parse error — ignoring");
    return;
  }

  const char *command  = doc["command"];
  const char *doorId   = doc["door_id"];
  const char *hmac     = doc["hmac"];
  long        timestamp = doc["timestamp"];
  long        durationMs = doc["duration_ms"] | UNLOCK_DURATION_MS;
  const char *nonce    = doc["nonce"];

  // Validate command field
  if (!command || strcmp(command, "unlock") != 0) {
    Serial.println("[MQTT] Unknown command — ignoring");
    return;
  }

  // Validate door ID
  if (!doorId || strcmp(doorId, DOOR_ID) != 0) {
    Serial.printf("[MQTT] Door ID mismatch (%s) — ignoring\n", doorId ? doorId : "null");
    return;
  }

  if (!nonce) {
    Serial.println("[MQTT] No nonce — rejecting");
    return;
  }

  // Verify HMAC — reconstruct body without the hmac field
  if (!hmac) {
    Serial.println("[MQTT] No HMAC — rejecting");
    return;
  }

  // Rebuild the body exactly as the server serialized it (without hmac key)
  JsonDocument bodyDoc;
  bodyDoc["command"]     = command;
  bodyDoc["door_id"]     = doorId;
  bodyDoc["duration_ms"] = durationMs;
  bodyDoc["timestamp"]   = timestamp;
  bodyDoc["nonce"]       = nonce;

  String bodyStr;
  serializeJson(bodyDoc, bodyStr);

  if (!verifyHMAC(bodyStr, String(hmac))) {
    Serial.println("[MQTT] HMAC verification FAILED — possible spoofed message, rejecting");
    mqttClient.publish(TOPIC_STATUS, "{\"status\":\"hmac_failed\"}");
    return;
  }

  Serial.println("[MQTT] HMAC verified OK");

  // Command age — reject stale messages (replay protection). Requires NTP
  // sync at boot (see syncTime()); if the clock never synced, fail closed
  // rather than silently skip the freshness check.
  if (!timeSynced) {
    Serial.println("[MQTT] Clock not NTP-synced — rejecting for safety");
    return;
  }
  long now = (long)time(nullptr);
  long age = labs(now - timestamp);
  if (age > MAX_COMMAND_AGE_SECONDS) {
    Serial.printf("[MQTT] Command too old (%lds) — rejecting (possible replay)\n", age);
    mqttClient.publish(TOPIC_STATUS, "{\"status\":\"stale_command\"}");
    return;
  }

  // Nonce dedup — a validly-signed, fresh message we've already acted on
  // cannot be replayed a second time within the ring's window.
  if (isNonceReplayed(nonce)) {
    Serial.println("[MQTT] Nonce already seen — rejecting (replay)");
    mqttClient.publish(TOPIC_STATUS, "{\"status\":\"replayed_command\"}");
    return;
  }
  recordNonce(nonce);

  // All checks passed — open the lock
  openLock((unsigned long)durationMs);
  mqttClient.publish(TOPIC_STATUS, "{\"status\":\"unlocking\"}");
}

// ─────────────────────────────────────────────────────────────
//  WiFi
// ─────────────────────────────────────────────────────────────
const char *wifiStatusStr(wl_status_t s) {
  switch (s) {
    case WL_NO_SSID_AVAIL: return "NO_SSID_AVAIL (network not found — check name/band, ESP32 is 2.4GHz only)";
    case WL_CONNECT_FAILED: return "CONNECT_FAILED (likely wrong password)";
    case WL_CONNECTION_LOST: return "CONNECTION_LOST";
    case WL_DISCONNECTED: return "DISCONNECTED";
    case WL_IDLE_STATUS: return "IDLE";
    default: return "UNKNOWN";
  }
}

void connectWiFi() {
  Serial.println("[WiFi] Scanning for networks...");
  int n = WiFi.scanNetworks();
  bool targetSeen = false;
  for (int i = 0; i < n; i++) {
    bool isTarget = WiFi.SSID(i) == WIFI_SSID;
    if (isTarget) targetSeen = true;
    Serial.printf("  %s%s  (RSSI %d, ch %d, %s)\n",
                   isTarget ? "-> " : "   ",
                   WiFi.SSID(i).c_str(), WiFi.RSSI(i), WiFi.channel(i),
                   WiFi.encryptionType(i) == WIFI_AUTH_OPEN ? "open" : "secured");
  }
  if (!targetSeen) {
    Serial.printf("[WiFi] WARNING: \"%s\" was NOT seen in the scan above.\n", WIFI_SSID);
  }

  Serial.printf("[WiFi] Connecting to %s", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
    attempts++;
    if (attempts % 20 == 0) {
      Serial.printf("\n[WiFi] Still not connected after %ds — status: %s\n",
                     attempts / 2, wifiStatusStr(WiFi.status()));
    }
  }
  Serial.printf("\n[WiFi] Connected. IP: %s\n", WiFi.localIP().toString().c_str());
}

// ─────────────────────────────────────────────────────────────
//  Time sync (NTP) — required for command-age replay protection
// ─────────────────────────────────────────────────────────────
void syncTime() {
  Serial.println("[Time] Syncing via NTP...");
  configTime(0, 0, "pool.ntp.org", "time.nist.gov"); // UTC, no DST offset

  time_t now = time(nullptr);
  int attempts = 0;
  const int maxAttempts = 20; // ~10s
  while (now < 1700000000 && attempts < maxAttempts) { // sanity floor: 2023-11-14
    delay(500);
    now = time(nullptr);
    attempts++;
  }

  if (now < 1700000000) {
    Serial.println("[Time] WARNING: NTP sync failed — unlock commands will be rejected until it succeeds.");
    timeSynced = false;
  } else {
    timeSynced = true;
    Serial.printf("[Time] Synced. Current UTC epoch: %ld\n", (long)now);
  }
}

// ─────────────────────────────────────────────────────────────
//  MQTT connection
// ─────────────────────────────────────────────────────────────
void connectMQTT() {
  while (!mqttClient.connected()) {
    Serial.printf("[MQTT] Connecting to %s:%d...\n", MQTT_BROKER, MQTT_PORT);

    // cleanSession=false → broker queues QoS 1 messages while ESP32 is offline
    if (mqttClient.connect(MQTT_CLIENT_ID, MQTT_USERNAME, MQTT_PASSWORD, nullptr, 0, false, nullptr, false)) {
      Serial.println("[MQTT] Connected.");

      // Subscribe to unlock topic
      mqttClient.subscribe(TOPIC_UNLOCK, 1); // QoS 1

      // Announce online
      mqttClient.publish(TOPIC_STATUS, "{\"status\":\"online\"}");
    } else {
      Serial.printf("[MQTT] Failed (rc=%d). Retrying in 5s...\n", mqttClient.state());
      delay(5000);
    }
  }
}

// ─────────────────────────────────────────────────────────────
//  Setup
// ─────────────────────────────────────────────────────────────
void setup() {
  // ── Lock relay first — HIGH = relay off (active-LOW relay) = lock stays locked ──
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, HIGH); // HIGH = relay de-energized = lock locked

  Serial.begin(115200);
  delay(100);
  Serial.println("\n=== BlockLock v1.0 ===");

  // Hardware init
  pinMode(STATUS_LED_PIN, OUTPUT);
  digitalWrite(STATUS_LED_PIN, LOW);

  // WiFi
  connectWiFi();

  // Time — must happen before we can trust command-age replay checks
  syncTime();

  // TLS — skip certificate verification for development.
  // For production, load your broker's CA cert and call:
  //   wifiClient.setCACert(ca_cert);
  wifiClient.setInsecure(); // DEVELOPMENT ONLY — see docs/deployment.md for production TLS

  // MQTT
  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
  mqttClient.setCallback(onMqttMessage);
  mqttClient.setBufferSize(512);

  connectMQTT();

  // Quick LED flash to confirm startup
  for (int i = 0; i < 3; i++) {
    digitalWrite(STATUS_LED_PIN, HIGH); delay(100);
    digitalWrite(STATUS_LED_PIN, LOW);  delay(100);
  }

  Serial.printf("[READY] Door %s listening for unlock commands.\n", DOOR_ID);
}

// ─────────────────────────────────────────────────────────────
//  Loop
// ─────────────────────────────────────────────────────────────
void loop() {
  // Reconnect WiFi if dropped
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WiFi] Lost connection. Reconnecting...");
    connectWiFi();
  }

  // Reconnect MQTT if dropped
  if (!mqttClient.connected()) {
    connectMQTT();
  }

  // Retry NTP sync if it failed at boot — unlock commands are rejected
  // until this succeeds, so keep trying rather than staying stuck forever.
  static unsigned long lastTimeSyncAttempt = 0;
  if (!timeSynced && millis() - lastTimeSyncAttempt >= 30000) {
    lastTimeSyncAttempt = millis();
    syncTime();
  }

  mqttClient.loop();

  // Auto-close relay after unlock duration
  if (relayActive && millis() >= lockCloseTime) {
    closeLock();
  }

  // Publish heartbeat
  if (millis() - lastHeartbeat >= HEARTBEAT_INTERVAL) {
    lastHeartbeat = millis();
    String hb = "{\"door_id\":\"" DOOR_ID "\",\"status\":\"online\",\"uptime_ms\":" +
                String(millis()) + "}";
    mqttClient.publish(TOPIC_HEARTBEAT, hb.c_str());
    Serial.println("[Heartbeat] Published.");
  }
}
