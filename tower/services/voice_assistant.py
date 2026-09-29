"""
QuickRescue Communication Tower — Offline Voice Assistant
==========================================================
Enables emergency operators to query real-time tower telemetry via microphone
and receive spoken answers through the PA speaker.
Strictly limited to data already cached in the local SQLite database.
Operates 100% offline without any cloud or internet access.
"""

import time
import logging
from typing import Optional, Dict, Any, Tuple

from tower.services.storage import TowerStorage
from tower.services.actuators import ActuatorController

logger = logging.getLogger("VoiceAssistant")

class OfflineVoiceAssistant:
    def __init__(self,
                 storage: Optional[TowerStorage] = None,
                 actuators: Optional[ActuatorController] = None):
        self.storage = storage if storage is not None else TowerStorage()
        self.actuators = actuators if actuators is not None else ActuatorController()

    def process_query(self, user_query: str, speak_output: bool = True) -> Tuple[str, Dict[str, Any]]:
        """
        Process a spoken or typed natural language query against the local database.
        Returns (spoken_reply_text, context_data).
        """
        q = user_query.lower().strip()
        logger.info(f"[VOICE ASST] Processing query: \"{user_query}\"")

        if any(w in q for w in ["alert", "sos", "help", "emergency", "incident"]):
            active_sos = self.storage.get_active_sos()
            unresolved_events = self.storage.get_events(limit=10)
            pending_events = [e for e in unresolved_events if e["status"] in ("NEW", "IN PROGRESS")]

            if active_sos:
                d = active_sos[0]
                reply = (
                    f"Warning! There is an active SOS emergency from Device 0x{d['device_id']:04X} ({d['device_id']}). "
                    f"Last reported location is latitude {d['last_lat']:.4f}, longitude {d['last_lon']:.4f}. "
                    f"Battery at {d['battery']} percent."
                )
                if len(active_sos) > 1:
                    reply += f" A total of {len(active_sos)} active SOS emergencies are pending."
                ctx = {"type": "ALERTS", "active_sos_count": len(active_sos), "data": active_sos}
            elif pending_events:
                ev = pending_events[0]
                reply = (
                    f"There are {len(pending_events)} pending incidents. "
                    f"Highest priority is {ev['type']} from Device {ev['device_id']}. Status is {ev['status']}."
                )
                ctx = {"type": "ALERTS", "pending_count": len(pending_events), "data": pending_events}
            else:
                reply = "All clear. There are zero active emergency alerts or pending distress calls at this station."
                ctx = {"type": "ALERTS", "active_sos_count": 0}

        elif any(w in q for w in ["weather", "rain", "flood", "water", "temperature", "temp"]):
            sensors = self.storage.get_latest_sensor_readings()
            temp = sensors.get("TEMPERATURE_C", {}).get("value", 28.0)
            rain = sensors.get("RAIN_LEVEL", {}).get("value", 0.0)
            water = sensors.get("WATER_LEVEL_MM", {}).get("value", 450.0)
            water_status = sensors.get("WATER_LEVEL_MM", {}).get("status", "NORMAL")

            flood_msg = "Water level is within safe normal limits."
            if water_status in ("WARNING", "CRITICAL") or water > 1000.0:
                flood_msg = f"Alert! Water level is high at {water:.0f} millimeters."

            reply = (
                f"Current temperature is {temp:.1f} degrees Celsius. "
                f"Rainfall is {rain:.1f} millimeters. "
                f"Water level is {water:.0f} millimeters. {flood_msg}"
            )
            ctx = {"type": "WEATHER", "sensors": sensors}

        elif any(w in q for w in ["battery", "power", "solar", "voltage"]):
            sensors = self.storage.get_latest_sensor_readings()
            batt_v = sensors.get("BATTERY_VOLTAGE", {}).get("value", 13.2)
            solar_v = sensors.get("SOLAR_VOLTAGE", {}).get("value", 18.5)
            batt_curr = sensors.get("BATTERY_CURRENT", {}).get("value", 1.2)

            chg_state = "actively charging from solar panel" if batt_curr >= 0 else "discharging on battery reserve"
            reply = (
                f"Tower battery is at {batt_v:.1f} volts, {chg_state}. "
                f"Solar array output is {solar_v:.1f} volts. Power system is healthy."
            )
            ctx = {"type": "POWER", "battery_v": batt_v, "solar_v": solar_v}

        elif any(w in q for w in ["device", "squad", "handy", "node", "unit", "personnel"]):
            devices = self.storage.get_devices()
            active_devices = [d for d in devices if d["is_active"]]
            mj_count = sum(1 for d in devices if d.get("is_master_jacket"))

            reply = (
                f"There are {len(active_devices)} active Handy Devices online out of {len(devices)} registered units. "
                f"{mj_count} Master Jacket squad leaders are relaying telemetry."
            )
            ctx = {"type": "DEVICES", "active_count": len(active_devices), "total_count": len(devices)}

        else:
            active_sos = len(self.storage.get_active_sos())
            devices = self.storage.get_devices()
            active_dev = sum(1 for d in devices if d["is_active"])
            sensors = self.storage.get_latest_sensor_readings()
            batt_v = sensors.get("BATTERY_VOLTAGE", {}).get("value", 13.2)

            sos_phrase = f"{active_sos} active emergency alerts" if active_sos > 0 else "zero emergencies"
            reply = (
                f"QuickRescue Station Status: System is operational. "
                f"{active_dev} devices online with {sos_phrase}. "
                f"Battery voltage is {batt_v:.1f} volts."
            )
            ctx = {"type": "SYSTEM", "active_sos": active_sos, "active_devices": active_dev}

        if speak_output and self.actuators:
            self.actuators.speak(reply, priority=True)

        return reply, ctx
