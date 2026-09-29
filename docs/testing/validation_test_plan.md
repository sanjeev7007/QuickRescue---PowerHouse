# QuickRescue — Validation Test Plan & Empirical Result Protocol
**Document Version:** 1.0  
**Target Architecture:** QuickRescue Tower Gateway (RPi 4), Wearable Handy Devices (ESP32 + SX1276), React Ground Control  
**Regulatory Standards:** India Wireless Planning & Coordination (WPC) 865–867 MHz Band GSR 564(E)  
**Strict Reporting Rule:** *Report ONLY empirically measured values from field logs and instrumentation. All theoretical engineering specifications are strictly marked as "Target, not yet validated" until field verification.*

---

## 1. Scope & Test Summary

This test plan defines the standardized procedures, test setups, measurement methodologies, and data collection protocols for the 8 mandatory empirical validation tests defined in the QuickRescue Technical Document:

1. **Offline Communication:** Disable mobile/internet; verify local message exchange across Tower, Kiosk, and Handy Devices.
2. **Emergency Delivery:** Send repeated SOS distress packets; record delivery rate, retry count, and ACK latency.
3. **Communication Range:** Measure usable communication distance across representative environments (Urban Dense, Forest/Hilly, Open Field).
4. **Battery Operation:** Run Handy Devices and Tower Gateway on battery power alone; record operational runtime to cutoff.
5. **Solar Recovery:** Discharge battery and record solar charge recovery current, voltage curve, and percentage gain.
6. **Multiple Devices:** Deploy several field nodes simultaneously; record concurrent device count, channel collisions, and throughput.
7. **Failure Recovery:** Sever primary relay node in active mesh; measure dynamic multi-hop rerouting time and packet recovery.
8. **Environmental:** Evaluate physical enclosure, ingress protection (water/dust spray), and thermal performance under field conditions.

---

## 2. Test Procedures (Setup, Steps, Measurement)

### Test 1: Offline Communication Test
- **Objective:** Verify that 100% of core emergency functions operate locally when cellular, WAN, and internet links are severed.
- **Hardware & Software Setup:**
  - 1x QuickRescue Tower Gateway powered on.
  - WAN Ethernet cable physically disconnected from Raspberry Pi.
  - Disable 4G/LTE cellular dongle and Wi-Fi uplink (`sudo nmcli radio wifi off && sudo nmcli radio wwan off`).
  - 2x Handy Devices (1 Field Node `0x0042`, 1 Master Jacket `0x0020`).
- **Step-by-Step Procedure:**
  1. Boot Tower Gateway. Verify offline status on local 7" touchscreen: `NETWORK: OFFLINE (LOCAL ONLY)`.
  2. From Handy Device `0x0042`, send a `SAFE` check-in (1s press).
  3. Verify Handy Device OLED screen displays `ACK: OK (Tower 01)`.
  4. Inspect Tower Touchscreen: verify device `0x0042` appears in the Active Device list.
  5. From Handy Device `0x0042`, hold SOS button for 3 seconds.
  6. Verify Tower industrial siren pulses, RED strobe turns on, P10 matrix displays distress text, and touchscreen flashes SOS banner.
  7. On Tower touchscreen, tap "ACKNOWLEDGE" and then "RESOLVE".
  8. From Tower touchscreen, trigger a manual voice query: "What are the active alerts?". Verify spoken response through local speaker.
  9. Inspect SQLite database: verify event stored in `events` and queued in `sync_queue` with status `'PENDING'`.
- **How to Measure:**
  - **Tool:** SQLite CLI (`sqlite3 tower.db "SELECT id, type, priority, status, synced FROM events;"`).
  - **Metric:** Packet delivery boolean (`True`/`False`), local ACK roundtrip latency (ms), actuator response time (ms).
  - **Target Criteria:** Zero packet drops on local RF; local ACK within $<250\text{ms}$; 100% of alerts buffered locally. (Target: "Target, not yet validated").

---

### Test 2: Emergency Delivery Test (SOS Reliability)
- **Objective:** Measure packet delivery rate and latency for high-priority emergency distress packets under repetitive load.
- **Hardware & Software Setup:**
  - 1x Tower Gateway with logging enabled.
  - 1x Handy Device configured to send consecutive SOS packets with sequence counter $1 \dots N$ ($N = 100$).
  - RF Configuration: 866.0 MHz, SF10, BW 125 kHz, CR 4/5, +17 dBm.
