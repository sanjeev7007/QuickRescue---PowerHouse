"""
QuickRescue Communication Tower — LoRa Receiver Service
========================================================
Main background service for Raspberry Pi 4 Gateway.
Receives, decrypts (AES-128), verifies, duplicate-filters, logs,
and responds with immediate LoRa ACKs for incoming SAFE, HELP, and SOS packets.
"""

import os
import sys
import time
import signal
import logging
from collections import OrderedDict
from typing import Optional

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from protocol.codec_reference import (
    decode, encode, QRPacket,
    PACKET_SIZE, PSK_DEV,
    MSG_SAFE, MSG_HELP, MSG_SOS, MSG_HEARTBEAT, MSG_BROADCAST, MSG_ACK,
    MSG_NAMES, GPS_FLAG_NAMES, MOTION_NAMES, GPS_UNAVAILABLE
)

from tower.services.storage import TowerStorage
from tower.services.lora_driver import LoRaDriver
from tower.services.alert_manager import AlertManager

LOG_FORMAT = "%(asctime)s [%(levelname)s] [Receiver] %(message)s"
logging.basicConfig(level=logging.INFO, format=LOG_FORMAT)
logger = logging.getLogger("TowerReceiver")

TOWER_DEVICE_ID = 0x0001
DEDUP_CACHE_LIMIT = 256

