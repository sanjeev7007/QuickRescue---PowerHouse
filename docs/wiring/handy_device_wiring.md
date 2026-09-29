# QuickRescue — Handy Device Hardware Wiring Plan
# Revision 1.0 | ESP32-WROOM-32 + LoRa SX1276/78 + GPS + MPU6050 + OLED

---

## 1. ESP32 GPIO Quick-Reference Before Assignment

### Pins That Must Be Avoided / Treated With Care

| GPIO | Reason | Verdict |
|------|--------|---------|
| GPIO0  | Strapping — LOW at boot = download mode | **Avoid** |
| GPIO2  | Strapping — must be LOW during flash; internal LED on dev-kit | **Avoid** |
| GPIO6–11 | Routed to internal SPI flash of module — hardwired | **Never use** |
| GPIO12 | Strapping (MTDI) — HIGH at boot selects 1.8 V flash VDD; damages module | **Avoid as pull-up input** |
| GPIO15 | Strapping (MTDO) — LOW silences UART0 boot log | **Safe if not pulled low at boot** |
| GPIO1, 3 | UART0 TX/RX (programming + Serial.print debug) | **Reserve for debug** |
| GPIO34–39 | Input-only — no internal pull-up / pull-down | **ADC / interrupt inputs only** |

### Safe General-Purpose GPIOs Available

18, 19, 23 (SPI), 21, 22 (I2C), 16, 17 (UART2),
4, 5, 13, 14, 25, 26, 27, 32, 33, 34, 35

---

## 2. Pin Mapping Table — All Components

All signal levels are **3.3 V** logic. Every peripheral listed is 3.3 V compatible.

### 2a. LoRa SX1276 / SX1278 (SPI Bus)

| SX1276 Pin | ESP32 GPIO | Direction | Notes |
|------------|-----------|-----------|-------|
| SCK        | GPIO 18   | OUT       | SPI clock — shared bus |
| MISO       | GPIO 19   | IN        | SPI data from LoRa |
| MOSI       | GPIO 23   | OUT       | SPI data to LoRa |
| NSS (CS)   | GPIO 5    | OUT       | Chip-select — active LOW; GPIO5 is safe (pulled HIGH by default at boot via LoRa module pull-up) |
| RST        | GPIO 14   | OUT       | Active LOW reset pulse on init |
| DIO0       | GPIO 26   | IN        | RxDone / TxDone interrupt; connect 10 kΩ pull-down to GND |
| GND        | GND       | —         | Common ground |
| 3.3 V      | 3V3 rail  | —         | Power |

### 2b. OLED Display — SSD1306 / SH1106 (I2C Bus)

| OLED Pin | ESP32 GPIO | Notes |
|----------|-----------|-------|
| SDA      | GPIO 21   | I2C data — shared with MPU6050; 4.7 kΩ pull-up to 3V3 |
| SCL      | GPIO 22   | I2C clock — shared with MPU6050; 4.7 kΩ pull-up to 3V3 |
| GND      | GND       | |
| VCC      | 3V3 rail  | 3.3 V supply |

Default I2C address: 0x3C (SSD1306). Confirm with ADDR pin state on your module.

### 2c. MPU6050 / MPU6500 IMU (I2C Bus — shared with OLED)

| MPU Pin | ESP32 GPIO | Notes |
|---------|-----------|-------|
| SDA     | GPIO 21   | Shared I2C bus |
| SCL     | GPIO 22   | Shared I2C bus |
| INT     | GPIO 4    | Motion / fall-detect interrupt; 10 kΩ pull-down to GND |
| AD0     | GND       | Sets I2C address to 0x68 (tie to 3V3 for 0x69 if address clash) |
| GND     | GND       | |
| VCC     | 3V3 rail  | |

### 2d. GPS Module — NEO-6M / NEO-8M (UART2)

| GPS Pin | ESP32 GPIO | Notes |
|---------|-----------|-------|
| TX      | GPIO 16   | ESP32 Serial2 RX — GPS transmits NMEA sentences |
| RX      | GPIO 17   | ESP32 Serial2 TX — send config commands to GPS |
| GND     | GND       | |
| VCC     | 3V3 rail  | NEO-6M/8M accepts 3.3 V — check module regulator if using 5 V breakout |
| PPS     | — (NC)    | Not connected in this design |

GPS baud rate: 9600 (default). TinyGPSPlus library used for NMEA parsing.

### 2e. Indicators — Green LED and Red LED