- **Step-by-Step Procedure:**
  1. Position Handy Device at a fixed standoff distance ($500\text{m}$ line-of-sight).
  2. Initiate test script on Handy Device or execute automated burst simulator: transmit 100 SOS distress packets spaced at 10-second intervals.
  3. Handy Device logs sequence number, transmit timestamp ($t_{\text{tx}}$), and ACK arrival timestamp ($t_{\text{ack}}$).
  4. Tower receiver logs sequence number, receive timestamp ($t_{\text{rx}}$), RSSI (dBm), and SNR (dB).
  5. Count total packets received at Tower Gateway ($N_{\text{recv}}$) and total ACKs received by Handy Device ($N_{\text{ack}}$).
- **How to Measure:**
  - **Formula:**
    $$\text{Packet Delivery Rate (PDR)} = \left(\frac{N_{\text{recv}}}{N_{\text{sent}}}\right) \times 100\%$$
    $$\text{Average Latency} = \frac{1}{N_{\text{ack}}} \sum_{i=1}^{N_{\text{ack}}} (t_{\text{ack}, i} - t_{\text{tx}, i})$$
  - **Metric:** PDR (%), Average Roundtrip Latency (ms), Duplicate Rate (%).
  - **Target Criteria:** $\text{PDR} \ge 98\%$, Latency $< 500\text{ms}$. (Target: "Target, not yet validated").

---

### Test 3: Communication Range Test
- **Objective:** Empirically establish maximum usable line-of-sight and obstructed LoRa communication distance per hop across representative terrain.
- **Hardware & Software Setup:**
  - 1x Tower Gateway positioned at base station (antenna height: 3m above ground level).
  - 1x Mobile Handy Device with GPS fix logging packets every 100m.
  - Calibrated GPS logger / smartphone mapping app.
  - Three test terrains:
    - **Environment A (Open Rural / Water Body):** Unobstructed Fresnel zone.
    - **Environment B (Dense Foliage / Forest / Hilly):** Severe tree canopy and hillside slope absorption.
    - **Environment C (Urban / Semi-Urban Concrete):** Multi-story reinforced concrete structures.
- **Step-by-Step Procedure:**
  1. Start at base station ($0\text{m}$). Verify baseline RSSI ($> -70\text{dBm}$) and SNR ($> +8\text{dB}$).
  2. Responder moves outwards along designated path, stopping every 250m to transmit a 10-packet test burst.
  3. At each stop, record: GPS distance from Tower (m), RSSI (dBm), SNR (dB), and successful ACK count (out of 10).
  4. Continue moving outward until Packet Error Rate (PER) exceeds 50% or SNR drops below $-15\text{dB}$.
  5. Record the last distance where $\text{PER} \le 10\%$ as the **Maximum Usable Range**.
- **How to Measure:**
  - **Tool:** Haversine GPS distance calculation between Tower GPS and Handy Device GPS fix.
  - **Metric:** Maximum distance (km), RSSI vs Distance curve, Link Margin ($\text{dB}$).
  - **Target Criteria:** Open terrain target: 10 km per hop; Dense forest target: 2–3 km. (Target: "Target, not yet validated").

---

### Test 4: Battery Operation Test (Runtime to Cutoff)
- **Objective:** Measure continuous operating runtime on internal battery packs without external mains or solar charging.
- **Hardware & Software Setup:**
  - **Sub-test 4A (Handy Device):** 3.7V 2000mAh Li-ion 18650 cell, charged to $4.20\text{V}$ (100%).
    - Normal responder operational profile: 1 HEARTBEAT/min + GPS polling every 5s + OLED on for 10s every 5 min.
  - **Sub-test 4B (Tower Gateway):** 12V LiFePO4 battery pack, fully charged to $14.4\text{V}$.
    - Solar input disconnected.
    - Normal gateway operational profile: Continuous LoRa RX + 10 sensor reads/hour + periodic touchscreen display.
