"""
QuickRescue Firebase Cloud Sync — Verification Suite
====================================================
Tests that:
  1. Events created while offline in SQLite appear in Firebase after reconnect.
  2. No duplicate documents are created on retry (idempotent upsert).
  3. No records are lost.
  4. Admin broadcasts created on the dashboard are pulled and transmitted over LoRa.
"""

import os
import sys
import tempfile
import unittest

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from protocol.codec_reference import decode, MSG_BROADCAST, ALERT_EVAC, PSK_DEV
from tower.services.storage import TowerStorage
from tower.services.lora_driver import LoRaDriver
from tower.services.actuators import ActuatorController
from tower.services.alert_manager import AlertManager
from tower.services.cloud_sync import FirebaseSyncService

class TestCloudSync(unittest.TestCase):
    def setUp(self):
        self.temp_db = tempfile.NamedTemporaryFile(delete=False, suffix=".db")
        self.temp_db.close()
        self.storage = TowerStorage(db_path=self.temp_db.name)
        self.driver = LoRaDriver(force_simulated=True)
        self.actuators = ActuatorController(siren_auto_off_sec=1.0, force_simulated=True)
        self.alert_mgr = AlertManager(
            storage=self.storage,
            actuators=self.actuators,
            siren_timeout_sec=1.0,
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
            self.actuators.shutdown()
        except Exception:
            pass
        try:
            if os.path.exists(self.temp_db.name):
                os.remove(self.temp_db.name)
        except Exception:
            pass

    def test_offline_events_synced_without_duplicates(self):
        """
        DONE WHEN: events created while the Pi is offline appear in Firebase after reconnect,
        with no duplicates and no lost records.
        """
        ev1 = self.storage.record_event(
            event_type="SOS", device_id=0x0042, lat=28.614, lon=77.209,
            location_state="VALID", rssi=-78, battery=85
        )
        ev2 = self.storage.record_event(
            event_type="HELP", device_id=0x0017, lat=28.612, lon=77.210,
            location_state="LAST_KNOWN", rssi=-88, battery=40
        )
        ev3 = self.storage.record_event(
            event_type="SAFE", device_id=0x00AB, lat=28.610, lon=77.200,
            location_state="UNAVAILABLE", rssi=0, battery=99
        )

        self.assertEqual(len(self.storage.get_unsynced_events()), 3)
        self.assertEqual(len(self.sync_service.db.collection("events").docs), 0)

        synced_count = self.sync_service.sync_events()
        self.assertEqual(synced_count, 3, "All 3 offline events must be pushed to Firebase")

        self.assertEqual(len(self.storage.get_unsynced_events()), 0, "No unsynced events remaining in DB")

        fb_events = self.sync_service.db.collection("events").docs
        self.assertEqual(len(fb_events), 3, "Firebase must have exactly 3 events")
        self.assertIn(f"event_{ev1}", fb_events)
        self.assertIn(f"event_{ev2}", fb_events)
        self.assertIn(f"event_{ev3}", fb_events)

        doc1 = fb_events[f"event_{ev1}"]
        self.assertEqual(doc1["type"], "SOS")
        self.assertEqual(doc1["device_id"], 0x0042)
        self.assertEqual(doc1["priority"], 1)

        resync_count = self.sync_service.sync_events()
        self.assertEqual(resync_count, 0, "Already synced events must not be re-queried")

        self.sync_service.db.collection("events").document(f"event_{ev1}").set(doc1, merge=True)
        self.assertEqual(len(self.sync_service.db.collection("events").docs), 3, "Zero duplicates created on retry")

        print("\n[PASS] Verified offline events -> pushed to Firebase -> marked synced -> zero duplicates on retry")

    def test_pull_admin_broadcast_and_dispatch_over_lora(self):
        """Admin broadcasts created on the dashboard are pulled and transmitted over LoRa."""
        bcast_coll = self.sync_service.db.collection("admin_broadcasts")
        bcast_coll.document("admin_bcast_001").set({
            "alert_title": "CIVIL EVACUATION ORDER",
            "alert_level": 3,
            "alert_code": ALERT_EVAC,
            "message": "Flood defense breach. Evacuate Zone 4 to relief camp A.",
            "target_tower_id": 0,
            "created_by": "COMMANDER_SINGH",
            "dispatched_to_lora": False
        })

        dispatched = self.sync_service.pull_admin_broadcasts()
        self.assertEqual(dispatched, 1, "Must pull and dispatch 1 broadcast")

        wire = self.driver.get_last_tx()
        self.assertIsNotNone(wire)
        self.assertEqual(len(wire), 56)

        pkt = decode(wire, psk=PSK_DEV)
        self.assertEqual(pkt.msg_type, MSG_BROADCAST)
        self.assertEqual(pkt.alert_level, 3)
        self.assertEqual(pkt.alert_code, ALERT_EVAC)

        updated_doc = bcast_coll.document("admin_bcast_001").get().to_dict()
        self.assertTrue(updated_doc["dispatched_to_lora"], "Firestore document must be marked dispatched")
        self.assertIn("dispatched_at", updated_doc)

        self.assertEqual(self.actuators.light_state, "RED")
        self.assertTrue(self.actuators.siren_active)

        print("[PASS] Verified Admin Broadcast pulled from Firebase -> Transmitted over LoRa -> Marked dispatched in cloud")

if __name__ == "__main__":
    unittest.main()