| Component  | ESP32 GPIO | Resistor | Notes |
|------------|-----------|----------|-------|
| Green LED (SAFE status) | GPIO 25 | 330 Ω in series | Active HIGH — on when safe |
| Red LED (HELP/SOS alert) | GPIO 27 | 330 Ω in series | Active HIGH — blinks on HELP/SOS |

Resistor calculation: (3.3 V − 2.1 V forward drop) / 10 mA = 120 Ω minimum. 330 Ω used for ~3.6 mA — conservative, extends battery life.

### 2f. Push Buttons

| Button          | ESP32 GPIO | Mode | Notes |
|-----------------|-----------|------|-------|
| SAFE button     | GPIO 32   | Input, PULLUP | Active LOW — press = GND; internal pull-up enabled in firmware |
| TROUBLE / HELP button | GPIO 33 | Input, PULLUP | Active LOW; held 3 s = HELP, held 5 s = SOS |
| Reset button    | EN pin    | —    | Connected to EN and GND via 10 µF cap; standard ESP32 reset |

Button wiring: one terminal to GPIO, other terminal to GND. No external pull-up needed (firmware uses `INPUT_PULLUP`).

### 2g. Battery Voltage Sense (ADC)

| Node | ESP32 GPIO | Notes |
|------|-----------|-------|
| Voltage divider output | GPIO 35 | ADC1_CH7; input-only GPIO; no pull-up conflict |

See Section 4 for full divider circuit.

### 2h. ON/OFF Switch

Wired in the **power rail** between battery positive and the rest of the circuit (see Section 3). Not a GPIO pin.

---

## 3. Bus Architecture Summary

```
ESP32-WROOM-32
│
├── SPI Bus (LoRa SX1276/78)
│   ├── SCK  → GPIO18
│   ├── MISO → GPIO19
│   ├── MOSI → GPIO23
│   ├── CS   → GPIO5
│   ├── RST  → GPIO14
│   └── DIO0 → GPIO26
│
├── I2C Bus (OLED + MPU6050/6500) ── 4.7 kΩ pull-ups to 3V3
│   ├── SDA  → GPIO21
│   └── SCL  → GPIO22
│       ├── OLED  @ 0x3C
│       └── MPU6050 @ 0x68
│
├── UART2 (GPS NEO-6M/8M)
│   ├── RX2 (GPIO16) ← GPS TX
│   └── TX2 (GPIO17) → GPS RX
│
├── GPIO Output
│   ├── GPIO25 → Green LED (330 Ω) → GND
│   └── GPIO27 → Red LED   (330 Ω) → GND
│
├── GPIO Input (PULLUP)
│   ├── GPIO32 ← SAFE button → GND
│   └── GPIO33 ← HELP button → GND
│
├── GPIO Interrupt Input
│   ├── GPIO4  ← MPU6050 INT (10 kΩ pull-down to GND)
│   └── GPIO26 ← LoRa DIO0   (10 kΩ pull-down to GND)
│
└── ADC Input (Input-Only GPIO)
    └── GPIO35 ← Battery voltage divider midpoint
```

---

## 4. Power Path

```
Li-ion 2000 mAh Cell (3.7 V nom / 4.2 V max)
         │
         ▼
  TP4056 Module (USB-C input)
  ├── Charge input: 5V USB-C (max 1A charge current — set R_prog = 1.2 kΩ for 1A)
  ├── Charge LED: BAT indicator LED (on module board)
  └── Battery B+/B− terminals
         │
         ▼
  DW01A + FS8205A Battery Protection IC
  (Over-charge / over-discharge / short-circuit protection)
  NOTE: Most TP4056 modules sold with "protection" already include DW01A.
         │
         ▼
  ON/OFF Switch (SPDT or SPST slide switch, rated ≥ 1 A)
  (Interrupts battery + rail to entire system)
         │
         ▼
  AMS1117-3.3 LDO Regulator (SOT-223 or TO-252)
  ├── Input:  Battery+ (3.7–4.2 V) — 100 µF electrolytic + 100 nF ceramic to GND
  ├── Output: 3.3 V regulated rail — 10 µF electrolytic + 100 nF ceramic to GND
  └── Max output current: 800 mA (sufficient for ESP32 ~240 mA + GPS ~50 mA + LoRa ~120 mA peak)
         │
   3.3 V RAIL
   ├── ESP32 3V3 pin
   ├── LoRa SX1276 (3.3 V)
   ├── OLED (3.3 V)
   ├── MPU6050 (3.3 V)
   └── GPS module (3.3 V — if module has onboard 3.3 V reg, can feed 4.2 V directly)

Power Budget Estimate (worst case, peaks):
  ESP32 (WiFi off, active)  ~  80 mA
  LoRa SX1276 TX peak       ~ 120 mA (momentary, ~200 ms)
  GPS NEO-6M (cold start)   ~  47 mA
  MPU6050                   ~  3.5 mA
  OLED SSD1306              ~  15 mA (all pixels on)
  2× LEDs (one on)          ~   4 mA
  Voltage divider bleed     ~ 0.002 mA (2 µA at 4.2 V / 2 MΩ)
  ──────────────────────────────────────
  Continuous (typical)      ~ 200 mA
  Peak (LoRa TX burst)      ~ 270 mA
  AMS1117 limit             ~ 800 mA  ✓
  Estimated runtime         ~ 2000 mAh / 200 mA = ~10 hrs typical
```