- **Step-by-Step Procedure:**
  1. Disconnect all external chargers and solar panels. Record start time $T_0$.
  2. On Handy Device: record starting battery voltage ($V_{\text{batt}} = 4.20\text{V}$) via multimeter and ADC telemetry.
  3. On Tower: run `power_monitor.py` service logging voltage, current draw (A), and battery percentage every 60 seconds into `sensor_readings` table.
  4. Allow systems to run continuously until automatic low-battery cutoff:
     - Handy Device cutoff: $3.00\text{V}$ (BATT_MV_EMPTY).
     - Tower cutoff: $10.50\text{V}$ (BMS low-voltage protection cutoff).
  5. Record shutdown timestamp $T_{\text{end}}$.
- **How to Measure:**
  - **Formula:** $\text{Runtime} = T_{\text{end}} - T_0$ (Hours).
  - **Metric:** Total Operating Hours, Average Current Consumption ($\text{mA}$), Low-Battery Mode Activation Voltage.
  - **Target Criteria:** Handy Device target: $>24\text{h}$; Tower target: $48\text{--}72\text{h}$ backup. (Target: "Target, not yet validated").

---

### Test 5: Solar Recovery Test
- **Objective:** Quantify battery charge recovery rate from a discharged state using the 20W solar panel and MPPT charge controller under real daylight conditions.
- **Hardware & Software Setup:**
  - QuickRescue Tower Gateway with 12V LiFePO4 battery discharged to $20\%$ state of charge ($V_{\text{batt}} \approx 11.8\text{V}$).
  - 20W Monocrystalline Solar Panel mounted on adjustable mast.
  - INA219 / INA226 hardware current/voltage sensor on solar input and battery charging rail.
  - Calibrated solar lux/irradiance meter ($\text{W/m}^2$).
- **Step-by-Step Procedure:**
  1. Position solar panel facing South at $30^\circ$ tilt angle in open sunlight.
  2. Measure solar irradiance (e.g. $750\text{ W/m}^2$ clear noon sun).
  3. Connect solar panel to MPPT controller input. Record start timestamp $T_{\text{start}}$ and initial voltage $V_0$.
  4. Log charging parameters every 5 minutes for 4 continuous hours:
     - Solar Panel Voltage ($V_{\text{pv}}$) and Solar Current ($I_{\text{pv}}$)
     - Battery Voltage ($V_{\text{batt}}$) and Net Charging Current ($I_{\text{charge}}$)
     - State of Charge ($\%$)
  5. Record net battery percentage gained ($\Delta\%$) and total energy delivered ($\text{Wh}$).
- **How to Measure:**
  - **Formula:**
    $$\text{Energy Harvested (Wh)} = \int_{T_{\text{start}}}^{T_{\text{end}}} V_{\text{batt}}(t) \cdot I_{\text{charge}}(t) \, dt$$
  - **Metric:** Charging current ($\text{A}$), Voltage recovery rate ($\text{V/hr}$), Net State of Charge gain ($\%/\text{hr}$).
  - **Target Criteria:** Net positive charging during daylight while actively operating. (Target: "Target, not yet validated").

---

### Test 6: Multiple Devices Test (Fleet Concurrency & Collisions)
- **Objective:** Evaluate network scalability, packet collisions, and message reception performance when multiple Handy Devices transmit simultaneously.
- **Hardware & Software Setup:**
  - 1x Tower Gateway.
  - $N$ Handy Devices (deploy incrementally: $N = 5, 10, 20, 50$ using physical units and calibrated node simulators).
  - Radio configuration: 866.0 MHz, SF10, 125 kHz.
- **Step-by-Step Procedure:**
  1. Deploy $N$ devices within radio range of the Tower.
  2. Configure each device to transmit standard HEARTBEAT packets every 60 seconds with random CAD (Channel Activity Detection) backoff jitter ($20\text{--}80\text{ms}$).
  3. Simultaneously trigger 3 random nodes to send SOS distress packets.
  4. Monitor tower reception over a 30-minute observation window.
  5. Count: Total unique devices registered, total packets received, CRC error drops, and SOS preemption latency.
- **How to Measure:**
  - **Tool:** Tower API `/api/devices` and SQLite `tampered_packets` / `events` tables.
  - **Metric:** Active device registration count, Channel Collision Rate ($\%$), SOS Delivery Latency ($< 1\text{s}$).
  - **Target Criteria:** Scalability design target: $100+$ nodes supported per tower. (Target: "Target, not yet validated").

---

