# QuickRescue — Communication Tower Hardware Wiring Plan
# Revision 1.0 | Raspberry Pi 4 (8GB) Gateway & Actuator Hub

---

## 1. System Overview & Power Architecture

The QuickRescue Communication Tower acts as the autonomous central gateway during disasters. It operates 100% off-grid via a 20W solar array, MPPT solar charger, and a 12.8V 20Ah LiFePO4 battery pack.

### 1.1 Complete Power & Load Block Diagram

```mermaid
flowchart TD
    SP["20W Solar Panel<br/>(18V-21V Voc, 1.1A Isc)"] -->|PV In (+/-)| MPPT["MPPT Charge Controller<br/>(10A, 12V Auto-Detect)"]
    
    subgraph Battery_Subsystem ["Energy Storage (12V Rail)"]
        F1["Inline 15A Blade Fuse"]
        BATT["12V 20Ah LiFePO4 Battery<br/>(4S with internal BMS, 12.8V Nom)"]
        INA["INA219 High-Side Shunt<br/>(Voltage & Current Monitor)"]
        F1 <--> BATT
        MPPT <-->|Bat +/-| INA
        INA <--> F1
    end

    MPPT -->|12V Load Out| SW_MAIN["Main Power Switch<br/>(10A DC Rocker)"]

    subgraph High_Power_12V ["12V Actuators"]
        F2["5A Fuse"]
        RELAY_BOARD["4-Channel Optocoupled<br/>Relay / MOSFET Module"]
        SIREN["Industrial Siren<br/>(12V DC, 1.5A, 115dB)"]
        TOWER_LIGHT["Tri-Colour Stack Light<br/>(Red, Amber, Green - 12V)"]
        
        SW_MAIN --> F2 --> RELAY_BOARD
        RELAY_BOARD --> SIREN
        RELAY_BOARD --> TOWER_LIGHT
    end

    subgraph Step_Down_5V ["5V Regulated Logic Rail"]
        F3["3A Fuse"]
        BUCK["12V to 5V Step-Down Buck Converter<br/>(5V 5A / 25W, >92% Efficiency)"]
        PI4["Raspberry Pi 4 (8GB)<br/>(5V / 3A via GPIO / USB-C)"]
        P10_PWR["P10 LED Matrix Board<br/>(5V, 2.5A peak at full white)"]
        TOUCH_PWR["7-inch Touchscreen Display<br/>(5V, 800mA)"]
        
        SW_MAIN --> F3 --> BUCK
        BUCK --> PI4
        BUCK --> P10_PWR
        BUCK --> TOUCH_PWR
    end

    subgraph Peripherals_Connected_To_Pi ["Raspberry Pi 4 Interfaces"]
        LORA["LoRa SX1302 / SX1276 Gateway Module<br/>(SPI0 + GPIO22 RST + GPIO25 DIO0)"]
        SENSORS["I2C Bus: INA219 + ADS1115 ADC<br/>(Rain, Water Level Sensors)"]
        TEMP["1-Wire: DS18B20 Temp Sensor<br/>(GPIO4 + 4.7k Pull-up)"]
        RST_BTN["Tactile Reset / Mute Button<br/>(GPIO26 to GND)"]
        AUDIO_OUT["PAM8610 / Active Speaker<br/>(3.5mm Analog Audio Out)"]
        AUDIO_IN["USB Microphone<br/>(Pi USB 2.0 Port)"]
        TOUCH_DATA["DSI Ribbon Cable<br/>(Direct Pi DSI Port - 0 GPIOs used)"]

        PI4 --> LORA
        PI4 --> SENSORS
        PI4 --> TEMP
        PI4 --> RST_BTN
        PI4 --> AUDIO_OUT
        PI4 --> AUDIO_IN
        PI4 --> TOUCH_DATA
        PI4 -.->|Logic Signals 3.3V| RELAY_BOARD
        PI4 -.->|HUB12 Data / Clock| P10_PWR
    end
```

---

## 2. Raspberry Pi 4 (40-Pin GPIO) Pinout Mapping

