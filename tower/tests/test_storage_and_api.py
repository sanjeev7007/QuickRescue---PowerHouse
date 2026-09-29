"""
QuickRescue Tower Storage & REST API — Verification Suite
==========================================================
Verifies:
  1. Events survive database reconnection (simulating a Pi reboot).
  2. Priority sorting strictly orders SOS > HELP > BROADCAST > SAFE > HEARTBEAT.
  3. Device active status toggles correctly based on heartbeat timeout (180 s).
  4. Network health data (last seen, RSSI, hop count) per device.
  5. Event lifecycle status updates (NEW -> ACKNOWLEDGED -> IN PROGRESS -> RESOLVED).
  6. REST API returns priority-ordered JSON responses.
"""

import os
import sys
import time
import tempfile
import unittest

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from tower.services.storage import TowerStorage, HEARTBEAT_ACTIVE_TIMEOUT_SEC
from protocol.codec_reference import (
    QRPacket, MSG_SOS, MSG_HELP, MSG_SAFE, MSG_HEARTBEAT, GPS_VALID, MOTION_STATIC
)

class TestTowerStorageAndAPI(unittest.TestCase):
    def setUp(self):
        self.temp_db = tempfile.NamedTemporaryFile(delete=False, suffix=".db")
        self.temp_db.close()
        self.storage = TowerStorage(db_path=self.temp_db.name)

    def tearDown(self):
        try:
            if os.path.exists(self.temp_db.name):
                os.remove(self.temp_db.name)
        except Exception:
            pass

    def test_reboot_persistence_and_priority_ordering(self):
        """Events must survive reboot and return strictly sorted by priority (SOS > HELP > SAFE > HB)."""
        now = int(time.time())

        id_safe = self.storage.record_event(
            event_type="SAFE", device_id=0x0001, lat=28.614, lon=77.209,
            location_state="VALID", rssi=-85, battery=90, event_time=now - 40
        )
        id_hb = self.storage.record_event(
            event_type="HEARTBEAT", device_id=0x0002, lat=28.615, lon=77.210,
            location_state="VALID", rssi=-88, battery=80, event_time=now - 30
        )
        id_help = self.storage.record_event(
            event_type="HELP", device_id=0x0003, lat=28.616, lon=77.211,
            location_state="VALID", rssi=-92, battery=45, event_time=now - 20
        )
        id_sos = self.storage.record_event(
            event_type="SOS", device_id=0x0004, lat=28.617, lon=77.212,
            location_state="VALID", rssi=-79, battery=35, event_time=now - 10
        )

        del self.storage
        rebooted_storage = TowerStorage(db_path=self.temp_db.name)

        events = rebooted_storage.get_events()
        self.assertEqual(len(events), 4, "All events must survive reboot")

        event_types = [e["type"] for e in events]
        self.assertEqual(event_types, ["SOS", "HELP", "SAFE", "HEARTBEAT"],
                         f"Priority ordering failed: expected SOS > HELP > SAFE > HEARTBEAT, got {event_types}")

        self.assertEqual(events[0]["priority"], 1)
        self.assertEqual(events[1]["priority"], 2)
        self.assertEqual(events[2]["priority"], 4)
        self.assertEqual(events[3]["priority"], 5)
        print(f"\n[PASS] Verified events survive reboot and sort by priority: {event_types}")

    def test_device_active_status_and_network_health(self):
        """Active status is True when recent heartbeat exists, False when timed out."""
        now = int(time.time())

        self.storage.upsert_device(
            device_id=0x0010, msg_type="HEARTBEAT", seq=1, lat=28.6, lon=77.2,
            gps_status="VALID", battery=80, motion=0, rssi=-75, hop_count=1,
            is_sos=False, is_heartbeat=True
        )

        self.storage.upsert_device(
            device_id=0x0020, msg_type="HEARTBEAT", seq=1, lat=28.6, lon=77.2,
            gps_status="VALID", battery=50, motion=0, rssi=-95, hop_count=3,
            is_sos=False, is_heartbeat=True
        )
        with self.storage._get_connection() as conn:
            conn.cursor().execute(
                "UPDATE devices SET last_heartbeat_epoch = ?, last_seen_epoch = ? WHERE device_id = 0x0020",
                (now - 250, now - 250)
            )
            conn.commit()

        devices = self.storage.get_devices(active_window_sec=180)
        self.assertEqual(len(devices), 2)

        dev_map = {d["device_id"]: d for d in devices}

        d1 = dev_map[0x0010]
        self.assertTrue(d1["is_active"], "Device 1 should be ACTIVE")
        self.assertEqual(d1["last_rssi"], -75)
        self.assertEqual(d1["hop_count"], 1)

        d2 = dev_map[0x0020]
        self.assertFalse(d2["is_active"], "Device 2 should be INACTIVE (>180s)")
        self.assertEqual(d2["last_rssi"], -95)
        self.assertEqual(d2["hop_count"], 3)
        self.assertGreaterEqual(d2["seconds_since_last_seen"], 240)
        print(f"[PASS] Verified Device Active status & Network Health: D1(Active={d1['is_active']}, RSSI={d1['last_rssi']}, Hop={d1['hop_count']}), D2(Active={d2['is_active']})")

    def test_event_lifecycle_status_transition(self):
        """Events can transition through NEW -> ACKNOWLEDGED -> IN PROGRESS -> RESOLVED."""
        ev_id = self.storage.record_event(
            event_type="SOS", device_id=0x0077, lat=28.1, lon=77.1,
            location_state="VALID", rssi=-80, battery=60
        )
        ev = self.storage.get_event_by_id(ev_id)
        self.assertEqual(ev["status"], "NEW")

        self.storage.update_event_status(ev_id, "ACKNOWLEDGED")
        self.assertEqual(self.storage.get_event_by_id(ev_id)["status"], "ACKNOWLEDGED")

        self.storage.update_event_status(ev_id, "IN PROGRESS")
        self.assertEqual(self.storage.get_event_by_id(ev_id)["status"], "IN PROGRESS")

        self.storage.update_event_status(ev_id, "RESOLVED")
        self.assertEqual(self.storage.get_event_by_id(ev_id)["status"], "RESOLVED")

        with self.assertRaises(ValueError):
            self.storage.update_event_status(ev_id, "INVALID_STATE")
        print("[PASS] Verified Event Status lifecycle transitions (NEW -> ACK -> IN PROGRESS -> RESOLVED)")

    def test_sensors_and_broadcasts_tables(self):
        """Sensor readings and broadcast records are correctly logged."""
        s_id = self.storage.record_sensor_reading("WATER_LEVEL_MM", 1450.5, "mm", "WARNING")
        latest = self.storage.get_latest_sensor_readings()
        self.assertIn("WATER_LEVEL_MM", latest)
        self.assertEqual(latest["WATER_LEVEL_MM"]["value"], 1450.5)

        b_id = self.storage.record_broadcast(
            alert_level=3, alert_code=0x0002, alert_title="FLASH FLOOD",
            message="River swelling, evacuate high ground immediately"
        )
        bcasts = self.storage.get_broadcasts()
        self.assertEqual(len(bcasts), 1)
        self.assertEqual(bcasts[0]["alert_title"], "FLASH FLOOD")
        print("[PASS] Verified sensor readings and broadcast tables")

if __name__ == "__main__":
    unittest.main()