### Test 7: Failure Recovery Test (Mesh Self-Healing)
- **Objective:** Verify that when a relay node fails or loses power, the LoRa mesh automatically discovers an alternative route without dropping distress calls.
- **Hardware & Software Setup:**
  - 1x Tower Gateway (Node `0x0001`).
  - 1x End-node Handy Device (Node `0x0042`, positioned behind a physical obstruction such that it cannot reach the Tower directly).
  - 2x Relay Nodes (Relay A `0x0020` [Master Jacket] and Relay B `0x0021` [Alternative Field Relay]).
- **Step-by-Step Procedure:**
  1. Establish initial baseline route: Node `0x0042` $\to$ Relay A (`0x0020`) $\to$ Tower (`0x0001`). Verify Hop Count = 1, RSSI = $-74\text{dBm}$.
  2. Send periodic SAFE check-ins every 10 seconds to confirm steady route.
  3. **Simulate Catastrophic Node Failure:** Abruptly power off Relay A (cut battery or pull reset LOW).
  4. Node `0x0042` transmits an emergency `HELP` packet.
  5. Observe mesh behavior: Node `0x0042` broadcasts packet over air; Relay B (`0x0021`) hears the unacknowledged frame, decrements TTL, and forwards to Tower.
  6. Record timestamp of Relay A failure and timestamp of successful reception at Tower via Relay B.
- **How to Measure:**
  - **Formula:** $\text{Failover Recovery Time} = T_{\text{recv\_alt}} - T_{\text{fail}}$ (Seconds).
  - **Metric:** Route Re-convergence Time (s), Dropped Packets during failover, New Hop Count.
  - **Target Criteria:** Automatic dynamic rerouting with zero lost SOS packets; failover time $< 15\text{s}$. (Target: "Target, not yet validated").

---

### Test 8: Environmental & Hardware Ruggedness Test
- **Objective:** Verify enclosure durability, moisture resistance, connector sealing, and thermal stability in field conditions.
- **Hardware & Software Setup:**
  - Fully assembled Handy Device in custom IP-rated 3D-printed / injection-molded enclosure.
  - Tower Gateway sealed weatherproof outdoor enclosure.
  - Environmental chamber or field testing environment:
    - **Sub-test 8A (Moisture / Water Spray):** Direct water spray (simulating torrential rain, IP54/IP65 equivalent).
    - **Sub-test 8B (Thermal Operating Range):** Exposure to $-5^\circ\text{C}$ cold and $+45^\circ\text{C}$ direct sunlight heat.
    - **Sub-test 8C (Mechanical Vibration & Drop):** 1.2-meter drop onto packed soil / gravel.
- **Step-by-Step Procedure:**
  1. Power on device; verify active LoRa heartbeat and OLED display.
  2. **Water Ingress Test:** Subject enclosure to continuous water jet/spray at $10\text{ litres/min}$ for 10 minutes from all angles.
  3. Inspect for moisture ingress inside silicone gaskets, USB-C dust cap, and tactile switch boots.
  4. Verify OLED display readability, button responsiveness, and RF transmission after water exposure.
  5. **Drop Test:** Drop device 3 times from 1.2m height onto flat ground.
  6. Inspect PCB solder joints, antenna connector integrity, and battery clip retention.
  7. **Thermal Test:** Operate device at temperature extremes for 2 hours; log MCU frequency and LoRa crystal frequency drift.
- **How to Measure:**
  - **Tool:** Visual inspection, internal humidity sensor, RF power meter.
  - **Metric:** Ingress Rating achieved (e.g. IP54/IP65), Post-drop functional status (Operational / Non-operational).
  - **Target Criteria:** IP65 design target; functional after 1.2m drop; operational across $-10^\circ\text{C}$ to $+55^\circ\text{C}$. (Target: "Target, not yet validated").

---

## 3. Results Table Structure & Field Protocol

The companion CSV template (`docs/testing/validation_results_template.csv`) follows the exact schema requested:

```csv
test,date,location,conditions,config (SF/BW/power),result,notes
```

### Strict Reporting Rules for Field Engineers:
1. **Never enter unverified theoretical specs in the `result` column.**
2. If a test has not yet been executed in the field, explicitly record: `"Target, not yet validated: [specification]"`.
3. When field measurements are completed, replace the target string with the exact numerical value, unit, and sample size (e.g., `Measured: 4.8 km line-of-sight (PDR=96%, n=50)`).
4. All entries must specify exact RF parameters (`SF10 / 125kHz / +17dBm`) and local meteorological/environmental conditions.