---

## 5. Battery Voltage Sensing Circuit

### Circuit Diagram

```
Battery+  ────┤ R1 = 1 MΩ ├──── ADC_IN (GPIO35) ──── R2 = 1 MΩ ──── GND
```

### Design Values

| Parameter | Value |
|---|---|
| R1 | 1 MΩ (1%) |
| R2 | 1 MΩ (1%) |
| Divider ratio | 0.5 |
| V_ADC at full charge (4.20 V) | 2.10 V |
| V_ADC at nominal (3.70 V) | 1.85 V |
| V_ADC at low cutoff (3.00 V) | 1.50 V |
| Divider bleed current | 4.2 V / 2 MΩ ≈ **2.1 µA** (negligible) |
| ESP32 ADC reference | 3.3 V (11 dB attenuation for full range) |

### Firmware Conversion

```cpp
// In config.h
#define PIN_BATT_ADC      35
#define BATT_R1_OHMS      1000000.0f
#define BATT_R2_OHMS      1000000.0f
#define BATT_DIVIDER      (BATT_R2_OHMS / (BATT_R1_OHMS + BATT_R2_OHMS))  // 0.5
#define ADC_REF_MV        3300.0f   // ESP32 3.3 V rail
#define ADC_RESOLUTION    4095.0f   // 12-bit ADC

// Returns battery voltage in millivolts
float readBatteryMv() {
    analogSetAttenuation(ADC_11db);  // 0–3.9 V input range
    uint16_t raw = analogRead(PIN_BATT_ADC);
    float adc_mv = (raw / ADC_RESOLUTION) * ADC_REF_MV;
    return adc_mv / BATT_DIVIDER;   // Undo divider
}

// Returns battery percentage (linear approximation — Li-ion 3.0–4.2 V)
uint8_t batteryPercent() {
    float mv  = readBatteryMv();
    float pct = (mv - 3000.0f) / (4200.0f - 3000.0f) * 100.0f;
    if (pct < 0)   pct = 0;
    if (pct > 100) pct = 100;
    return (uint8_t)pct;
}
```

Add a 100 nF ceramic capacitor across GPIO35 to GND close to the pin to filter ADC noise.

---

## 6. Antenna Placement & Enclosure Notes

### LoRa Antenna

| Rule | Detail |
|---|---|
| Antenna type | 868 MHz quarter-wave monopole (82 mm wire) or spring/helical 868 MHz stub |
| Connector | SMA female panel-mount on enclosure wall |
| Cable | U.FL to SMA pigtail, **≤ 10 cm** (longer = loss) |
| Placement | Antenna mounted **vertically** on top or side of enclosure, **above all electronics** |
| Ground plane | A 70 × 70 mm copper or aluminum plate under the antenna base improves gain |
| Clearance | Minimum 30 mm clearance from battery, ESP32 metal shield, and human body |
| Grounding | Antenna shield/ground connected to circuit GND — verify with continuity tester |
| **Never** | Do NOT enclose antenna inside a metal-lined case; do NOT coil the wire |

### Enclosure Design

```
Enclosure: IP65-rated ABS or PC box (approx. 120 × 80 × 40 mm)
Jacket mounting: Velcro + two M3 screws through back panel

Cut-outs required:
┌─────────────────────────────────────────────────────────┐
│  [SMA bulkhead — top edge, recessed within jacket flap] │
│  [USB-C charging port — bottom edge, rubber dust-cap]   │
│  [OLED window — front face, polycarbonate light-pipe]   │
│  [SAFE button — front face, green tactile with boot]    │
│  [HELP button — front face, red tactile with boot]      │
│  [Green LED hole — 5 mm, front face]                    │
│  [Red LED hole   — 5 mm, front face]                    │
│  [ON/OFF switch  — side face, IP65 toggle or rocker]    │
│  [Reset button   — recessed side, pin-accessible only]  │
└─────────────────────────────────────────────────────────┘

Sealing:
  - All cable entry points: cable gland (PG7 or M16)
  - Button boots: IP67-rated silicone tactile boots
  - USB-C port: rubber dust plug when not charging
  - OLED: silicone bead + polycarbonate window panel

GPS considerations:
  - GPS antenna must have clear sky view
  - Route GPS module near top of enclosure or use external active GPS antenna
    with SMA pigtail to enclosure top (preferred for best fix in field)
```

