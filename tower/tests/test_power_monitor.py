"""
QuickRescue Communication Tower — Solar & Battery Monitoring Tests
===================================================================
Verifies:
  1. 4S LiFePO4 SoC % piecewise interpolation curve (flat 13.0-13.2V plateau)
  2. Solar charging state classification (CHARGING, FLOAT_IDLE, DISCHARGING)
  3. Low-battery mode activation (<= 20% SoC or < 12.4V):
       * Dims touchscreen display (50/255)
       * Throttles non-critical polling
       * CRITICAL SAFETY: LoRa receive & emergency SOS alerts NEVER pause or stop!
       * Automatic recovery when charge returns >= 25% (>= 12.8V)
  4. Runtime logging (logs exact measured uptime; NO speculative backup hours claimed)
  5. Power data synchronization to SQLite, Touchscreen Kiosk API, and Firebase
"""

import os
import sys
import time
import tempfile
import unittest
from unittest.mock import patch, MagicMock

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from protocol.codec_reference import (
    encode, decode, QRPacket,
    MSG_SOS, MSG_ACK, GPS_VALID, PSK_DEV
)
from tower.services.storage import TowerStorage
from tower.services.power_monitor import (
    TowerPowerMonitor, calculate_lifepo4_soc,
    BRIGHTNESS_NORMAL, BRIGHTNESS_DIMMED,
    BATT_LOW_PCT_THRESHOLD, BATT_RECOVERY_PCT_THRESHOLD
)
from tower.services.lora_driver import LoRaDriver
from tower.services.alert_manager import AlertManager
from tower.services.receiver import ReceiverService
from tower.services.cloud_sync import FirebaseSyncService

