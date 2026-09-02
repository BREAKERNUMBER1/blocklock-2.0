# BlockLock — Wiring Diagram

## Power Distribution

```
[12V DC Adapter]
      |
      +──────────────────────────────────+
      |                                  |
   [LM2596 Buck Converter]         [Relay COM]
   12V IN → 5V OUT                      |
      |                          [Relay NO contact]
      +──────────────────────────+       |
      |                          |   [Lock +12V]
   [ESP32 VIN]           [Relay VCC]
   (onboard LDO → 3.3V)  [Relay GND]──┐
                                       |
                                    [GND rail]──[12V Adapter GND]
```

## Component Wiring

### LM2596 Buck Converter
| LM2596 Pin | Connect To |
|---|---|
| IN+  | 12V DC adapter (+) |
| IN-  | GND rail |
| OUT+ | ESP32 VIN pin, Relay VCC |
| OUT- | GND rail |

Set output to **5V** by adjusting the potentiometer on the LM2596 while measuring OUT+ with a multimeter.

---

### ESP32 → Relay Module
| ESP32 Pin | Relay Pin | Notes |
|---|---|---|
| VIN (5V) | VCC | Power for relay coil |
| GND      | GND | Common ground |
| GPIO26   | IN1 | Control signal (HIGH = relay energized = lock open) |

> If your relay module uses active-LOW logic (most optocoupler modules do not, but verify):
> Set `digitalWrite(RELAY_PIN, LOW)` to open and `HIGH` to close in firmware.
> The firmware uses active-HIGH by default. Test with a multimeter before connecting the lock.

---

### Relay → 12V Electric Strike Lock
| Relay Terminal | Connect To |
|---|---|
| COM (Common)        | 12V DC adapter (+) — or LM2596 IN+ |
| NO  (Normally Open) | Lock (+) terminal |
| NC  (Normally Closed)| Not used — leave disconnected |

The lock (−) terminal connects to GND rail.

> **Why NO and not NC?**
> Your lock is fail-secure (stays locked without power).
> Using Normally Open means the 12V only reaches the lock when the relay is energized.
> If power fails or ESP32 crashes → relay de-energizes → NO opens → no 12V to lock → door stays locked.

---

### Flyback Diode (REQUIRED — protect relay from solenoid back-EMF)
Place a **1N4007 diode** across the lock terminals:
- Diode cathode (stripe) → Lock (+) terminal
- Diode anode → Lock (−) terminal / GND

This absorbs the voltage spike when the solenoid coil de-energizes.

---

### ESP32 Pin Summary
| GPIO | Function |
|---|---|
| GPIO26 | Relay IN (lock control) |
| GPIO2  | Onboard LED (status indicator) |
| GPIO21 | PN532 SDA (NFC writer only) |
| GPIO22 | PN532 SCL (NFC writer only) |
| VIN    | 5V from LM2596 |
| GND    | Common ground |

---

## Full Wiring Diagram (Text)

```
                              ┌──────────────────────────────────┐
 12V DC Adapter               │         RELAY MODULE             │
 ┌──────────┐                 │   VCC ◄── 5V (LM2596 OUT+)      │
 │ (+) ─────┼──┬──────────────┼── COM                            │
 │          │  │              │   NO ───────────────┐            │
 │ (-) ─────┼──┴─── GND rail  │   IN1 ◄── GPIO26    │            │
 └──────────┘  │              │   GND ◄── GND rail  │            │
               │              └─────────────────────┼────────────┘
               │                                    │
         [LM2596]                             ┌─────▼──────┐
         IN+ ◄─┘                             │  12V LOCK  │
         IN- ◄── GND rail                   │ (+)   (-)  │
         OUT+ = 5V ──┬─ ESP32 VIN           │  │     │   │
         OUT- = GND ─┘                      └──┘     └───┘
                                             ↑       ↑
                                     12V             GND rail
                                  (from relay NO)

                 ┌────────────────────────┐
                 │        ESP32           │
                 │ VIN ◄── 5V (LM2596)   │
                 │ GND ◄── GND rail      │
                 │ GPIO26 ──► Relay IN1  │
                 │ GPIO2  ──► Status LED │
                 └────────────────────────┘

 [Flyback diode 1N4007 across lock terminals — cathode to (+)]
```

---

## PN532 Wiring (NFC Writer — separate from main installation)

| PN532 Pin | ESP32 Pin |
|---|---|
| VCC | 3.3V |
| GND | GND  |
| SDA | GPIO21 |
| SCL | GPIO22 |

**PN532 DIP Switch for I2C mode:**
- Switch 1: OFF
- Switch 2: ON

(Refer to your module's silkscreen — switch labels may vary)

---

## Breadboard Power Supply Module

Set the breadboard PSM jumpers to **5V** output.
Connect the LM2596 output to the PSM input rails if using a breadboard during development.
This gives you clean 5V and 3.3V rails across the breadboard.

---

## Safety Notes

1. **Never connect mains (220V AC) without proper enclosure and fusing.**
2. **Double-check LM2596 output voltage** with a multimeter before connecting ESP32.
3. **Install the 1N4007 flyback diode** — omitting it can damage the relay and ESP32 GPIO.
4. **For outdoor installation**: use an IP65-rated weatherproof enclosure. Apply conformal coating to the PCB.
5. **Fuse the 12V supply** with a 1A automotive blade fuse between the adapter and relay COM.