All 40 pins on the Raspberry Pi 4 header are assigned strictly to avoid hardware resource contention:
- **I2C1** (GPIO 2, 3) connects the INA219 (battery monitor) and ADS1115 (sensor ADC).
- **SPI0** (GPIO 8, 9, 10, 11) is dedicated to the LoRa transceiver.
- **1-Wire** (GPIO 4) is dedicated to the digital waterproof DS18B20 temperature probe.
- **HUB12** (GPIO 5, 6, 12, 13, 16, 19) drives the P10 outdoor display (GPIO 12 provides hardware PWM for dimming).
- **Relay/MOSFET control** (GPIO 17, 23, 24, 27) drives the siren and tri-colour lamps.
- **DSI Display Port & USB** are used for screen, microphone, and audio to preserve GPIO pins.

### Complete Pin Assignment Table

| Physical Pin | BCM GPIO | Function / Peripheral | Direction | Signal Type | Notes |
|:------------:|:--------:|:----------------------|:---------:|:-----------:|:------|
| **1** | — | **3.3V Rail** | OUT | DC Power | Supplies INA219, ADS1115, DS18B20, LoRa |
| **2** | — | **5V Rail (In/Out)** | IN/OUT | DC Power | 5V 5A Buck output feeds here (or USB-C) |
| **3** | **GPIO 2** | **I2C1 SDA** | BIDIR | 3.3V Logic | Shared: INA219 (`0x40`), ADS1115 (`0x48`) |
| **4** | — | **5V Rail** | — | DC Power | Paralleled with Pin 2 |
| **5** | **GPIO 3** | **I2C1 SCL** | OUT | 3.3V Logic | Shared: INA219 (`0x40`), ADS1115 (`0x48`) |
| **6** | — | **GND** | — | Ground | Common system logic ground |
| **7** | **GPIO 4** | **1-Wire Data** | BIDIR | 3.3V Logic | DS18B20 Temperature Sensor (4.7 kΩ pull-up) |
| **8** | **GPIO 14** | UART0 TXD | OUT | 3.3V Logic | Reserved / Optional Serial Debug |
| **9** | — | **GND** | — | Ground | Common system logic ground |
| **10** | **GPIO 15** | UART0 RXD | IN | 3.3V Logic | Reserved / Optional Serial Debug |
| **11** | **GPIO 17** | **Siren Trigger** | OUT | 3.3V Logic | High = Siren Relay / MOSFET ON |
| **12** | **GPIO 18** | PCM CLK / Spare | — | — | Spare |
| **13** | **GPIO 27** | **Tower Light RED** | OUT | 3.3V Logic | High = Red Lamp Active (SOS / Danger) |
| **14** | — | **GND** | — | Ground | Common ground |
| **15** | **GPIO 22** | **LoRa Reset (RST)** | OUT | 3.3V Logic | Active LOW hardware reset pulse |
| **16** | **GPIO 23** | **Tower Light AMBER** | OUT | 3.3V Logic | High = Amber Lamp Active (Warning/Alert) |
| **17** | — | **3.3V Rail** | — | DC Power | Auxiliary 3.3V |
| **18** | **GPIO 24** | **Tower Light GREEN** | OUT | 3.3V Logic | High = Green Lamp Active (Normal / OK) |
| **19** | **GPIO 10** | **SPI0 MOSI** | OUT | 3.3V Logic | LoRa Transceiver Data In |
| **20** | — | **GND** | — | Ground | Common ground |
| **21** | **GPIO 9** | **SPI0 MISO** | IN | 3.3V Logic | LoRa Transceiver Data Out |
| **22** | **GPIO 25** | **LoRa DIO0 (RxDone)**| IN | 3.3V Logic | Interrupt on packet reception |
| **23** | **GPIO 11** | **SPI0 SCLK** | OUT | 3.3V Logic | LoRa SPI Clock |
| **24** | **GPIO 8** | **SPI0 CE0 (NSS)** | OUT | 3.3V Logic | LoRa Chip Select (Active LOW) |
| **25** | — | **GND** | — | Ground | Common ground |
| **26** | **GPIO 7** | SPI0 CE1 / Spare | — | — | Reserved for 2nd LoRa channel |
| **27** | **GPIO 0** | ID_SD | — | Reserved | HAT EEPROM Identification (Do not use) |
| **28** | **GPIO 1** | ID_SC | — | Reserved | HAT EEPROM Identification (Do not use) |
| **29** | **GPIO 5** | **P10 Row A** | OUT | 3.3V/5V Logic| HUB12 Row Address Bit A |
| **30** | — | **GND** | — | Ground | Common ground |
| **31** | **GPIO 6** | **P10 Row B** | OUT | 3.3V/5V Logic| HUB12 Row Address Bit B |
| **32** | **GPIO 12** | **P10 Enable (OE)** | OUT | 3.3V/5V Logic| HUB12 Output Enable (Hardware PWM dimming) |
| **33** | **GPIO 13** | **P10 Clock (CLK)** | OUT | 3.3V/5V Logic| HUB12 Shift Register Clock |
| **34** | — | **GND** | — | Ground | Common ground |
| **35** | **GPIO 19** | **P10 Latch (LAT)** | OUT | 3.3V/5V Logic| HUB12 Strobe / Latch Pulse |
| **36** | **GPIO 16** | **P10 Data (R)** | OUT | 3.3V/5V Logic| HUB12 Serial Pixel Data |
| **37** | **GPIO 26** | **Reset / Silence BTN**| IN | 3.3V Logic | Active LOW button (Mute alarm / Reset state) |
| **38** | **GPIO 20** | Spare / GPIO | — | — | Available expansion |
| **39** | — | **GND** | — | Ground | Common ground |
| **40** | **GPIO 21** | Spare / GPIO | — | — | Available expansion |