class ReceiverService:
    def __init__(self,
                 db_path: str = "tower.db",
                 psk: bytes = PSK_DEV,
                 tower_id: int = TOWER_DEVICE_ID,
                 driver: Optional[LoRaDriver] = None,
                 alert_manager: Optional[AlertManager] = None):
        self.psk = psk
        self.tower_id = tower_id
        self.running = False
        self.tx_seq = 1

        self.seen_cache: OrderedDict = OrderedDict()

        self.storage = TowerStorage(db_path=db_path)
        self.driver = driver if driver is not None else LoRaDriver()
        self.alert_manager = alert_manager if alert_manager is not None else AlertManager(storage=self.storage)

    def _is_duplicate(self, device_id: int, seq: int) -> bool:
        """Check if (device_id, seq) has already been processed."""
        key = (device_id, seq)
        if key in self.seen_cache:
            return True

        self.seen_cache[key] = time.time()
        if len(self.seen_cache) > DEDUP_CACHE_LIMIT:
            self.seen_cache.popitem(last=False)
        return False

    def send_ack(self, target_device_id: int, target_seq: int, rssi: int = 0) -> bool:
        """
        Send an AES-128 encrypted ACK packet back to the Handy Device.
        The acknowledged sequence number is carried in the alert_code field.
        """
        ack_pkt = QRPacket(
            version     = 0x01,
            msg_type    = MSG_ACK,
            device_id   = self.tower_id,
            seq         = self.tx_seq,
            hop_count   = 0,
            ttl         = 7,
            lat         = 0,
            lon         = 0,
            gps_flags   = GPS_UNAVAILABLE,
            rssi        = abs(rssi) if rssi else 0,
            battery     = 100,
            motion      = 0,
            timestamp   = int(time.time()),
            alert_level = 0,
            alert_code  = target_seq
        )
        self.tx_seq = (self.tx_seq + 1) & 0xFFFF

        try:
            ack_wire = encode(ack_pkt, psk=self.psk)
            success = self.driver.send_packet(ack_wire)
            if success:
                logger.info(f"[TX-ACK] Sent ACK to Device 0x{target_device_id:04X} for Seq #{target_seq} (Tower Seq #{ack_pkt.seq})")
            else:
                logger.error(f"[TX-ACK] Failed to transmit ACK to Device 0x{target_device_id:04X}")
            return success
        except Exception as e:
            logger.error(f"[TX-ACK] Failed to encode ACK packet: {e}")
            return False

    def process_wire_packet(self, wire_bytes: bytes, rssi: int = 0) -> Optional[QRPacket]:
        """
        Process a single wire buffer: validate, decrypt, deduplicate, store, and ACK.
        Returns decoded QRPacket if valid, None if rejected.
        """
        if len(wire_bytes) != PACKET_SIZE:
            reason = f"Invalid packet length: {len(wire_bytes)} bytes (expected {PACKET_SIZE})"
            logger.warning(f"[REJECT] {reason}")
            self.storage.log_tampered(wire_bytes, reason, rssi)
            return None

        try:
            pkt = decode(wire_bytes, psk=self.psk)
        except Exception as e:
            reason = f"Decryption/Validation failed: {e}"
            logger.warning(f"[SECURITY] Tampered/Corrupt packet rejected: {reason} | Raw: {wire_bytes[:16].hex()}...")
            self.storage.log_tampered(wire_bytes, reason, rssi)
            return None

        type_str = MSG_NAMES.get(pkt.msg_type, f"TYPE_{pkt.msg_type}")
        lat_deg  = pkt.lat / 1e6
        lon_deg  = pkt.lon / 1e6
        gps_str  = GPS_FLAG_NAMES.get(pkt.gps_flags, f"FLAG_{pkt.gps_flags}")
        motion_s = MOTION_NAMES.get(pkt.motion, "UNKNOWN")

        is_dup = self._is_duplicate(pkt.device_id, pkt.seq)
        if is_dup:
            logger.info(f"[DEDUP] Duplicate packet from 0x{pkt.device_id:04X} Seq #{pkt.seq} ({type_str}) — Ignored for DB")
            if pkt.msg_type in (MSG_SAFE, MSG_HELP, MSG_SOS):
                logger.info(f"[DEDUP-ACK] Re-transmitting ACK for Device 0x{pkt.device_id:04X} Seq #{pkt.seq}")
                self.send_ack(pkt.device_id, pkt.seq, rssi)
            return pkt

        logger.info(
            f"[RECV] {type_str} from 0x{pkt.device_id:04X} | Seq={pkt.seq} Hop={pkt.hop_count} TTL={pkt.ttl} | "
            f"Bat={pkt.battery}% Motion={motion_s} RSSI={rssi}dBm | Loc={lat_deg:.6f},{lon_deg:.6f} ({gps_str})"
        )

        if pkt.msg_type == MSG_SOS:
            logger.warning(f"🚨 [ALARM] ACTIVE SOS ALERT! Device: 0x{pkt.device_id:04X} Lat: {lat_deg:.6f} Lon: {lon_deg:.6f} 🚨")

        try:
            pkt_id = self.storage.store_packet(pkt, wire_bytes, rssi)
            logger.debug(f"[STORAGE] Stored packet #{pkt_id} in SQLite database")
        except Exception as e:
            logger.error(f"[STORAGE] Failed to write packet to database: {e}")

        if self.alert_manager:
            if pkt.msg_type == MSG_SOS:
                self.alert_manager.trigger_sos_alert(
                    device_id=pkt.device_id,
                    lat=lat_deg,
                    lon=lon_deg,
                    battery=pkt.battery,
                    location_state=gps_str,
                    seq=pkt.seq
                )
            elif pkt.msg_type == MSG_HELP:
                self.alert_manager.trigger_help_alert(
                    device_id=pkt.device_id,
                    lat=lat_deg,
                    lon=lon_deg,
                    battery=pkt.battery,
                    location_state=gps_str
                )

        if pkt.msg_type in (MSG_SAFE, MSG_HELP, MSG_SOS):
            self.send_ack(pkt.device_id, pkt.seq, rssi)

        return pkt

    def run(self):
        """Main service loop."""
        self.running = True
        logger.info(f"Tower LoRa Receiver Service active (Device ID: 0x{self.tower_id:04X})")

        while self.running:
            try:
                rx_data = self.driver.receive_packet()
                if rx_data:
                    wire_bytes, rssi = rx_data
                    self.process_wire_packet(wire_bytes, rssi)
                else:
                    time.sleep(0.01)
            except KeyboardInterrupt:
                logger.info("Stopping receiver service via keyboard interrupt...")
                break
            except Exception as e:
                logger.error(f"Unexpected error in receiver loop: {e}", exc_info=True)
                time.sleep(0.5)

        self.running = False
        logger.info("Receiver service shutdown complete.")

    def stop(self):
        self.running = False

def main():
    service = ReceiverService()

    def signal_handler(signum, frame):
        logger.info(f"Received signal {signum}, initiating graceful shutdown...")
        service.stop()

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    service.run()

if __name__ == "__main__":
    main()
