/**
 * MQTT service — publishes HMAC-signed unlock commands to the ESP32.
 * Topic pattern: blocklock/door/{doorId}/unlock
 * ESP32 verifies the HMAC before triggering the relay.
 */

import mqtt from "mqtt";
import crypto from "crypto";

let client;

export async function connectMQTT() {
  return new Promise((resolve, reject) => {
    client = mqtt.connect(process.env.MQTT_BROKER_URL, {
      username: process.env.MQTT_USERNAME,
      password: process.env.MQTT_PASSWORD,
      clientId: `blocklock-api-${Date.now()}`,
      clean: true,
      reconnectPeriod: 5000,
      connectTimeout: 10_000,
    });

    client.once("connect", resolve);
    client.once("error", reject);

    client.on("error", (err) => {
      console.error("[MQTT] Error:", err.message);
    });

    client.on("reconnect", () => {
      console.log("[MQTT] Reconnecting...");
    });
  });
}

/**
 * Build an HMAC-signed payload so the ESP32 can verify authenticity.
 * Even if someone intercepts the MQTT broker credentials, they cannot
 * forge a valid unlock command without knowing MQTT_HMAC_SECRET.
 */
function buildSignedPayload(doorId, durationMs) {
  const payload = {
    command: "unlock",
    door_id: doorId,
    duration_ms: durationMs,
    timestamp: Math.floor(Date.now() / 1000),
    nonce: crypto.randomBytes(8).toString("hex"),
  };

  const body = JSON.stringify(payload);
  const hmac = crypto
    .createHmac("sha256", process.env.MQTT_HMAC_SECRET)
    .update(body)
    .digest("hex");

  return JSON.stringify({ ...payload, hmac });
}

/**
 * Publish an unlock command for a specific door.
 * @param {string} doorId - e.g. "door_001"
 * @param {number} durationMs - how long to unlock in ms (default 5000)
 */
export function publishUnlock(doorId, durationMs = 5000) {
  if (!client || !client.connected) {
    throw new Error("MQTT client not connected");
  }

  const topic = `blocklock/door/${doorId}/unlock`;
  const message = buildSignedPayload(doorId, durationMs);

  return new Promise((resolve, reject) => {
    client.publish(topic, message, { qos: 1, retain: false }, (err) => {
      if (err) {
        console.error(`[MQTT] Failed to publish to ${topic}:`, err.message);
        reject(err);
      } else {
        console.log(`[MQTT] Unlock published → ${topic}`);
        resolve();
      }
    });
  });
}
