"""
QuickRescue — End-to-End Integration Test Suite
================================================
Verifies the complete 8-step incident lifecycle:
  1. Responder activates SOS/HELP on Handy Device
  2. Device creates 56-byte AES-128 binary packet
  3. Message travels over LoRa mesh (hop count & TTL tracked)
  4. Tower receives it & transmits immediate LoRa ACK
  5. Tower stores it and sets priority (SOS=1, HELP=2) in SQLite
  6. Tower outputs trigger (siren/strobe/P10) & local touchscreen API shows it
  7. Dashboard shows it after sync (Internet OFF buffering -> Internet ON push)
  8. Operator updates status to RESOLVED

DONE WHEN: The full flow passes with internet OFF (local only) and ON (with sync).
"""

import os
import sys
import tempfile
import unittest

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from protocol.codec_reference import (
    encode, decode, QRPacket,
    MSG_SAFE, MSG_HELP, MSG_SOS, MSG_ACK,
    GPS_VALID, MOTION_MOVING, PSK_DEV, PACKET_SIZE
)
from tower.services.storage import TowerStorage
from tower.services.lora_driver import LoRaDriver
from tower.services.actuators import ActuatorController
from tower.services.alert_manager import AlertManager
from tower.services.receiver import ReceiverService
from tower.services.cloud_sync import FirebaseSyncService

class TestEndToEndIntegrationFlow(unittest.TestCase):
    def setUp(self):
        self.temp_db = tempfile.NamedTemporaryFile(delete=False, suffix=".db")
        self.temp_db.close()

        self.storage = TowerStorage(db_path=self.temp_db.name)
        self.driver = LoRaDriver(force_simulated=True)
        self.actuators = ActuatorController(siren_auto_off_sec=1.5, force_simulated=True)
        self.alert_manager = AlertManager(
            storage=self.storage,
            actuators=self.actuators,
            siren_timeout_sec=1.5,
            force_simulated=True
        )
        self.receiver = ReceiverService(
            db_path=self.temp_db.name,
            driver=self.driver,
            alert_manager=self.alert_manager
        )
        self.sync_service = FirebaseSyncService(
            storage=self.storage,
            lora_driver=self.driver,
            alert_manager=self.alert_manager,
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

    def test_full_flow_internet_off_and_on(self):
        """
        Tests complete 8-step flow:
        - Internet OFF: Local ingestion, priority setting, actuator firing, Kiosk API, SQLite buffering
        - Internet ON: Cloud synchronization, zero duplicates, operator resolution
        """
        device_id = 0x0042
        seq_num = 101

        sos_pkt = QRPacket(
            version     = 0x01,
            msg_type    = MSG_SOS,
            device_id   = device_id,
            seq         = seq_num,
            hop_count   = 0,
            ttl         = 7,
            lat         = 28614000,
            lon         = 77209000,
            gps_flags   = GPS_VALID,
            rssi        = 0,
            battery     = 85,
            motion      = MOTION_MOVING,
            timestamp   = 1727583069
        )
        wire_bytes = encode(sos_pkt, psk=PSK_DEV)
        self.assertEqual(len(wire_bytes), PACKET_SIZE)

        relayed_pkt = QRPacket(
            version     = 0x01,
            msg_type    = MSG_SOS,
            device_id   = device_id,
            seq         = seq_num,
            hop_count   = 1,
            ttl         = 6,
            lat         = 28614000,
            lon         = 77209000,
            gps_flags   = GPS_VALID,
            rssi        = 78,
            battery     = 85,
            motion      = MOTION_MOVING,
            timestamp   = 1727583069
        )
        relayed_wire = encode(relayed_pkt, psk=PSK_DEV)

        decoded = self.receiver.process_wire_packet(relayed_wire, rssi=-76)
        self.assertIsNotNone(decoded)
        self.assertEqual(decoded.device_id, device_id)
        self.assertEqual(decoded.msg_type, MSG_SOS)
        self.assertEqual(decoded.hop_count, 1)

        last_ack_raw = self.driver.get_last_tx()
        self.assertIsNotNone(last_ack_raw)
        ack_pkt = decode(last_ack_raw, psk=PSK_DEV)
        self.assertEqual(ack_pkt.msg_type, MSG_ACK)
        self.assertEqual(ack_pkt.alert_code, seq_num)

        events = self.storage.get_events(limit=5)
        self.assertEqual(len(events), 1)
        sos_event = events[0]
        self.assertEqual(sos_event["type"], "SOS")
        self.assertEqual(sos_event["priority"], 1)
        self.assertEqual(sos_event["status"], "NEW")
        self.assertEqual(sos_event["synced"], 0)

        help_pkt = QRPacket(
            version=0x01, msg_type=MSG_HELP, device_id=0x0055, seq=202,
            hop_count=0, ttl=7, lat=28615000, lon=77210000, gps_flags=GPS_VALID,
            rssi=0, battery=90, motion=MOTION_MOVING, timestamp=1727583075
        )
        self.receiver.process_wire_packet(encode(help_pkt, psk=PSK_DEV), rssi=-80)
        all_events = self.storage.get_events(limit=5)
        self.assertEqual(len(all_events), 2)
        self.assertEqual(all_events[0]["type"], "SOS")
        self.assertEqual(all_events[0]["priority"], 1)
        self.assertEqual(all_events[1]["type"], "HELP")
        self.assertEqual(all_events[1]["priority"], 2)

        actuator_state = self.actuators.get_state()
        self.assertIn(actuator_state["light"], ("RED", "AMBER"))
        self.assertTrue(actuator_state["siren"])
        self.assertIn("0x0055", actuator_state["p10_text"])

        kiosk_events = self.storage.get_events(status="NEW")
        self.assertEqual(len(kiosk_events), 2)
        self.assertEqual(kiosk_events[0]["priority"], 1)

        self.assertEqual(len(self.storage.get_unsynced_events()), 2)
        self.assertEqual(len(self.sync_service.db.collection("events").docs), 0)

        synced_count = self.sync_service.sync_events()
        self.assertEqual(synced_count, 2)
        self.assertEqual(len(self.storage.get_unsynced_events()), 0)

        firestore_events = self.sync_service.db.collection("events").docs
        self.assertEqual(len(firestore_events), 2)
        fs_sos = firestore_events[f"event_{sos_event['id']}"]
        self.assertEqual(fs_sos["type"], "SOS")
        self.assertEqual(fs_sos["priority"], 1)
        self.assertEqual(fs_sos["status"], "NEW")

        retry_count = self.sync_service.sync_events()
        self.assertEqual(retry_count, 0)
        self.assertEqual(len(self.sync_service.db.collection("events").docs), 2)

        status_updated = self.storage.update_event_status(sos_event["id"], "RESOLVED")
        self.assertTrue(status_updated)

        resolved_ev = self.storage.get_event_by_id(sos_event["id"])
        self.assertEqual(resolved_ev["status"], "RESOLVED")

        self.actuators.siren_off()
        self.actuators.set_light("GREEN")
        final_state = self.actuators.get_state()
        self.assertFalse(final_state["siren"])
        self.assertEqual(final_state["light"], "GREEN")

if __name__ == "__main__":
    unittest.main()
