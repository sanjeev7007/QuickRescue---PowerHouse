"""
QuickRescue Communication Tower — Local REST API & Kiosk Host
==============================================================
FastAPI REST service providing endpoints for:
  - Touchscreen Kiosk UI (served at http://localhost:8000/)
  - Incident event management (SOS/HELP priority, status toggles)
  - Offline Voice Assistant integration (/api/voice/query)
  - Siren silence and actuator control
  - Cloud Sync Service buffer
"""

import os
import sys
import time
import logging
from typing import Optional, List, Dict, Any

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from tower.services.storage import TowerStorage, VALID_STATUSES
from tower.services.actuators import ActuatorController
from tower.services.voice_assistant import OfflineVoiceAssistant

logger = logging.getLogger("TowerAPI")

DB_PATH = os.environ.get("TOWER_DB_PATH", "tower.db")
storage = TowerStorage(db_path=DB_PATH)
actuators = ActuatorController()
voice_assistant = OfflineVoiceAssistant(storage=storage, actuators=actuators)

try:
    from fastapi import FastAPI, HTTPException, Query, status
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.staticfiles import StaticFiles
    from pydantic import BaseModel, Field

    app = FastAPI(
        title="QuickRescue Tower Local REST API & Kiosk UI",
        description="Offline-first REST API and Kiosk interface for on-tower touchscreen",
        version="1.0.0"
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    class StatusUpdateModel(BaseModel):
        status: str = Field(..., description="NEW, ACKNOWLEDGED, IN PROGRESS, RESOLVED")

    class BroadcastCreateModel(BaseModel):
        alert_level: int = Field(2, ge=1, le=3, description="1=Info, 2=Warning, 3=Critical")
        alert_code: int = Field(..., description="ALERT_* constant, e.g. 0x0002 for Flood")
        alert_title: str = Field(..., max_length=64)
        message: str = Field(..., max_length=256)
        sent_by: Optional[str] = "TOWER_OPERATOR"

    class SensorReadingModel(BaseModel):
        sensor_type: str = Field(..., description="BATTERY_VOLTAGE, RAIN_LEVEL, WATER_LEVEL_MM, etc.")
        value: float
        unit: str
        status: Optional[str] = "NORMAL"

    class ExternalAlertModel(BaseModel):
        source: str = Field(..., description="NDRF, IMD, CIVIL_DEFENSE")
        severity: str = Field(..., description="INFO, WARNING, SEVERE, EXTREME")
        hazard_type: str = Field(..., description="FLOOD, CYCLONE, LANDSLIDE, EARTHQUAKE, INDUSTRIAL")
        headline: str
        description: str

    class SyncAckModel(BaseModel):
        sync_ids: List[int]

    class VoiceQueryModel(BaseModel):
        query: str = Field(..., description="Natural language voice query text from microphone")

    @app.get("/api/health", tags=["Health"])
    def get_health():
        devices = storage.get_devices()
        active_devices = [d for d in devices if d["is_active"]]
        active_sos = storage.get_active_sos()
        latest_sensors = storage.get_latest_sensor_readings()

        return {
            "status": "ONLINE",
            "mode": "OFFLINE_FIRST",
            "server_time": int(time.time()),
            "network_health": {
                "total_devices_registered": len(devices),
                "active_devices_online": len(active_devices),
                "active_sos_count": len(active_sos),
            },
            "power_and_environment": latest_sensors,
            "database": {
                "path": storage.db_path,
                "size_bytes": os.path.getsize(storage.db_path) if os.path.exists(storage.db_path) else 0
            }
        }

    @app.get("/api/events", tags=["Events"])
    def list_events(
        status: Optional[str] = Query(None, description="Filter by status: NEW, ACKNOWLEDGED, IN PROGRESS, RESOLVED"),
        type: Optional[str] = Query(None, description="Filter by event type: SOS, HELP, SAFE, etc."),
        device_id: Optional[int] = Query(None, description="Filter by device ID"),
        limit: int = Query(100, ge=1, le=500)
    ):
        """
        Returns all events strictly ordered by priority:
        SOS (1) > HELP (2) > BROADCAST (3) > SAFE (4) > HEARTBEAT (5) > INFO (6).
        """
        return storage.get_events(status=status, event_type=type, device_id=device_id, limit=limit)

    @app.get("/api/events/{event_id}", tags=["Events"])
    def get_event(event_id: int):
        event = storage.get_event_by_id(event_id)
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")
        return event

    @app.patch("/api/events/{event_id}/status", tags=["Events"])
    def update_event_status(event_id: int, payload: StatusUpdateModel):
        new_status = payload.status.upper().strip()
        if new_status not in VALID_STATUSES:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid status '{payload.status}'. Must be one of: {sorted(list(VALID_STATUSES))}"
            )
        success = storage.update_event_status(event_id, new_status)
        if not success:
            raise HTTPException(status_code=404, detail="Event not found")
        return {"id": event_id, "status": new_status, "updated": True}

    @app.get("/api/devices", tags=["Devices"])
    def list_devices(active_window_sec: int = Query(180, description="Seconds without heartbeat to consider offline")):
        return storage.get_devices(active_window_sec=active_window_sec)

    @app.get("/api/devices/{device_id}", tags=["Devices"])
    def get_device(device_id: int):
        dev = storage.get_device_by_id(device_id)
        if not dev:
            raise HTTPException(status_code=404, detail="Device not found")
        return dev

    @app.post("/api/voice/query", tags=["Voice Assistant"])
    def voice_query(payload: VoiceQueryModel):
        """
        Processes voice query from operator microphone, answers from local database,
        speaks response through PA speaker, and returns JSON for UI display.
        """
        spoken_reply, context = voice_assistant.process_query(payload.query, speak_output=True)
        return {
            "query": payload.query,
            "spoken_reply": spoken_reply,
            "context": context
        }

    @app.post("/api/alerts/silence", tags=["Actuators"])
    def silence_alarms():
        """Silence siren and log operator acknowledge action."""
        actuators.siren_off()
        active_sos = storage.get_active_sos()
        if active_sos:
            actuators.set_light("AMBER")
        else:
            actuators.set_light("GREEN")

        storage.record_event(
            event_type="INFO",
            device_id=0x0001,
            lat=0.0,
            lon=0.0,
            location_state="UNAVAILABLE",
            rssi=0,
            battery=100,
            status="ACKNOWLEDGED",
            details={"action": "ALARM_SILENCED", "operator": "TOUCHSCREEN_UI", "time": time.time()}
        )
        return {"status": "SILENCED", "light_state": actuators.light_state}

    @app.get("/api/broadcasts", tags=["Broadcasts"])
    def list_broadcasts(limit: int = Query(50, ge=1, le=200)):
        return storage.get_broadcasts(limit=limit)

    @app.post("/api/broadcasts", tags=["Broadcasts"], status_code=status.HTTP_201_CREATED)
    def create_broadcast(payload: BroadcastCreateModel):
        bcast_id = storage.record_broadcast(
            alert_level=payload.alert_level,
            alert_code=payload.alert_code,
            alert_title=payload.alert_title,
            message=payload.message,
            sent_by=payload.sent_by or "TOWER_OPERATOR"
        )
        return {"id": bcast_id, "status": "QUEUED_FOR_BROADCAST", "title": payload.alert_title}

    @app.get("/api/sensors/latest", tags=["Sensors"])
    def get_latest_sensors():
        return storage.get_latest_sensor_readings()

    @app.post("/api/sensors", tags=["Sensors"], status_code=status.HTTP_201_CREATED)
    def record_sensor_reading(payload: SensorReadingModel):
        reading_id = storage.record_sensor_reading(
            sensor_type=payload.sensor_type,
            value=payload.value,
            unit=payload.unit,
            status=payload.status or "NORMAL"
        )
        return {"id": reading_id, "status": "RECORDED"}

    @app.get("/api/external-alerts", tags=["External Alerts"])
    def list_external_alerts(active_only: bool = Query(True)):
        return storage.get_external_alerts(active_only=active_only)

    @app.post("/api/external-alerts", tags=["External Alerts"], status_code=status.HTTP_201_CREATED)
    def create_external_alert(payload: ExternalAlertModel):
        alert_id = storage.record_external_alert(
            source=payload.source,
            severity=payload.severity,
            hazard_type=payload.hazard_type,
            headline=payload.headline,
            description=payload.description
        )
        return {"id": alert_id, "status": "ACTIVE"}

    @app.get("/api/sync/queue", tags=["Sync"])
    def get_sync_queue(limit: int = Query(50, ge=1, le=200)):
        return storage.get_sync_queue(limit=limit)

    @app.post("/api/sync/ack", tags=["Sync"])
    def acknowledge_sync(payload: SyncAckModel):
        storage.mark_sync_completed(payload.sync_ids)
        return {"acknowledged_count": len(payload.sync_ids)}

    UI_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "ui"))
    if os.path.exists(UI_DIR):
        app.mount("/", StaticFiles(directory=UI_DIR, html=True), name="kiosk_ui")

except ImportError:
    logger.warning("FastAPI not installed in environment.")
    app = None

def run_server(host: str = "0.0.0.0", port: int = 8000):
    import uvicorn
    logger.info(f"Starting QuickRescue Tower REST API & Touchscreen Kiosk on http://{host}:{port}")
    uvicorn.run("tower.services.api:app", host=host, port=port, reload=False, log_level="info")

if __name__ == "__main__":
    run_server()
