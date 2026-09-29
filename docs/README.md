# QuickRescue Documentation Index

Welcome to the QuickRescue engineering and field documentation repository.

## Subsystems & References

### 1. Protocol & Communication
- [Protocol Wire Specification (`protocol/protocol_spec.md`)](file:///x:/SIH%202026/BHIM/protocol/protocol_spec.md) — 56-byte binary payload, AES-128 crypto layout, priority mappings, and CRC/CMAC validation.
- [Python Reference Codec (`protocol/codec_reference.py`)](file:///x:/SIH%202026/BHIM/protocol/codec_reference.py) — Cross-platform serialization engine.
- [C/C++ Reference Header (`protocol/codec_reference.h`)](file:///x:/SIH%202026/BHIM/protocol/codec_reference.h) — Embedded C struct and byte packing header.

### 2. Hardware Wiring & Electrical Schematics
- [Handy Device Wiring Guide (`docs/wiring/handy_device_wiring.md`)](file:///x:/SIH%202026/BHIM/docs/wiring/handy_device_wiring.md) — ESP32 pinouts, SX1276 SPI connections, GPS UART, MPU6050 I2C, battery ADC divider, and strapping pin safety.
- [Tower Gateway Wiring Guide (`docs/wiring/tower_wiring.md`)](file:///x:/SIH%202026/BHIM/docs/wiring/tower_wiring.md) — Raspberry Pi 4 GPIO pinout, 12V relay optocoupler, 100dB siren, P10 matrix, tri-colour strobe, and MPPT solar charging.

### 3. Cloud & Dashboard Architecture
- [Firebase Cloud Data Schema (`docs/firebase_schema.md`)](file:///x:/SIH%202026/BHIM/docs/firebase_schema.md) — Cloud Firestore collections (`events`, `devices`, `admin_broadcasts`, `tower_telemetry`, `mock_drills`), document formats, and indexing rules.

### 4. Verification, Testing & Empirical Results
- [Validation Test Plan (`docs/testing/validation_test_plan.md`)](file:///x:/SIH%202026/BHIM/docs/testing/validation_test_plan.md) — Detailed procedures and measurement formulas for the 8 core field validation tests.
- [Field Results Sheet Template (`docs/testing/validation_results_template.csv`)](file:///x:/SIH%202026/BHIM/docs/testing/validation_results_template.csv) — Standard CSV template ready for field test data entry.
- [End-to-End Integration Checklist (`docs/testing/integration_checklist.md`)](file:///x:/SIH%202026/BHIM/docs/testing/integration_checklist.md) — Step-by-step verification checklist and troubleshooting matrix for Steps 1–8.
- [Empirical Test Results (`docs/testing/test_results.md`)](file:///x:/SIH%202026/BHIM/docs/testing/test_results.md) — Recorded empirical logs and performance benchmarks.
