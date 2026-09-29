"""
QuickRescue Communication Tower — Firebase Cloud Sync Service
=============================================================
Watches the local SQLite database and sync_queue:
  - When internet returns: pushes unsynced events, device states, and sensor readings
    to Firestore in order, then marks them synced.
  - Pulls Admin Broadcasts created on the web dashboard and broadcasts them over LoRa.
  - Idempotent upserts (deterministic doc IDs) guarantee zero duplicates on retry.
  - Credentials loaded from serviceAccountKey.json or .env (never checked into git).
"""

import os
import sys
import time
import socket
import logging
from typing import Optional, List, Dict, Any

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from protocol.codec_reference import (
    encode, QRPacket,
    MSG_BROADCAST, GPS_UNAVAILABLE, PSK_DEV
)
from tower.services.storage import TowerStorage
from tower.services.lora_driver import LoRaDriver
from tower.services.alert_manager import AlertManager

logger = logging.getLogger("CloudSync")

DEFAULT_TOWER_ID = 0x0001
DEFAULT_CRED_PATH = os.environ.get("FIREBASE_CREDENTIALS_PATH", "serviceAccountKey.json")

class MockFirestoreCollection:
    """In-memory mock collection for tests and offline development."""
    def __init__(self, name: str):
        self.name = name
        self.docs = {}

    def document(self, doc_id: str):
        return MockFirestoreDocument(self, doc_id)

    def where(self, field: str, op: str, value: Any):
        return MockFirestoreQuery(self, field, op, value)

    def stream(self):
        for doc_id, data in list(self.docs.items()):
            yield MockDocumentSnapshot(doc_id, data)

class MockFirestoreDocument:
    def __init__(self, collection: MockFirestoreCollection, doc_id: str):
        self.collection = collection
        self.doc_id = doc_id

    def set(self, data: Dict[str, Any], merge: bool = True):
        if merge and self.doc_id in self.collection.docs:
            self.collection.docs[self.doc_id].update(data)
        else:
            self.collection.docs[self.doc_id] = dict(data)

    def update(self, data: Dict[str, Any]):
        if self.doc_id in self.collection.docs:
            self.collection.docs[self.doc_id].update(data)
        else:
            self.collection.docs[self.doc_id] = dict(data)

    def get(self):
        if self.doc_id in self.collection.docs:
            return MockDocumentSnapshot(self.doc_id, self.collection.docs[self.doc_id])
        return MockDocumentSnapshot(self.doc_id, None, exists=False)

class MockDocumentSnapshot:
    def __init__(self, doc_id: str, data: Optional[Dict[str, Any]], exists: bool = True):
        self.id = doc_id
        self._data = data
        self.exists = exists if data is not None else False

    def to_dict(self) -> Dict[str, Any]:
        return dict(self._data or {})

class MockFirestoreQuery:
    def __init__(self, collection: MockFirestoreCollection, field: str, op: str, value: Any):
        self.collection = collection
        self.field = field
        self.op = op
        self.value = value

    def stream(self):
        for doc_id, data in list(self.collection.docs.items()):
            val = data.get(self.field)
            if self.op == "==" and val == self.value:
                yield MockDocumentSnapshot(doc_id, data)

class MockFirestoreClient:
    """Mock client mimicking google.cloud.firestore.Client."""
    def __init__(self):
        self.collections = {}

    def collection(self, name: str):
        if name not in self.collections:
            self.collections[name] = MockFirestoreCollection(name)
        return self.collections[name]

