/**
 * BlockLock — NFC Tag Writer Utility
 *
 * Uses the PN532 to write an NDEF URL record to an NFC sticker.
 * Run this once to program each tag. The tag will redirect phones
 * to your BlockLock dApp when scanned.
 *
 * PN532 wiring (I2C mode):
 *   PN532 VCC → ESP32 3.3V
 *   PN532 GND → ESP32 GND
 *   PN532 SDA → ESP32 GPIO21
 *   PN532 SCL → ESP32 GPIO22
 *
 *   Set PN532 DIP switches for I2C:
 *     Switch 1 (SCL) = OFF
 *     Switch 2 (SDA) = ON
 *   (Refer to your module's silkscreen labels)
 *
 * Required Arduino libraries (install via Library Manager):
 *   - Adafruit PN532   by Adafruit
 *   - Adafruit BusIO   by Adafruit (dependency)
 *
 * Usage:
 *   1. Edit DOOR_URL below with your deployed dApp URL and door ID.
 *   2. Upload this sketch to ESP32.
 *   3. Open Serial Monitor at 115200 baud.
 *   4. Place a blank NFC tag on the PN532 reader when prompted.
 *   5. The tag will be written. Repeat for each tag needed.
 */

#include <Wire.h>
#include <Adafruit_PN532.h>

// ─── Configure your dApp URL here ────────────────────────────────────────────
// The ?door= parameter tells the dApp which door to unlock.
// MetaMask deep link — routes the tap straight into MetaMask's mobile
// in-app browser instead of whatever the phone's default browser is.
// If a scanning phone doesn't have MetaMask installed, this link falls
// back to a normal web page prompting them to get the app.
// Fallback (older MetaMask installs that don't resolve link.metamask.io yet):
//   "https://metamask.app.link/dapp/dlb.tech?door=door_001"
#define DOOR_URL  "https://link.metamask.io/dapp/dlb.tech?door=door_001"
// ─────────────────────────────────────────────────────────────────────────────

#define PN532_SDA 21
#define PN532_SCL 22

Adafruit_PN532 nfc(PN532_SDA, PN532_SCL);

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n=== BlockLock NFC Tag Writer ===");

  nfc.begin();

  uint32_t versiondata = nfc.getFirmwareVersion();
  if (!versiondata) {
    Serial.println("[ERROR] PN532 not found. Check wiring and DIP switches.");
    while (1);
  }

  Serial.printf("[PN532] Firmware version: %d.%d\n",
                (versiondata >> 16) & 0xFF,
                (versiondata >> 8)  & 0xFF);

  nfc.SAMConfig();

  Serial.println("[READY] Place a blank NFC tag on the reader...");
}

void loop() {
  uint8_t uid[7];
  uint8_t uidLen;

  // Wait for a tag
  bool found = nfc.readPassiveTargetID(PN532_MIFARE_ISO14443A, uid, &uidLen, 5000);

  if (!found) {
    Serial.println("[Waiting] No tag detected...");
    return;
  }

  Serial.print("[Tag] UID: ");
  for (uint8_t i = 0; i < uidLen; i++) {
    Serial.printf("%02X ", uid[i]);
  }
  Serial.println();

  // Build NDEF message with URL record
  // NDEF URL record format:
  //   Record header + Type "U" + Identifier byte + URL (without https://)
  //
  // Identifier byte 0x04 = "https://" prefix (strips it from the stored URL)

  const char *urlBody = DOOR_URL + 8; // Skip "https://"
  uint8_t urlLen = strlen(urlBody);

  // NDEF record:
  //   [0x03]         = TLV type "NDEF Message"
  //   [len]          = total NDEF message length
  //   [0xD1]         = MB|ME|SR|TNF_WELL_KNOWN
  //   [0x01]         = Type length (1 byte)
  //   [urlLen+1]     = Payload length
  //   [0x55]         = Type "U" (URL record)
  //   [0x04]         = Identifier (https://)
  //   [url...]       = URL body
  //   [0xFE]         = TLV terminator

  uint8_t ndefPayloadLen = 1 + urlLen; // identifier + url
  uint8_t ndefRecordLen  = 3 + 1 + 1 + ndefPayloadLen; // header + type_len + payload_len + type + payload
  uint8_t tlvLen         = ndefRecordLen;

  // NTAG215 page size = 4 bytes, first user page = 4
  // Data starts at page 4, byte 0
  // We write up to 45 pages (180 bytes) of user data on NTAG215

  uint8_t ndefMsg[128] = {0};
  uint8_t idx = 0;
  ndefMsg[idx++] = 0x03;            // NDEF TLV
  ndefMsg[idx++] = tlvLen;          // Length
  ndefMsg[idx++] = 0xD1;           // Record header: MB|ME|SR, TNF=Well-Known
  ndefMsg[idx++] = 0x01;           // Type Length = 1
  ndefMsg[idx++] = ndefPayloadLen; // Payload length
  ndefMsg[idx++] = 0x55;           // Type = 'U' (URL)
  ndefMsg[idx++] = 0x04;           // Identifier = https://
  memcpy(&ndefMsg[idx], urlBody, urlLen);
  idx += urlLen;
  ndefMsg[idx++] = 0xFE;           // TLV terminator

  // Write pages starting at page 4 (4 bytes each)
  uint8_t totalBytes = idx;
  uint8_t pages = (totalBytes + 3) / 4;

  Serial.printf("[Write] Writing %d bytes (%d pages) to tag...\n", totalBytes, pages);

  bool success = true;
  for (uint8_t p = 0; p < pages; p++) {
    uint8_t pageData[4] = {0};
    for (uint8_t b = 0; b < 4; b++) {
      uint8_t byteIdx = p * 4 + b;
      pageData[b] = (byteIdx < totalBytes) ? ndefMsg[byteIdx] : 0;
    }

    if (!nfc.ntag2xx_WritePage(4 + p, pageData)) {
      Serial.printf("[ERROR] Failed to write page %d\n", 4 + p);
      success = false;
      break;
    }
  }

  if (success) {
    Serial.println("[SUCCESS] NFC tag written successfully!");
    Serial.printf("[URL] Tag will open: %s\n", DOOR_URL);
    Serial.println("\nRemove tag. Place next tag to program another, or reset ESP32 to stop.");
    delay(2000); // Debounce — wait before reading again
  } else {
    Serial.println("[FAILED] Tag write failed. Try again with a compatible NTAG215 tag.");
  }
}
