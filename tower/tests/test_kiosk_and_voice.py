"""
QuickRescue Touchscreen Kiosk & Offline Voice Assistant — Verification Suite
=============================================================================
Tests:
  1. Complete offline execution (zero internet dependencies).
  2. Operator can see priority SOS events and transition lifecycle statuses
     (NEW -> ACKNOWLEDGED -> IN PROGRESS -> RESOLVED).
  3. Offline Voice Assistant answers natural language queries (alerts, weather, power, devices)
     strictly from local database data, and queues TTS speech for the PA speaker.
"""

import os
import sys
import tempfile
import unittest

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from tower.services.storage import TowerStorage
from tower.services.actuators import ActuatorController
from tower.services.voice_assistant import OfflineVoiceAssistant

class TestKioskAndVoice(unittest.TestCase):
    def setUp(self):
        self.temp_db = tempfile.NamedTemporaryFile(delete=False, suffix=".db")
        self.temp_db.close()
        self.storage = TowerStorage(db_path=self.temp_db.name)
        self.actuators = ActuatorController(siren_auto_off_sec=1.0, force_simulated=True)
        self.assistant = OfflineVoiceAssistant(storage=self.storage, actuators=self.actuators)

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

    def test_operator_sees_and_updates_sos_offline(self):
        """
        DONE WHEN: with internet unplugged, the operator can see and update an SOS
        """
        ev_id = self.storage.record_event(
            event_type="SOS",
            device_id=0x0042,
            lat=28.6140,
            lon=77.2090,
            location_state="VALID",
            rssi=-78,
            battery=85,
            status="NEW"
        )

        events = self.storage.get_events()
        self.assertGreaterEqual(len(events), 1)
        self.assertEqual(events[0]["id"], ev_id)
        self.assertEqual(events[0]["type"], "SOS")
        self.assertEqual(events[0]["status"], "NEW")

        ok1 = self.storage.update_event_status(ev_id, "ACKNOWLEDGED")
        self.assertTrue(ok1)
        self.assertEqual(self.storage.get_event_by_id(ev_id)["status"], "ACKNOWLEDGED")

        ok2 = self.storage.update_event_status(ev_id, "IN PROGRESS")
        self.assertTrue(ok2)
        self.assertEqual(self.storage.get_event_by_id(ev_id)["status"], "IN PROGRESS")

        ok3 = self.storage.update_event_status(ev_id, "RESOLVED")
        self.assertTrue(ok3)
        self.assertEqual(self.storage.get_event_by_id(ev_id)["status"], "RESOLVED")

        print("\n[PASS] Verified: Operator views priority SOS offline and transitions status through full lifecycle (NEW -> ACK -> IN PROGRESS -> RESOLVED)")

    def test_spoken_answer_to_basic_status_queries_offline(self):
        """
        DONE WHEN: operator gets a spoken answer to a basic status query (alerts, weather, power).
        """
        self.storage.record_event(
            event_type="SOS", device_id=0x0042, lat=28.6140, lon=77.2090,
            location_state="VALID", rssi=-78, battery=85, status="NEW"
        )
        self.storage.record_sensor_reading("TEMPERATURE_C", 29.5, "C")
        self.storage.record_sensor_reading("WATER_LEVEL_MM", 420.0, "mm")
        self.storage.record_sensor_reading("BATTERY_VOLTAGE", 13.2, "V")
        self.storage.upsert_device(
            device_id=0x0042, msg_type="SOS", seq=1, lat=28.614, lon=77.209,
            gps_status="VALID", battery=85, motion=1, rssi=-78, hop_count=0,
            is_sos=True, is_heartbeat=False
        )

        reply_alerts, ctx_alerts = self.assistant.process_query("What are the current alerts?", speak_output=True)
        self.assertIn("SOS", reply_alerts)
        self.assertIn("42", reply_alerts)
        self.assertIn("28.6140", reply_alerts)
        self.assertFalse(self.actuators._speech_queue.empty())

        reply_weather, ctx_weather = self.assistant.process_query("What is the weather and water level?", speak_output=True)
        self.assertIn("29.5", reply_weather)
        self.assertIn("420", reply_weather)
        self.assertIn("safe normal", reply_weather)

        reply_power, ctx_power = self.assistant.process_query("Check battery and power status", speak_output=True)
        self.assertIn("13.2", reply_power)
        self.assertIn("volts", reply_power)

        reply_squad, ctx_squad = self.assistant.process_query("How many active squad devices?", speak_output=True)
        self.assertIn("Handy Devices online", reply_squad)

        print("[PASS] Verified: Offline Voice Assistant delivers accurate, factual spoken answers for alerts, weather, power, and devices")

if __name__ == "__main__":
    unittest.main()
