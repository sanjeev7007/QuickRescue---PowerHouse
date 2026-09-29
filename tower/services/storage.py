"""
QuickRescue Communication Tower — Offline-First Storage Layer
==============================================================
Manages local SQLite database (tower.db) with 6 core tables:
  1. devices          — registry, network health (last seen, RSSI, hop count), heartbeat status
  2. events           — incident log with strict priority (SOS > HELP > ...), lifecycle status
  3. broadcasts       — tower-to-squad alerts (flood, evac, gas)
  4. sensor_readings  — local weather, water level, battery voltage/current
  5. external_alerts  — incoming disaster warnings (NDRF, IMD)
  6. sync_queue       — offline queue for syncing to Cloud / Firebase
  + tampered_packets  — security audit for corrupted/tampered packets
"""

import sqlite3
import os
import time
import json
import logging
from typing import Optional, List, Dict, Any

from protocol.codec_reference import (
    QRPacket, MSG_NAMES, GPS_FLAG_NAMES, MOTION_NAMES,
    MSG_SAFE, MSG_HELP, MSG_SOS, MSG_HEARTBEAT, MSG_BROADCAST, MSG_ACK
)

logger = logging.getLogger("TowerStorage")

PRIORITY_MAP = {
    "SOS": 1,
    "HELP": 2,
    "BROADCAST": 3,
    "SAFE": 4,
    "HEARTBEAT": 5,
    "INFO": 6
}

VALID_STATUSES = {"NEW", "ACKNOWLEDGED", "IN PROGRESS", "RESOLVED"}

HEARTBEAT_ACTIVE_TIMEOUT_SEC = 180

