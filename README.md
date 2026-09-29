# QuickRescue

> **Offline Disaster Communication System**

---

## What is QuickRescue?

When natural disasters (floods, earthquakes, cyclones, landslides) destroy mobile towers and power grids, **QuickRescue** keeps rescue teams connected without mobile networks, internet, or expensive satellite phones.

It uses **LoRa radio waves (866 MHz)** to send emergency messages up to several kilometers through a mesh network.

---

## How It Works

```
[ Handy Device ] ---> [ Master Jacket ] ---> [ Base Tower ] ---> [ Web Dashboard ]
  (Wearable)             (Relay)            (Local Alerts)      (When Online)
```

1. **Handy Device (Wearable):** Worn by rescue workers or victims. Sends `SAFE`, `HELP`, or `SOS` with GPS location.
2. **Master Jacket (Relay):** Squad leader device that passes messages across hills and obstacles to the tower.
3. **Base Tower (Gateway):** Solar-powered station. Saves alerts offline, sounds a loud siren, turns on strobe lights, and shows alerts on a local touchscreen.
4. **Command Dashboard (Web):** When internet returns, alerts automatically sync to the cloud map and dashboard.

---

## Hardware & Cost

| Item | What It Does | Cost |
|---|---|:---:|
| **Handy Device** | ESP32 + LoRa + GPS + Battery + Buttons | **₹1,850** |
| **Base Tower** | Raspberry Pi 4 + LoRa + Solar + Battery + Siren + Screen | **₹12,685** |
| **Complete Squad Kit** | 1 Base Tower + 10 Handy Devices + Field Case | **≈ ₹60,000** |

---

## How to Use the Handy Device

- **🟢 SAFE Button:** Tap once (1 sec) to confirm you are safe.
- **🟡 HELP Button:** Hold for 2 seconds to request non-urgent assistance.
- **🔴 SOS Button:** Hold for 3 seconds to trigger emergency rescue (siren sounds at base tower).
- **Fall Detection:** The built-in motion sensor automatically alerts if someone falls or gets hit.

---

## Quick Setup Guide

### 1. Handy Device (ESP32)
```bash
cd firmware/handy-device
pio run -t upload
```

### 2. Base Tower (Raspberry Pi)
```bash
cd tower
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python -m services.api
```

### 3. Web Dashboard (React)
```bash
cd dashboard
npm install
npm run dev
```
Open **http://localhost:5173** in your browser.

---

## Project Structure

- `firmware/` — Code for the wearable ESP32 Handy Devices.
- `tower/` — Code for the Raspberry Pi base station, sensors, siren, and offline API.
- `dashboard/` — Code for the React web command center dashboard.
- `protocol/` — 56-byte secure LoRa packet specification.
- `docs/` — Hardware wiring diagrams and test results.

---

## Testing & Status

- **Offline Mode:** Tested & working (alerts save locally in SQLite with zero internet).
- **Online Sync:** Tested & working (syncs to Firebase when reconnected with no duplicates).
- **All Core Tests:** 22/22 tests passed.
- **Range & Battery Targets:** 10 km per hop and 48-hour battery are design targets to be validated in field trials.

---

## License

MIT License — Free and open-source for disaster management.
