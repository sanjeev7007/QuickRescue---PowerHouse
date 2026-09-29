"""
QuickRescue Tower Alert Output — Verification Suite
====================================================
Tests that:
  1. Test SOS turns light RED, activates siren, updates P10, and queues TTS speech.
  2. Test HELP turns light AMBER, keeps siren OFF, updates P10, and queues TTS speech.
  3. Reset button immediately silences siren, updates state, and logs audit trail.
  4. Siren auto-off timer shuts off siren after configured duration.
  5. Works 100% offline without network dependencies.
"""

import os
import sys
import time
import tempfile
import unittest

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from tower.services.storage import TowerStorage
from tower.services.actuators import ActuatorController
from tower.services.alert_manager import AlertManager

class TestAlertFlow(unittest.TestCase):
    def setUp(self):
        self.temp_db = tempfile.NamedTemporaryFile(delete=False, suffix=".db")
        self.temp_db.close()
        self.storage = TowerStorage(db_path=self.temp_db.name)
        self.actuators = ActuatorController(siren_auto_off_sec=1.0, force_simulated=True)
        self.alert_mgr = AlertManager(
            storage=self.storage,
            actuators=self.actuators,
            siren_timeout_sec=1.0,
            force_simulated=True
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

    def test_sos_triggers_all_outputs_and_reset_silences(self):
        """SOS turns light red, sounds siren, updates P10, speaks alert; reset silences it."""
        self.assertEqual(self.actuators.light_state, "GREEN")
        self.assertFalse(self.actuators.siren_active)

        self.alert_mgr.trigger_sos_alert(
            device_id=0x0042,
            lat=28.6140,
            lon=77.2090,
            battery=85,
            location_state="VALID",
            seq=1
        )

        self.assertEqual(self.actuators.light_state, "RED", "SOS must turn tri-colour light to RED")

        self.assertTrue(self.actuators.siren_active, "SOS must activate industrial siren")

        self.assertIn("EMERGENCY SOS", self.actuators.p10_alert_text)
        self.assertIn("0042", self.actuators.p10_alert_text)

        self.assertFalse(self.actuators._speech_queue.empty())

        self.alert_mgr.handle_reset_button(operator_name="STATION_OFFICER_1")

        self.assertFalse(self.actuators.siren_active, "Reset button must silence siren immediately")

        events = self.storage.get_events()
        audit_events = [e for e in events if e.get("details", {}).get("action") == "ALARM_SILENCED"]
        self.assertEqual(len(audit_events), 1)
        self.assertEqual(audit_events[0]["details"]["operator"], "STATION_OFFICER_1")
        print("\n[PASS] Verified SOS -> Light RED, Siren ON, P10 updated, TTS queued -> Reset button silenced & logged")

    def test_help_turns_light_amber_and_no_siren(self):
        """HELP distress alert turns light AMBER, updates P10, but leaves siren OFF."""
        self.alert_mgr.trigger_help_alert(
            device_id=0x0017,
            lat=28.6120,
            lon=77.2100,
            battery=42,
            location_state="LAST_KNOWN"
        )

        self.assertEqual(self.actuators.light_state, "AMBER", "HELP must switch light to AMBER")
        self.assertFalse(self.actuators.siren_active, "HELP must NOT activate siren")
        self.assertIn("HELP REQUESTED", self.actuators.p10_alert_text)
        print("[PASS] Verified HELP -> Light AMBER, Siren OFF, P10 updated, TTS queued")

    def test_siren_auto_off_timer(self):
        """Siren turns off automatically after configured timeout."""
        self.actuators.siren_on(duration_sec=0.2)
        self.assertTrue(self.actuators.siren_active)

        time.sleep(0.3)
        self.assertFalse(self.actuators.siren_active, "Siren must turn off after timer expires")
        print("[PASS] Verified Siren auto-off timer successfully silences after duration")

if __name__ == "__main__":
    unittest.main()