class TowerStorage:
    def __init__(self, db_path: str = "tower.db"):
        self.db_path = db_path
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, timeout=15.0)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self):
        """Create tables and indexes if they do not exist."""
        os.makedirs(os.path.dirname(os.path.abspath(self.db_path)), exist_ok=True)
        with self._get_connection() as conn:
            cursor = conn.cursor()

            cursor.execute("""
                CREATE TABLE IF NOT EXISTS devices (
                    device_id INTEGER PRIMARY KEY,
                    name TEXT,
                    is_master_jacket INTEGER DEFAULT 0,
                    first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    last_seen_epoch INTEGER NOT NULL,
                    last_heartbeat TIMESTAMP,
                    last_heartbeat_epoch INTEGER,
                    last_msg_type TEXT NOT NULL,
                    last_seq INTEGER NOT NULL,
                    last_lat REAL NOT NULL,
                    last_lon REAL NOT NULL,
                    gps_status TEXT NOT NULL,
                    battery INTEGER NOT NULL,
                    motion INTEGER NOT NULL,
                    last_rssi INTEGER NOT NULL,
                    hop_count INTEGER NOT NULL,
                    is_sos_active INTEGER DEFAULT 0
                )
            """)

            cursor.execute("""
                CREATE TABLE IF NOT EXISTS events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    type TEXT NOT NULL,
                    priority INTEGER NOT NULL,
                    device_id INTEGER NOT NULL,
                    time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    event_time INTEGER NOT NULL,
                    lat REAL NOT NULL,
                    lon REAL NOT NULL,
                    location_state TEXT NOT NULL,
                    rssi INTEGER NOT NULL,
                    battery INTEGER NOT NULL,
                    status TEXT DEFAULT 'NEW',
                    synced INTEGER DEFAULT 0,
                    raw_hex TEXT,
                    details TEXT
                )
            """)

            cursor.execute("""
                CREATE TABLE IF NOT EXISTS broadcasts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    created_epoch INTEGER NOT NULL,
                    alert_level INTEGER NOT NULL,
                    alert_code INTEGER NOT NULL,
                    alert_title TEXT NOT NULL,
                    message TEXT NOT NULL,
                    sent_by TEXT DEFAULT 'TOWER_OPERATOR',
                    tx_count INTEGER DEFAULT 0,
                    synced INTEGER DEFAULT 0
                )
            """)

            cursor.execute("""
                CREATE TABLE IF NOT EXISTS sensor_readings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    recorded_epoch INTEGER NOT NULL,
                    sensor_type TEXT NOT NULL,
                    value REAL NOT NULL,
                    unit TEXT NOT NULL,
                    status TEXT DEFAULT 'NORMAL',
                    synced INTEGER DEFAULT 0
                )
            """)

            cursor.execute("""
                CREATE TABLE IF NOT EXISTS external_alerts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    source TEXT NOT NULL,
                    received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    received_epoch INTEGER NOT NULL,
                    severity TEXT NOT NULL,
                    hazard_type TEXT NOT NULL,
                    headline TEXT NOT NULL,
                    description TEXT NOT NULL,
                    active INTEGER DEFAULT 1,
                    broadcasted INTEGER DEFAULT 0
                )
            """)

            cursor.execute("""
                CREATE TABLE IF NOT EXISTS sync_queue (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    entity_type TEXT NOT NULL,
                    entity_id INTEGER NOT NULL,
                    action TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    retry_count INTEGER DEFAULT 0,
                    status TEXT DEFAULT 'PENDING'
                )
            """)

            cursor.execute("""
                CREATE TABLE IF NOT EXISTS tampered_packets (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    raw_hex TEXT NOT NULL,
                    length INTEGER NOT NULL,
                    error_reason TEXT NOT NULL,
                    rssi INTEGER NOT NULL
                )
            """)

            cursor.execute("CREATE INDEX IF NOT EXISTS idx_events_priority ON events (priority, event_time DESC)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_events_status ON events (status)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_events_dev ON events (device_id)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_events_synced ON events (synced)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_devices_heartbeat ON devices (last_heartbeat_epoch)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue (status)")

            conn.commit()
            logger.info(f"Offline-first SQLite storage verified at: {self.db_path}")

    def record_event(self,
                     event_type: str,
                     device_id: int,
                     lat: float,
                     lon: float,
                     location_state: str,
                     rssi: int,
                     battery: int,
                     status: str = "NEW",
                     event_time: Optional[int] = None,
                     raw_hex: str = "",
                     details: Optional[Dict[str, Any]] = None) -> int:
        """
        Record an incident event with strict priority ordering.
        SOS=1 > HELP=2 > BROADCAST=3 > SAFE=4 > HEARTBEAT=5 > INFO=6.
        """
        event_type_upper = event_type.upper()
        priority = PRIORITY_MAP.get(event_type_upper, 6)
        if status not in VALID_STATUSES:
            status = "NEW"

        now_epoch = event_time if event_time is not None else int(time.time())
        details_json = json.dumps(details or {})

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO events (
                    type, priority, device_id, event_time, lat, lon,
                    location_state, rssi, battery, status, synced, raw_hex, details
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
            """, (
                event_type_upper, priority, device_id, now_epoch,
                lat, lon, location_state, rssi, battery, status, raw_hex, details_json
            ))
            event_id = cursor.lastrowid

            cursor.execute("""
                INSERT INTO sync_queue (entity_type, entity_id, action, payload_json, status)
                VALUES ('EVENT', ?, 'INSERT', ?, 'PENDING')
            """, (event_id, json.dumps({
                "id": event_id,
                "type": event_type_upper,
                "priority": priority,
                "device_id": device_id,
                "event_time": now_epoch,
                "lat": lat,
                "lon": lon,
                "location_state": location_state,
                "rssi": rssi,
                "battery": battery,
                "status": status,
                "details": details or {}
            })))

            conn.commit()
            return event_id

    def get_events(self,
                   status: Optional[str] = None,
                   event_type: Optional[str] = None,
                   device_id: Optional[int] = None,
                   limit: int = 100) -> List[Dict[str, Any]]:
        """
        Fetch events sorted strictly by priority (SOS > HELP > ...), then by time.
        """
        query = "SELECT * FROM events WHERE 1=1"
        params: List[Any] = []

        if status:
            query += " AND status = ?"
            params.append(status.upper())
        if event_type:
            query += " AND type = ?"
            params.append(event_type.upper())
        if device_id is not None:
            query += " AND device_id = ?"
            params.append(device_id)

        query += " ORDER BY priority ASC, event_time DESC, id DESC LIMIT ?"
        params.append(limit)

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(query, params)
            rows = cursor.fetchall()
            result = []
            for r in rows:
                item = dict(r)
                if item.get("details"):
                    try:
                        item["details"] = json.loads(item["details"])
                    except Exception:
                        pass
                result.append(item)
            return result

    def get_event_by_id(self, event_id: int) -> Optional[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM events WHERE id = ?", (event_id,))
            row = cursor.fetchone()
            if not row:
                return None
            item = dict(row)
            if item.get("details"):
                try:
                    item["details"] = json.loads(item["details"])
                except Exception:
                    pass
            return item

    def update_event_status(self, event_id: int, new_status: str) -> bool:
        """Update event lifecycle status: NEW, ACKNOWLEDGED, IN PROGRESS, RESOLVED."""
        status_clean = new_status.upper().strip()
        if status_clean not in VALID_STATUSES:
            raise ValueError(f"Invalid status: {new_status}. Allowed: {VALID_STATUSES}")

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("UPDATE events SET status = ? WHERE id = ?", (status_clean, event_id))
            if cursor.rowcount == 0:
                return False

            cursor.execute("""
                INSERT INTO sync_queue (entity_type, entity_id, action, payload_json, status)
                VALUES ('EVENT', ?, 'UPDATE', ?, 'PENDING')
            """, (event_id, json.dumps({"id": event_id, "status": status_clean})))

            conn.commit()
            return True

    def store_packet(self, pkt: QRPacket, raw_wire: bytes, rssi: int = 0) -> int:
        """
        Ingest a decoded QRPacket from the LoRa receiver.
        Updates device state and creates an incident event for SAFE/HELP/SOS/BROADCAST.
        """
        msg_name = MSG_NAMES.get(pkt.msg_type, f"TYPE_{pkt.msg_type}")
        gps_status = GPS_FLAG_NAMES.get(pkt.gps_flags, f"FLAG_{pkt.gps_flags}")
        lat_deg = pkt.lat / 1e6
        lon_deg = pkt.lon / 1e6
        now_epoch = int(time.time())
        wire_hex = raw_wire.hex().upper()

        self.upsert_device(
            device_id=pkt.device_id,
            msg_type=msg_name,
            seq=pkt.seq,
            lat=lat_deg,
            lon=lon_deg,
            gps_status=gps_status,
            battery=pkt.battery,
            motion=pkt.motion,
            rssi=rssi,
            hop_count=pkt.hop_count,
            is_sos=(pkt.msg_type == MSG_SOS),
            is_heartbeat=(pkt.msg_type == MSG_HEARTBEAT)
        )

        event_id = 0
        if pkt.msg_type in (MSG_SOS, MSG_HELP, MSG_SAFE, MSG_BROADCAST):
            details = {
                "seq": pkt.seq,
                "hop_count": pkt.hop_count,
                "ttl": pkt.ttl,
                "motion": MOTION_NAMES.get(pkt.motion, "UNKNOWN"),
                "alert_level": pkt.alert_level,
                "alert_code": pkt.alert_code
            }
            event_id = self.record_event(
                event_type=msg_name,
                device_id=pkt.device_id,
                lat=lat_deg,
                lon=lon_deg,
                location_state=gps_status,
                rssi=rssi,
                battery=pkt.battery,
                status="NEW",
                event_time=pkt.timestamp if pkt.timestamp > 0 else now_epoch,
                raw_hex=wire_hex,
                details=details
            )

        return event_id

    def upsert_device(self,
                      device_id: int,
                      msg_type: str,
                      seq: int,
                      lat: float,
                      lon: float,
                      gps_status: str,
                      battery: int,
                      motion: int,
                      rssi: int,
                      hop_count: int,
                      is_sos: bool,
                      is_heartbeat: bool):
        """Update or insert device state with network health metrics."""
        now_epoch = int(time.time())

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT is_sos_active, last_heartbeat_epoch FROM devices WHERE device_id = ?", (device_id,))
            row = cursor.fetchone()

            if is_sos:
                new_sos = 1
            elif msg_type == "SAFE":
                new_sos = 0
            else:
                new_sos = row["is_sos_active"] if row else 0

            hb_epoch = now_epoch if is_heartbeat else (row["last_heartbeat_epoch"] if row else None)

            cursor.execute("""
                INSERT INTO devices (
                    device_id, last_seen, last_seen_epoch, last_heartbeat, last_heartbeat_epoch,
                    last_msg_type, last_seq, last_lat, last_lon, gps_status,
                    battery, motion, last_rssi, hop_count, is_sos_active
                ) VALUES (?, CURRENT_TIMESTAMP, ?, CASE WHEN ? IS NOT NULL THEN CURRENT_TIMESTAMP ELSE NULL END, ?,
                          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(device_id) DO UPDATE SET
                    last_seen = CURRENT_TIMESTAMP,
                    last_seen_epoch = excluded.last_seen_epoch,
                    last_heartbeat = CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE devices.last_heartbeat END,
                    last_heartbeat_epoch = CASE WHEN ? THEN excluded.last_seen_epoch ELSE devices.last_heartbeat_epoch END,
                    last_msg_type = excluded.last_msg_type,
                    last_seq = excluded.last_seq,
                    last_lat = excluded.last_lat,
                    last_lon = excluded.last_lon,
                    gps_status = excluded.gps_status,
                    battery = excluded.battery,
                    motion = excluded.motion,
                    last_rssi = excluded.last_rssi,
                    hop_count = excluded.hop_count,
                    is_sos_active = ?
            """, (
                device_id, now_epoch, hb_epoch, hb_epoch,
                msg_type, seq, lat, lon, gps_status,
                battery, motion, rssi, hop_count, new_sos,
                is_heartbeat, is_heartbeat, new_sos
            ))

            conn.commit()

    def get_devices(self, active_window_sec: int = HEARTBEAT_ACTIVE_TIMEOUT_SEC) -> List[Dict[str, Any]]:
        """
        Retrieve all devices with network health (last seen, RSSI, hop count)
        and live 'is_active' flag computed dynamically from last_heartbeat_epoch.
        """
        now_epoch = int(time.time())
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM devices ORDER BY is_sos_active DESC, last_seen_epoch DESC")
            devices = []
            for r in cursor.fetchall():
                d = dict(r)
                hb_epoch = d.get("last_heartbeat_epoch")
                last_contact = hb_epoch if hb_epoch else d["last_seen_epoch"]
                d["is_active"] = bool((now_epoch - last_contact) <= active_window_sec)
                d["seconds_since_last_seen"] = max(0, now_epoch - d["last_seen_epoch"])
                devices.append(d)
            return devices

    def get_device_by_id(self, device_id: int) -> Optional[Dict[str, Any]]:
        now_epoch = int(time.time())
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM devices WHERE device_id = ?", (device_id,))
            row = cursor.fetchone()
            if not row:
                return None
            d = dict(row)
            hb_epoch = d.get("last_heartbeat_epoch")
            last_contact = hb_epoch if hb_epoch else d["last_seen_epoch"]
            d["is_active"] = bool((now_epoch - last_contact) <= HEARTBEAT_ACTIVE_TIMEOUT_SEC)
            d["seconds_since_last_seen"] = max(0, now_epoch - d["last_seen_epoch"])
            return d

    def get_active_sos(self) -> List[Dict[str, Any]]:
        """Retrieve all devices with active SOS."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM devices WHERE is_sos_active = 1 ORDER BY last_seen_epoch DESC")
            return [dict(r) for r in cursor.fetchall()]

    def record_broadcast(self,
                         alert_level: int,
                         alert_code: int,
                         alert_title: str,
                         message: str,
                         sent_by: str = "TOWER_OPERATOR") -> int:
        now_epoch = int(time.time())
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO broadcasts (
                    created_epoch, alert_level, alert_code, alert_title, message, sent_by, tx_count, synced
                ) VALUES (?, ?, ?, ?, ?, ?, 1, 0)
            """, (now_epoch, alert_level, alert_code, alert_title, message, sent_by))
            bcast_id = cursor.lastrowid

            cursor.execute("""
                INSERT INTO sync_queue (entity_type, entity_id, action, payload_json, status)
                VALUES ('BROADCAST', ?, 'INSERT', ?, 'PENDING')
            """, (bcast_id, json.dumps({
                "id": bcast_id,
                "alert_level": alert_level,
                "alert_code": alert_code,
                "alert_title": alert_title,
                "message": message,
                "sent_by": sent_by,
                "created_epoch": now_epoch
            })))

            conn.commit()
            return bcast_id

    def get_broadcasts(self, limit: int = 50) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM broadcasts ORDER BY id DESC LIMIT ?", (limit,))
            return [dict(r) for r in cursor.fetchall()]

    def record_sensor_reading(self,
                              sensor_type: str,
                              value: float,
                              unit: str,
                              status: str = "NORMAL") -> int:
        now_epoch = int(time.time())
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO sensor_readings (recorded_epoch, sensor_type, value, unit, status, synced)
                VALUES (?, ?, ?, ?, ?, 0)
            """, (now_epoch, sensor_type.upper(), value, unit, status))
            reading_id = cursor.lastrowid
            conn.commit()
            return reading_id

    def get_latest_sensor_readings(self) -> Dict[str, Dict[str, Any]]:
        """Get the single most recent reading for each sensor type."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT s1.* FROM sensor_readings s1
                INNER JOIN (
                    SELECT sensor_type, MAX(id) as max_id
                    FROM sensor_readings
                    GROUP BY sensor_type
                ) s2 ON s1.id = s2.max_id
            """)
            result = {}
            for r in cursor.fetchall():
                d = dict(r)
                result[d["sensor_type"]] = d
            return result

    def record_external_alert(self,
                              source: str,
                              severity: str,
                              hazard_type: str,
                              headline: str,
                              description: str) -> int:
        now_epoch = int(time.time())
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO external_alerts (
                    source, received_epoch, severity, hazard_type, headline, description, active, broadcasted
                ) VALUES (?, ?, ?, ?, ?, ?, 1, 0)
            """, (source.upper(), now_epoch, severity.upper(), hazard_type.upper(), headline, description))
            alert_id = cursor.lastrowid
            conn.commit()
            return alert_id

    def get_external_alerts(self, active_only: bool = True) -> List[Dict[str, Any]]:
        query = "SELECT * FROM external_alerts"
        params = []
        if active_only:
            query += " WHERE active = 1"
        query += " ORDER BY id DESC"

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(query, params)
            return [dict(r) for r in cursor.fetchall()]

    def get_sync_queue(self, limit: int = 50) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT * FROM sync_queue WHERE status = 'PENDING'
                ORDER BY id ASC LIMIT ?
            """, (limit,))
            return [dict(r) for r in cursor.fetchall()]

    def mark_sync_completed(self, sync_ids: List[int]):
        if not sync_ids:
            return
        with self._get_connection() as conn:
            cursor = conn.cursor()
            placeholders = ",".join("?" for _ in sync_ids)
            cursor.execute(f"UPDATE sync_queue SET status = 'COMPLETED' WHERE id IN ({placeholders})", sync_ids)
            conn.commit()

    def mark_sync_failed(self, sync_id: int):
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE sync_queue
                SET retry_count = retry_count + 1,
                    status = CASE WHEN retry_count >= 5 THEN 'FAILED' ELSE 'PENDING' END
                WHERE id = ?
            """, (sync_id,))
            conn.commit()

    def get_unsynced_events(self, limit: int = 50) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT * FROM events WHERE synced = 0
                ORDER BY priority ASC, event_time ASC LIMIT ?
            """, (limit,))
            return [dict(r) for r in cursor.fetchall()]

    def mark_events_synced(self, event_ids: List[int]):
        if not event_ids:
            return
        with self._get_connection() as conn:
            cursor = conn.cursor()
            placeholders = ",".join("?" for _ in event_ids)
            cursor.execute(f"UPDATE events SET synced = 1 WHERE id IN ({placeholders})", event_ids)
            conn.commit()

    def get_unsynced_sensors(self, limit: int = 50) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT * FROM sensor_readings WHERE synced = 0
                ORDER BY id ASC LIMIT ?
            """, (limit,))
            return [dict(r) for r in cursor.fetchall()]

    def mark_sensors_synced(self, reading_ids: List[int]):
        if not reading_ids:
            return
        with self._get_connection() as conn:
            cursor = conn.cursor()
            placeholders = ",".join("?" for _ in reading_ids)
            cursor.execute(f"UPDATE sensor_readings SET synced = 1 WHERE id IN ({placeholders})", reading_ids)
            conn.commit()

    def log_tampered(self, raw_wire: bytes, reason: str, rssi: int = 0) -> int:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO tampered_packets (raw_hex, length, error_reason, rssi)
                VALUES (?, ?, ?, ?)
            """, (raw_wire.hex().upper(), len(raw_wire), reason, rssi))
            conn.commit()
            return cursor.lastrowid