---

## 3. High-Power 12V Actuator Drivers (Siren & Stack Light)

The industrial siren consumes up to **1.5A at 12V DC** (18W inductive load), while each tier of the industrial stack light consumes **150–200mA at 12V DC**. The Raspberry Pi GPIOs output 3.3V with a maximum current limit of 16mA per pin. Driving 12V loads requires galvanic optocoupled isolation.

### 3.1 Actuator Driver Schematic

```
          +12V Battery Rail (Protected by 5A Fuse F2)
               │
       ┌───────┴───────────────────────────────┐
       │                                       │
    [+]│                                    [+]│
   ┌───┴───┐                              ┌────┴────┐
   │ SIREN │ (Inductive Load)             │ 12V LAMP│ (Resistive / LED)
   └───┬───┘                              └────┬────┘
       │     Flyback Diode                     │
       ├─────◄──[ 1N5408 ]──┐                  │
       │                    │                  │
    [Drain]              [+12V]             [Drain]
   ┌───────┐                               ┌───────┐
   │ Q1    │ N-MOSFET                      │ Q2-Q4 │ N-MOSFET / Relay
   │IRLZ44N│ (Logic Level)                 │2N7002/│ (e.g. ULN2803 or
   └───┬───┘                               │IRLZ44N│  4-Ch Opto Relay)
       │                                   └───┬───┘
   [Source]                                    │
       │                                   [Source]
       ├───────────────────────────────────────┴────────┐
       │                                                │
      GND (12V Power Ground)                       GND (Common)

      Gate Drive Circuit (Per Channel):
      
      Pi GPIO (3.3V) ────[ 220 Ω ]────┐
                                      │
                                ┌─────┴─────┐
                                │ Anode     │ (PC817 Optocoupler)
                                │   ┌─►     │
                                │   └─►     │
                                │ Cathode   │
                                └─────┬─────┘
                                      │
      Pi GND ─────────────────────────┘
      
      +12V Rail ──────[ 4.7 kΩ Pull-up ]───┐
                                           │
                                     ┌─────┴─────┐
                                     │ Collector │
                                     │           │
                                     │ Emitter   │
                                     └─────┬─────┘
                                           ├───────────► MOSFET Gate
                                           │
                                     [ 10 kΩ Gate Pull-Down ]
                                           │
      12V Power GND ───────────────────────┴───────────► MOSFET Source
```