---

## 7. Complete GPIO Allocation — No-Conflict Summary

| GPIO | Function | Direction | Conflict Risk | Status |
|------|----------|-----------|---------------|--------|
| 4    | MPU6050 INT | IN | None | ✅ Safe |
| 5    | LoRa NSS/CS | OUT | Strapping (HIGH at boot = SD card not selected) | ✅ Safe (LoRa CS is HIGH idle) |
| 14   | LoRa RST | OUT | None (JTAG CLK, not strapping) | ✅ Safe |
| 16   | GPS RX2 | IN | None | ✅ Safe |
| 17   | GPS TX2 | OUT | None | ✅ Safe |
| 18   | LoRa SCK | OUT | None | ✅ Safe |
| 19   | LoRa MISO | IN | None | ✅ Safe |
| 21   | I2C SDA | IN/OUT | None | ✅ Safe |
| 22   | I2C SCL | OUT | None | ✅ Safe |
| 23   | LoRa MOSI | OUT | None | ✅ Safe |
| 25   | Green LED | OUT | None (DAC1 — not used) | ✅ Safe |
| 26   | LoRa DIO0 | IN | None (DAC2 — not used) | ✅ Safe |
| 27   | Red LED | OUT | None | ✅ Safe |
| 32   | SAFE button | IN (PULLUP) | None (capacitive touch) | ✅ Safe |
| 33   | HELP button | IN (PULLUP) | None (capacitive touch) | ✅ Safe |
| 35   | Battery ADC | IN only | None (input-only pin) | ✅ Safe |
| EN   | Reset button | — | Standard ESP32 reset | ✅ Safe |
| 0    | — | — | Strapping pin | ⛔ Reserved |
| 2    | — | — | Strapping / flash LED | ⛔ Reserved |
| 6–11 | — | — | Internal flash | ⛔ Never use |
| 12   | — | — | Strapping (MTDI) | ⛔ Reserved |
| 1, 3 | UART0 TX/RX | — | Debug serial | 🔒 Debug only |

---

## 8. I2C Address Map

| Device | I2C Address | Set By |
|---|---|---|
| OLED SSD1306 | 0x3C | ADDR pin tied to GND (typical) |
| MPU6050 | 0x68 | AD0 pin tied to GND |

No address conflict. Both devices coexist on the same I2C bus (GPIO21/22).

---

## 9. config.h Pin Definitions (Reference for Firmware)

```cpp
// ============================================================
// QuickRescue Handy Device — GPIO Pin Configuration
// Target: ESP32-WROOM-32
// ============================================================

// LoRa SX1276/78 (SPI)
#define PIN_LORA_SCK    18
#define PIN_LORA_MISO   19
#define PIN_LORA_MOSI   23
#define PIN_LORA_SS      5
#define PIN_LORA_RST    14
#define PIN_LORA_DIO0   26

// GPS — NEO-6M/8M (UART2)
#define PIN_GPS_RX      16   // ESP32 RX2 <- GPS TX
#define PIN_GPS_TX      17   // ESP32 TX2 -> GPS RX

// I2C — OLED + MPU6050
#define PIN_I2C_SDA     21
#define PIN_I2C_SCL     22

// IMU — MPU6050 interrupt
#define PIN_MPU_INT      4

// Indicators
#define PIN_LED_GREEN   25
#define PIN_LED_RED     27

// Buttons (active LOW, INPUT_PULLUP)
#define PIN_BTN_SAFE    32
#define PIN_BTN_HELP    33

// Battery ADC (input-only GPIO, ADC1_CH7)
#define PIN_BATT_ADC    35

// I2C Addresses
#define I2C_ADDR_OLED   0x3C
#define I2C_ADDR_MPU    0x68

// LoRa RF
#define LORA_FREQUENCY  866E6   // 866 MHz — within 865-867 MHz India ISM band
#define LORA_BANDWIDTH  125E3
#define LORA_SF         10      // Spreading Factor 10 — balance of range vs data rate
#define LORA_CR         5       // Coding Rate 4/5
#define LORA_TX_POWER   17      // dBm — SX1276 max is 20 dBm; 17 is compliant
```
