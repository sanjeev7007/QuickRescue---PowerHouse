"""
QuickRescue Tower Receiver — Integration Test Suite
===================================================
Tests complete lifecycle:
  1. Handy Device sends encrypted SOS -> Tower receives & decodes
  2. Tower verifies fields and records to SQLite
  3. Tower responds with valid ACK acknowledging the SOS sequence #
  4. Tampered / corrupt packet rejection and security logging
  5. Duplicate packet detection & re-ACK behavior
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
    MSG_SOS, MSG_SAFE, MSG_ACK,
    GPS_VALID, MOTION_MOVING, PSK_DEV
)
from tower.services.lora_driver import LoRaDriver
from tower.services.receiver import ReceiverService
from tower.services.storage import TowerStorage

class TestTowerReceiverFlow(unittest.TestCase):
    def setUp(self):
        self.temp_db = tempfile.NamedTemporaryFile(delete=False, suffix=".db")
        self.temp_db.close()
        self.driver = LoRaDriver(force_simulated=True)
        self.service = ReceiverService(db_path=self.temp_db.name, driver=self.driver)

    def tearDown(self):
        try:
            if self.service and self.service.alert_manager and self.service.alert_manager.actuators:
                self.service.alert_manager.actuators.shutdown()
        except Exception:
            pass
        try:
            if os.path.exists(self.temp_db.name):
                os.remove(self.temp_db.name)
        except Exception:
            pass

    def test_sos_receive_store_and_ack(self):
        """Test SOS from Handy Device appears decoded and triggers valid ACK."""
        dev_id = 0x0042
        seq_num = 101
        sos_pkt = QRPacket(
            version   = 0x01,
            msg_type  = MSG_SOS,
            device_id = dev_id,
            seq       = seq_num,
            hop_count = 0,
            ttl       = 7,
            lat       = 28614000,
            lon       = 77209000,
            gps_flags = GPS_VALID,
            rssi      = 0,
            battery   = 85,
            motion    = MOTION_MOVING,
            timestamp = 1727583069
        )
        sos_wire = encode(sos_pkt, psk=PSK_DEV)
        self.assertEqual(len(sos_wire), 56)

        decoded = self.service.process_wire_packet(sos_wire, rssi=-78)
        self.assertIsNotNone(decoded)
        self.assertEqual(decoded.msg_type, MSG_SOS)
        self.assertEqual(decoded.device_id, dev_id)
        self.assertEqual(decoded.seq, seq_num)
        self.assertEqual(decoded.lat, 28614000)
        self.assertEqual(decoded.lon, 77209000)
        self.assertEqual(decoded.battery, 85)

        active_sos_list = self.service.storage.get_active_sos()
        self.assertEqual(len(active_sos_list), 1)
        self.assertEqual(active_sos_list[0]["device_id"], dev_id)
        self.assertEqual(active_sos_list[0]["is_sos_active"], 1)

        ack_wire = self.driver.get_last_tx()
        self.assertIsNotNone(ack_wire)
        self.assertEqual(len(ack_wire), 56)

        ack_pkt = decode(ack_wire, psk=PSK_DEV)
        self.assertEqual(ack_pkt.msg_type, MSG_ACK)
        self.assertEqual(ack_pkt.device_id, self.service.tower_id)
        self.assertEqual(ack_pkt.alert_code, seq_num, "ACK must carry the original SOS sequence number in alert_code")
        print(f"\n[PASS] Verified SOS -> Decoded in Tower -> Saved in DB -> ACK #{ack_pkt.alert_code} sent back")

    def test_tampered_packet_rejection(self):
        """Corrupted/tampered packets must be rejected and logged to tampered table."""
        pkt = QRPacket(msg_type=MSG_SOS, device_id=0x0099, seq=1)
        valid_wire = bytearray(encode(pkt, psk=PSK_DEV))

        valid_wire[30] ^= 0xFF
        tampered_wire = bytes(valid_wire)

        result = self.service.process_wire_packet(tampered_wire, rssi=-90)
        self.assertIsNone(result, "Tampered packet must be rejected")

        with self.service.storage._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM tampered_packets")
            rows = cursor.fetchall()
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]["raw_hex"], tampered_wire.hex().upper())
            print(f"[PASS] Tampered packet rejected and logged: {rows[0]['error_reason']}")

    def test_duplicate_filtering_and_reack(self):
        """Duplicate packets are not duplicated in DB, but trigger re-ACK."""
        pkt = QRPacket(msg_type=MSG_SAFE, device_id=0x0055, seq=42)
        wire = encode(pkt, psk=PSK_DEV)

        res1 = self.service.process_wire_packet(wire, rssi=-80)
        self.assertIsNotNone(res1)

        with self.service.storage._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM events WHERE device_id = 0x0055")
            self.assertEqual(cursor.fetchone()[0], 1)

        res2 = self.service.process_wire_packet(wire, rssi=-80)
        self.assertIsNotNone(res2)

        with self.service.storage._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM events WHERE device_id = 0x0055")
            self.assertEqual(cursor.fetchone()[0], 1, "Duplicate packet must not be re-stored in DB")

        ack_wire = self.driver.get_last_tx()
        ack_pkt = decode(ack_wire, psk=PSK_DEV)
        self.assertEqual(ack_pkt.alert_code, 42)
        print("[PASS] Duplicate packet filtered from DB and re-ACKed successfully")

if __name__ == "__main__":
    unittest.main()