### 3.2 Design Rules for Drivers:
1. **Flyback Protection:** The siren has an inductive motor/horn coil. A **1N5408 (3A 1000V)** fast recovery diode must be connected across the siren's positive and negative terminals with the cathode pointing to +12V. Failure to install this will destroy the MOSFET due to back-EMF voltage spikes.
2. **Optocoupler Isolation:** Optocouplers (PC817) isolate the sensitive Raspberry Pi CPU from ground loops and inductive switching transients generated by the 115dB siren.
3. **Logic-Level Gates:** If using discrete MOSFETs, specify **IRLZ44N** (logic-level gate threshold $V_{GS(th)} \approx 1.0\text{V}-2.0\text{V}$) rather than standard IRFZ44N ($V_{GS} \approx 4.0\text{V}-10\text{V}$) to guarantee full saturation.

---

## 4. P10 Outdoor LED Board Driver Option

The P10 LED display board ($32 \times 16$ pixels, outdoor red or full-color) utilizes the standard **HUB12** (single color) or **HUB75** (RGB) synchronous multiplexed interface:
- **Pins:** `A`, `B` (1/4 scan row multiplexing), `CLK` (shift clock), `LAT`/`STB` (latch row register), `OE` (output enable / PWM brightness), `DATA`/`R` (serial pixel stream).

### 4.1 Evaluation of Driving Methods on Raspberry Pi 4

| Method | Implementation | Pros | Cons | Recommendation |
|---|---|---|---|---|
| **Option A: Pure Software GPIO Bit-banging** | Direct Python/C script writing to GPIO | Easy to prototype | High CPU load; noticeable display flicker caused by Linux kernel multitasking. | **Not suitable for production** |
| **Option B: DMA Hardware Library (`rpi-rgb-led-matrix`)** | C++ library using Pi DMA engine + GPIO hardware registers | Very smooth, 0% CPU overhead on frame rendering, high refresh rate. | Requires root privileges; binds GPIOs rigidly. | **Good for direct single-board builds** |
| **Option C: Dedicated Microcontroller Bridge (ESP32 via USB-UART) — (Recommended)** | ESP32 coprocessor receives formatted text via USB serial from Pi and drives HUB12 natively | **Rock-solid refresh; 0% Pi CPU load; no kernel jitter; independent watchdog; modular field servicing** | Adds a low-cost ($3) ESP32 module | **RECOMMENDED FOR QUICKRESCUE** |

### 4.2 Why Option C (or DMA Direct) is Chosen:
For Smart India Hackathon and real disaster field deployment, **Option C** (or direct DMA driver with level-shifting) prevents the P10 from freezing or flickering when the Raspberry Pi 4 is heavily loaded executing audio speech recognition, database sync, and cryptographic packet decryption.

If wired directly to the Pi 4:
- Use **74HCT245** Octal Bus Transceiver to level-shift Raspberry Pi 3.3V logic signals up to 5.0V required by the P10 HUB12 input buffers.
- Feed **GPIO 12 (PWM0)** to the `OE` (Output Enable) line for hardware PWM dimming based on ambient light sensor data.

---

## 5. Battery & Solar Monitoring Point

Continuous monitoring of solar yield, battery voltage, and current draw is essential to prevent tower brownouts and calculate runtime reserves.

### 5.1 Measurement Circuit via INA219 (I2C)

```
       MPPT Battery Output (+) 
                 │
                 ▼
       ┌────────────────────────┐
       │   INA219 Board (0x40)  │
       │                        │
       │   VIN+ ──[ 0.1 Ω ]── VIN- ──► Inline 15A Fuse ──► LiFePO4 (+)
       │          Shunt         │
       │                        │
       │   VCC ───────► Pi 3.3V │
       │   GND ───────► Pi GND  │
       │   SDA ───────► GPIO 2  │
       │   SCL ───────► GPIO 3  │
       └────────────────────────┘
```

- **High-Side Sensing:** The INA219 is installed on the **positive rail** between the MPPT charger and the 12.8V LiFePO4 battery terminals.
- **Bi-Directional Current:**
  - Positive Current ($+I$): Solar panel is charging the battery.
  - Negative Current ($-I$): System is discharging battery (night/cloud cover).
- **Measurement Ranges:**
  - Bus Voltage: 0V to 26V DC (resolution: 4 mV)
  - Current: Up to $\pm 3.2\text{A}$ with standard $0.1\Omega$ shunt (expandable to 32A with $0.01\Omega$ shunt).
  - Telemetry is logged every 5 seconds to the local SQLite database and published to the cloud dashboard.