class FirebaseSyncService:
    def __init__(self,
                 storage: Optional[TowerStorage] = None,
                 lora_driver: Optional[LoRaDriver] = None,
                 alert_manager: Optional[AlertManager] = None,
                 tower_id: int = DEFAULT_TOWER_ID,
                 cred_path: str = DEFAULT_CRED_PATH,
                 force_mock: bool = False):
        self.storage = storage if storage is not None else TowerStorage()
        self.lora = lora_driver if lora_driver is not None else LoRaDriver()
        self.alert_mgr = alert_manager if alert_manager is not None else AlertManager(storage=self.storage)
        self.tower_id = tower_id
        self.cred_path = cred_path

        self.db = None
        self.is_mock = False
        self.running = False
        self.tx_seq = 200

        if not force_mock and os.path.exists(self.cred_path):
            self._init_firebase()
        else:
            logger.info("[FIREBASE] Using Mock / In-Memory Firestore client (Credentials not configured)")
            self.db = MockFirestoreClient()
            self.is_mock = True

    def _init_firebase(self):
        try:
            import firebase_admin
            from firebase_admin import credentials, firestore

            if not firebase_admin._apps:
                cred = credentials.Certificate(self.cred_path)
                firebase_admin.initialize_app(cred)
            self.db = firestore.client()
            self.is_mock = False
            logger.info(f"✅ [FIREBASE] Successfully authenticated with credentials: {self.cred_path}")
        except Exception as e:
            logger.warning(f"[FIREBASE] Failed to initialize Firebase SDK: {e}. Falling back to mock client.")
            self.db = MockFirestoreClient()
            self.is_mock = True

    def is_online(self) -> bool:
        """Probe public DNS socket to detect active internet connection."""
        if self.is_mock:
            return True

        probes = [("1.1.1.1", 53), ("8.8.8.8", 53)]
        for host, port in probes:
            try:
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.settimeout(2.0)
                sock.connect((host, port))
                sock.close()
                return True
            except (socket.timeout, OSError):
                continue
        return False

    def sync_events(self) -> int:
        """
        Push all unsynced events to Firebase in strict priority and temporal order.
        Uses deterministic document ID 'event_{id}' with set(merge=True) to prevent duplicates.
        """
        unsynced = self.storage.get_unsynced_events(limit=50)
        if not unsynced:
            return 0

        synced_ids = []
        events_coll = self.db.collection("events")

        for ev in unsynced:
            doc_id = f"event_{ev['id']}"
            doc_data = {
                "id": ev["id"],
                "tower_id": self.tower_id,
                "device_id": ev["device_id"],
                "type": ev["type"],
                "priority": ev["priority"],
                "status": ev["status"],
                "lat": ev["lat"],
                "lon": ev["lon"],
                "location_state": ev["location_state"],
                "rssi": ev["rssi"],
                "battery": ev["battery"],
                "event_time": ev["event_time"],
                "synced_at": int(time.time()),
                "raw_hex": ev.get("raw_hex", "")
            }
            if ev.get("details"):
                doc_data["details"] = ev["details"]

            try:
                events_coll.document(doc_id).set(doc_data, merge=True)
                synced_ids.append(ev["id"])
            except Exception as e:
                logger.error(f"[SYNC] Failed to push event #{ev['id']} to Firebase: {e}")
                break

        if synced_ids:
            self.storage.mark_events_synced(synced_ids)
            logger.info(f"☁️ [SYNC] Pushed {len(synced_ids)} incident events to Firebase Firestore")

        return len(synced_ids)

    def sync_devices(self) -> int:
        """Push latest device registry states to Firebase."""
        devices = self.storage.get_devices()
        if not devices:
            return 0

        dev_coll = self.db.collection("devices")
        count = 0
        for d in devices:
            doc_id = f"dev_{d['device_id']}"
            doc_data = {
                "device_id": d["device_id"],
                "tower_id": self.tower_id,
                "is_active": d["is_active"],
                "last_seen_epoch": d["last_seen_epoch"],
                "last_msg_type": d["last_msg_type"],
                "last_seq": d["last_seq"],
                "lat": d["last_lat"],
                "lon": d["last_lon"],
                "gps_status": d["gps_status"],
                "battery": d["battery"],
                "motion": d["motion"],
                "last_rssi": d["last_rssi"],
                "hop_count": d["hop_count"],
                "is_sos_active": bool(d["is_sos_active"]),
                "updated_at": int(time.time())
            }
            try:
                dev_coll.document(doc_id).set(doc_data, merge=True)
                count += 1
            except Exception as e:
                logger.error(f"[SYNC] Failed to update device 0x{d['device_id']:04X}: {e}")

        return count

    def sync_sensors(self) -> int:
        """Push unsynced sensor readings to Firebase."""
        readings = self.storage.get_unsynced_sensors(limit=50)
        if not readings:
            return 0

        synced_ids = []
        sensor_coll = self.db.collection("sensor_readings")

        for r in readings:
            doc_id = f"sensor_{r['id']}"
            doc_data = {
                "id": r["id"],
                "tower_id": self.tower_id,
                "sensor_type": r["sensor_type"],
                "value": r["value"],
                "unit": r["unit"],
                "status": r["status"],
                "recorded_epoch": r["recorded_epoch"],
                "synced_at": int(time.time())
            }
            try:
                sensor_coll.document(doc_id).set(doc_data, merge=True)
                synced_ids.append(r["id"])
            except Exception as e:
                logger.error(f"[SYNC] Failed to push sensor reading #{r['id']}: {e}")
                break

        if synced_ids:
            self.storage.mark_sensors_synced(synced_ids)

        return len(synced_ids)

    def sync_tower_heartbeat(self):
        """Update tower status doc in Firebase."""
        try:
            tower_doc = self.db.collection("towers").document(f"tower_{self.tower_id}")
            latest_sensors = self.storage.get_latest_sensor_readings()
            devices = self.storage.get_devices()
            active_count = sum(1 for d in devices if d["is_active"])
            active_sos = len(self.storage.get_active_sos())

            batt_v = latest_sensors.get("BATTERY_VOLTAGE", {}).get("value", 13.2)
            batt_pct = latest_sensors.get("BATTERY_PCT", {}).get("value", 75.0)
            batt_curr = latest_sensors.get("BATTERY_CURRENT", {}).get("value", 0.8)
            solar_state = latest_sensors.get("SOLAR_STATE", {}).get("status", "CHARGING")
            is_low_batt = (batt_pct <= 20.0) or (latest_sensors.get("BATTERY_VOLTAGE", {}).get("status") == "WARNING")

            tower_doc.set({
                "tower_id": self.tower_id,
                "status": "ONLINE",
                "last_seen": int(time.time()),
                "active_devices_count": active_count,
                "active_sos_count": active_sos,
                "sensors": latest_sensors,
                "power": {
                    "battery_voltage": batt_v,
                    "battery_pct": batt_pct,
                    "battery_current": batt_curr,
                    "solar_state": solar_state,
                    "is_low_battery_mode": is_low_batt,
                    "updated_at": int(time.time())
                }
            }, merge=True)
        except Exception as e:
            logger.debug(f"[SYNC] Tower heartbeat error: {e}")

    def pull_admin_broadcasts(self) -> int:
        """
        Pull Admin Broadcasts created on the web dashboard where dispatched_to_lora == False.
        Encodes into 56-byte AES-128 LoRa BROADCAST packets, transmits over radio,
        and triggers local tower actuators.
        """
        try:
            bcast_coll = self.db.collection("admin_broadcasts")
            pending_query = bcast_coll.where("dispatched_to_lora", "==", False)
            dispatched_count = 0

            for doc in pending_query.stream():
                data = doc.to_dict()
                target_tower = data.get("target_tower_id", 0)

                if target_tower != 0 and target_tower != self.tower_id:
                    continue

                alert_level = data.get("alert_level", 2)
                alert_code = data.get("alert_code", 0x0001)
                headline = data.get("alert_title", "ADMIN EMERGENCY BROADCAST")
                message = data.get("message", "Attention all units.")

                logger.warning(f"🚨 [DASHBOARD BROADCAST] Received Admin Broadcast: {headline} (Code 0x{alert_code:04X})")

                bcast_pkt = QRPacket(
                    version     = 0x01,
                    msg_type    = MSG_BROADCAST,
                    device_id   = self.tower_id,
                    seq         = self.tx_seq,
                    hop_count   = 0,
                    ttl         = 7,
                    lat         = 0,
                    lon         = 0,
                    gps_flags   = GPS_UNAVAILABLE,
                    rssi        = 0,
                    battery     = 100,
                    motion      = 0,
                    timestamp   = int(time.time()),
                    alert_level = alert_level,
                    alert_code  = alert_code
                )
                self.tx_seq = (self.tx_seq + 1) & 0xFFFF

                wire = encode(bcast_pkt, psk=PSK_DEV)
                self.lora.send_packet(wire)
                logger.info(f"📡 [LoRa TX] Dispatched Admin Broadcast over radio (Alert Code 0x{alert_code:04X})")

                if self.alert_mgr:
                    self.alert_mgr.trigger_severe_external_alert(
                        source="ADMIN_DASHBOARD",
                        hazard_type="EVACUATION",
                        headline=headline,
                        description=message
                    )

                doc_ref = bcast_coll.document(doc.id)
                doc_ref.update({
                    "dispatched_to_lora": True,
                    "dispatched_at": int(time.time()),
                    "dispatched_by_tower": self.tower_id
                })

                self.storage.record_broadcast(
                    alert_level=alert_level,
                    alert_code=alert_code,
                    alert_title=headline,
                    message=message,
                    sent_by="DASHBOARD_COMMANDER"
                )

                dispatched_count += 1

            return dispatched_count
        except Exception as e:
            logger.error(f"[SYNC] Error pulling admin broadcasts: {e}")
            return 0

    def run_sync_cycle(self):
        """Execute one complete upload and download synchronization pass."""
        if not self.is_online():
            logger.debug("[SYNC] Currently offline. Buffering records in SQLite...")
            return

        self.sync_events()
        self.sync_devices()
        self.sync_sensors()
        self.sync_tower_heartbeat()

        self.pull_admin_broadcasts()

    def run(self):
        self.running = True
        logger.info(f"QuickRescue Cloud Sync Service active (Tower ID: 0x{self.tower_id:04X})")

        while self.running:
            try:
                self.run_sync_cycle()
                time.sleep(5.0)
            except KeyboardInterrupt:
                logger.info("Stopping Cloud Sync Service...")
                break
            except Exception as e:
                logger.error(f"Unexpected error in cloud sync loop: {e}", exc_info=True)
                time.sleep(10.0)

        self.running = False

def main():
    service = FirebaseSyncService()
    service.run()

if __name__ == "__main__":
    main()