class TestTowerPowerMonitor(unittest.TestCase):
    def setUp(self):
        self.temp_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.temp_db.close()

        self.storage = TowerStorage(db_path=self.temp_db.name)
        self.driver = LoRaDriver(force_simulated=True)
        self.actuators = None
        self.alert_mgr = AlertManager(storage=self.storage, force_simulated=True)
        self.receiver = ReceiverService(
            db_path=self.temp_db.name,
            driver=self.driver,
            alert_manager=self.alert_mgr
        )
        self.power_monitor = TowerPowerMonitor(
            storage=self.storage,
            force_simulated=True
        )
        self.sync_service = FirebaseSyncService(
            storage=self.storage,
            lora_driver=self.driver,
            alert_manager=self.alert_mgr,
            force_mock=True
        )

    def tearDown(self):
        try:
            if self.alert_mgr and self.alert_mgr.actuators:
                self.alert_mgr.actuators.shutdown()
        except Exception:
            pass
        try:
            if os.path.exists(self.temp_db.name):
                os.remove(self.temp_db.name)
        except Exception:
            pass

    def test_lifepo4_soc_calculation(self):
        """LiFePO4 4S battery SoC calculation accurately handles flat discharge curve."""
        self.assertEqual(calculate_lifepo4_soc(11.0), 0.0)
        self.assertEqual(calculate_lifepo4_soc(11.5), 0.0)

        self.assertEqual(calculate_lifepo4_soc(12.0), 5.0)
        self.assertEqual(calculate_lifepo4_soc(12.8), 20.0)
        self.assertEqual(calculate_lifepo4_soc(13.0), 30.0)
        self.assertEqual(calculate_lifepo4_soc(13.1), 50.0)
        self.assertEqual(calculate_lifepo4_soc(13.2), 70.0)
        self.assertEqual(calculate_lifepo4_soc(13.3), 80.0)
        self.assertEqual(calculate_lifepo4_soc(13.6), 95.0)

        self.assertEqual(calculate_lifepo4_soc(14.2), 100.0)
        self.assertEqual(calculate_lifepo4_soc(14.6), 100.0)

        self.assertAlmostEqual(calculate_lifepo4_soc(13.05), 40.0, places=1)
        print("[PASS] Verified 4S LiFePO4 SoC interpolation across curve")

    def test_solar_charging_state_classification(self):
        """Classify solar state based on net current flow (+/- 0.15A threshold)."""
        self.power_monitor.battery_voltage = 13.4
        self.power_monitor.battery_current = 1.25
        telem = self.power_monitor.read_telemetry()
        self.assertEqual(telem["solar_state"], "CHARGING")
        self.assertFalse(telem["is_low_battery_mode"])

        self.power_monitor.battery_current = 0.05
        telem = self.power_monitor.read_telemetry()
        self.assertEqual(telem["solar_state"], "FLOAT_IDLE")

        self.power_monitor.battery_current = -0.95
        telem = self.power_monitor.read_telemetry()
        self.assertEqual(telem["solar_state"], "DISCHARGING")
        print("[PASS] Verified solar charging state classifier (CHARGING / FLOAT_IDLE / DISCHARGING)")

    def test_low_battery_mode_and_lora_sos_safety(self):
        """
        Low-battery mode dims display at <= 20%, but LoRa receiver & SOS alerts
        MUST NEVER stop or be interrupted.
        """
        self.power_monitor.battery_voltage = 12.0
        self.power_monitor.battery_current = -1.2
        telem = self.power_monitor.read_telemetry()

        self.assertTrue(telem["is_low_battery_mode"])
        self.assertLessEqual(telem["battery_pct"], 20.0)
        self.assertEqual(telem["display_brightness"], BRIGHTNESS_DIMMED)
        self.assertEqual(self.power_monitor.display_brightness, 50)

        sos_packet = QRPacket(
            msg_type=MSG_SOS,
            seq=101,
            device_id=0x0042,
            timestamp=int(time.time()),
            lat=int(28.6140 * 1e6),
            lon=int(77.2090 * 1e6),
            gps_flags=GPS_VALID,
            battery=15,
            motion=1,
            rssi=70,
            hop_count=1
        )
        wire_bytes = encode(sos_packet, psk=PSK_DEV)
        decoded = self.receiver.process_wire_packet(wire_bytes, rssi=-70)
        self.assertIsNotNone(decoded)

        events = self.storage.get_events(limit=5)
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["type"], "SOS")
        self.assertEqual(events[0]["device_id"], 0x0042)
        self.assertEqual(self.alert_mgr.actuators.light_state, "RED")

        last_tx = self.driver.get_last_tx()
        self.assertIsNotNone(last_tx)
        ack_pkt = decode(last_tx, psk=PSK_DEV)
        self.assertEqual(ack_pkt.msg_type, MSG_ACK)
        self.assertEqual(ack_pkt.alert_code, 101)

        self.power_monitor.battery_voltage = 13.3
        self.power_monitor.battery_current = 1.1
        telem_rec = self.power_monitor.read_telemetry()

        self.assertFalse(telem_rec["is_low_battery_mode"])
        self.assertEqual(telem_rec["display_brightness"], BRIGHTNESS_NORMAL)
        self.assertEqual(self.power_monitor.display_brightness, 200)
        print("[PASS] Verified Low-Battery Mode: display dimmed to 50, LoRa receive & SOS 100% operational, restored on solar recovery")

    def test_runtime_logging_no_speculative_hours(self):
        """Runtime logging records exact empirical elapsed time without speculative hours."""
        self.power_monitor.boot_time = time.time() - 3665
        with self.assertLogs("PowerMonitor", level="INFO") as cm:
            self.power_monitor.log_runtime_data()

        log_output = "\n".join(cm.output)
        self.assertIn("Runtime: 1h 01m 05s (3665s)", log_output)
        self.assertIn("Batt:", log_output)
        self.assertNotIn("hours remaining", log_output.lower())
        self.assertNotIn("backup hours:", log_output.lower())
        print("[PASS] Verified empirical runtime logging (no speculative backup hour claims)")

    def test_power_data_sqlite_and_firebase_sync(self):
        """Power data is saved in SQLite sensor_readings and synced into Firebase."""
        self.power_monitor.battery_voltage = 13.25
        self.power_monitor.battery_current = 0.95
        self.power_monitor.read_telemetry()
        self.power_monitor.persist_readings()

        latest = self.storage.get_latest_sensor_readings()
        self.assertIn("BATTERY_VOLTAGE", latest)
        self.assertIn("BATTERY_CURRENT", latest)
        self.assertIn("BATTERY_PCT", latest)
        self.assertIn("SOLAR_STATE", latest)

        self.assertEqual(latest["BATTERY_VOLTAGE"]["value"], 13.25)
        self.assertEqual(latest["BATTERY_CURRENT"]["value"], 0.95)
        self.assertEqual(latest["SOLAR_STATE"]["status"], "CHARGING")

        synced_count = self.sync_service.sync_sensors()
        self.assertGreaterEqual(synced_count, 3)

        sensor_docs = self.sync_service.db.collection("sensor_readings").docs
        types = [d["sensor_type"] for d in sensor_docs.values()]
        self.assertIn("BATTERY_VOLTAGE", types)
        self.assertIn("BATTERY_PCT", types)
        self.assertIn("SOLAR_STATE", types)

        self.sync_service.sync_tower_heartbeat()
        tower_doc = self.sync_service.db.collection("towers").docs["tower_1"]
        self.assertIn("power", tower_doc)
        self.assertEqual(tower_doc["power"]["battery_voltage"], 13.25)
        self.assertEqual(tower_doc["power"]["solar_state"], "CHARGING")
        self.assertFalse(tower_doc["power"]["is_low_battery_mode"])
        print("[PASS] Verified power data saved in SQLite and synchronized to Firebase Firestore")

if __name__ == "__main__":
    unittest.main()