---

## 6. Environmental Sensors Wiring (Rain, Flood Level, Temperature)

To alert citizens to impending flash floods, rising water, or overheating equipment:

### 6.1 ADS1115 16-Bit I2C ADC (Address `0x48`)
The Raspberry Pi 4 does not have built-in analog inputs. An **ADS1115** connects via the shared I2C bus:
- **A0 Input:** Rain / Precipitation Sensor (0–3.3V analog output).
- **A1 Input:** Hydrostatic / Submersible Water Level Probe ($0\text{--}3.3\text{V}$, mapped to $0\text{--}5000\text{ mm}$ water depth).
- **A2 Input:** Auxiliary solar panel voltage divider ($R_1=100\text{ k}\Omega, R_2=10\text{ k}\Omega$).
- **A3 Input:** Spare analog channel.

### 6.2 DS18B20 1-Wire Temperature Sensor
- **VCC:** 3.3V (Pin 1)
- **GND:** GND (Pin 9)
- **DATA:** GPIO 4 (Pin 7) with a **4.7 kΩ pull-up resistor** between DATA and 3.3V.
- Provides ambient air temperature and battery enclosure thermal monitoring.

---

## 7. Safety, Protection & Enclosure Engineering

```
                      ENCLOSURE SCHEMATIC & AIRFLOW
         ┌────────────────────────────────────────────────────────┐
         │                                                        │
         │   [IP65 Rain Hood + Stainless Mesh + Dust Filter]      │
         │                  ▲ (Exhaust Fan)                       │
         │                  │                                     │
         │      ┌───────────────────────┐                         │
         │      │ Raspberry Pi 4 (8GB)  │                         │
         │      │ Aluminum Armor Case   │                         │
         │      └───────────────────────┘                         │
         │                                                        │
         │      ┌───────────────────────┐                         │
         │      │ 12V -> 5V Buck Conv.  │                         │
         │      │ Heatsink Mounted      │                         │
         │      └───────────────────────┘                         │
         │                                                        │
         │   ┌─────────────────────────────┐                      │
         │   │ 12.8V 20Ah LiFePO4 Battery  │                      │
         │   │ (Sealed Plastic Housing)    │                      │
         │   └─────────────────────────────┘                      │
         │                  ▲                                     │
         │                  │                                     │
         │   [Bottom Intake Louver + Bug Mesh + Hydrophobic Gasket│
         └────────────────────────────────────────────────────────┘
```

### 7.1 Overcurrent Protection (Fuse Schedule)
1. **Fuse F1 (Battery Main):** 15A Automotive Blade Fuse placed $< 10\text{ cm}$ from the LiFePO4 positive terminal. Protects against dead shorts and fire hazard.
2. **Fuse F2 (12V Actuator Rail):** 5A Fast-Blow Fuse dedicated to the siren and tri-colour tower light.
3. **Fuse F3 (5V Step-Down Buck):** 3A Inline Fuse on the input of the 12V-to-5V buck converter.

### 7.2 Reverse Polarity Protection
- The MPPT controller features internal solid-state MOSFET reverse-polarity detection on both PV and Battery terminals.
- On the 12V-to-5V buck converter input, a **10A Schottky diode (e.g., MBR1045)** or P-channel MOSFET reverse protection circuit prevents damage if wiring is reversed during field maintenance.

### 7.3 Thermal & Moisture Ventilation (IP65 Outdoor Standards)
- **Enclosure:** Polycarbonate or die-cast aluminum enclosure with silicone perimeter O-ring.
- **Airflow:** Convection chimney design with downward-facing hooded vents at the base (intake) and top (exhaust) equipped with gore-tex breathable membrane / stainless steel insect mesh.
- **Battery Safety:** LiFePO4 chemistry is thermally stable (does not undergo thermal runaway like standard Li-ion NCA/NMC). The internal BMS provides low-temperature charge cutoff ($0^\circ\text{C}$) and high-temperature cutoff ($60^\circ\text{C}$).
- **Cable Glands:** All wiring passes through bottom-entry **M16/M20 IP68 cable glands** with drip loops to prevent water tracking along wires into the enclosure.
