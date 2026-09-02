#!/usr/bin/env python3
"""
Write NDEF URI record to NTAG213 sticker via PN532.
Usage: python3 write_nfc.py [url]
Default URL: https://your-server.example.com
"""

import sys
import nfc
import ndef

URL = sys.argv[1] if len(sys.argv) > 1 else "https://your-server.example.com"

# PN532 connection strings to try in order
INTERFACES = [
    "tty:USB0:pn532",
    "tty:AMA0:pn532",
    "i2c:/dev/i2c-1",
]

def on_connect(tag):
    print(f"Tag detected: {tag}")
    if not tag.ndef:
        print("ERROR: Tag is not NDEF formatted or is read-only.")
        return False

    print(f"  Capacity : {tag.ndef.capacity} bytes")
    print(f"  Used     : {tag.ndef.length} bytes")
    print(f"  Writeable: {tag.ndef.is_writeable}")

    if not tag.ndef.is_writeable:
        print("ERROR: Tag is read-only.")
        return False

    tag.ndef.records = [ndef.UriRecord(URL)]
    print(f"  Written  : {URL}")
    print("Done. Remove the sticker.")
    return True

def try_interface(path):
    try:
        with nfc.ContactlessFrontend(path) as clf:
            print(f"Opened: {path}")
            print(f"Hold NTAG213 sticker near PN532 antenna...")
            clf.connect(rdwr={"on-connect": on_connect})
        return True
    except OSError as e:
        print(f"  {path} -> {e}")
        return False
    except Exception as e:
        print(f"  {path} -> {e}")
        return False

if __name__ == "__main__":
    print(f"URL to write: {URL}\n")
    for iface in INTERFACES:
        if try_interface(iface):
            break
    else:
        print("\nCould not open PN532 on any known interface.")
        print("Check wiring and that the PN532 mode switch is set to UART (for USB adapter) or I2C.")
        sys.exit(1)
