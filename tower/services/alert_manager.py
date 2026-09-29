"""
QuickRescue Communication Tower — Alert Output Manager
========================================================
Coordinates hardware and offline actuators:
  - Tri-colour light : Green = normal, Amber = warning/HELP, Red = SOS/severe alert
  - Industrial siren : ON for SOS & severe alerts, auto-off after timeout
  - P10 LED board    : Scrolls current weather + latest disaster alert
  - Speaker (TTS)    : Announces new SOS/HELP and severe alerts offline
  - Reset button     : Acknowledges & silences alarms, logs who and when to database
"""

import time
import logging
from typing import Optional, Dict, Any

from tower.services.actuators import ActuatorController
from tower.services.storage import TowerStorage

logger = logging.getLogger("AlertManager")

class AlertManager:
    def __init__(self,
                 storage: Optional[TowerStorage] = None,
                 actuators: Optional[ActuatorController] = None,
                 siren_timeout_sec: float = 30.0,
                 force_simulated: bool = False):
        self.storage = storage if storage is not None else TowerStorage()
        self.actuators = actuators if actuators is not None else ActuatorController(
            siren_auto_off_sec=siren_timeout_sec,
            force_simulated=force_simulated,
            on_reset_pressed=self.handle_reset_button
        )

        self.actuators.on_reset_pressed = self.handle_reset_button

        self.current_alert_level = "NORMAL"
        self.active_alert_info = None

        self.reset_to_normal(log_audit=False)

    def trigger_sos_alert(self,
                          device_id: int,
                          lat: float,
                          lon: float,
                          battery: int,
                          location_state: str = "VALID",
                          seq: int = 1):
        """
        Trigger high-priority SOS emergency alert:
          - Light -> RED
          - Siren -> ON (auto-off in 30s)
          - P10 -> Scroll SOS emergency text
          - Speaker -> Offline voice announcement
        """
        self.current_alert_level = "CRITICAL"
        self.active_alert_info = {
            "type": "SOS",
            "device_id": device_id,
            "lat": lat,
            "lon": lon,
            "time": time.time()
        }

        self.actuators.set_light("RED")

        self.actuators.siren_on()

        alert_msg = f"EMERGENCY SOS: DEV 0x{device_id:04X} AT {lat:.4f},{lon:.4f} ({location_state})"
        self.actuators.update_p10(alert_text=alert_msg)

        speech_text = (
            f"Emergency SOS alert from Handy Device {device_id}. "
            f"Location coordinates: latitude {lat:.4f}, longitude {lon:.4f}. "
            f"Battery at {battery} percent. Immediate rescue response required."
        )
        self.actuators.speak(speech_text, priority=True)

        logger.warning(f"🚨 [ALERT MANAGER] Processed SOS from Device 0x{device_id:04X}")

    def trigger_help_alert(self,
                           device_id: int,
                           lat: float,
                           lon: float,
                           battery: int,
                           location_state: str = "VALID"):
        """
        Trigger urgent HELP distress alert:
          - Light -> AMBER
          - Siren -> OFF (keeps siren reserved for life-threat SOS)
          - P10 -> Scroll HELP text
          - Speaker -> Offline voice announcement
        """
        if self.current_alert_level != "CRITICAL":
            self.current_alert_level = "WARNING"
            self.actuators.set_light("AMBER")

        alert_msg = f"HELP REQUESTED: DEV 0x{device_id:04X} AT {lat:.4f},{lon:.4f}"
        self.actuators.update_p10(alert_text=alert_msg)

        speech_text = (
            f"Attention: Help requested from Device {device_id} at location {lat:.4f}, {lon:.4f}. "
            f"Battery at {battery} percent."
        )
        self.actuators.speak(speech_text, priority=False)

        logger.info(f"[ALERT MANAGER] Processed HELP from Device 0x{device_id:04X}")

    def trigger_severe_external_alert(self,
                                      source: str,
                                      hazard_type: str,
                                      headline: str,
                                      description: str):
        """
        Trigger severe civil defense alert (NDRF, IMD flood, cyclone, etc.):
          - Light -> RED
          - Siren -> ON
          - P10 -> Scroll hazard evacuation text
          - Speaker -> Offline warning broadcast
        """
        self.current_alert_level = "CRITICAL"
        self.actuators.set_light("RED")
        self.actuators.siren_on()

        alert_msg = f"EVACUATION WARNING ({hazard_type}): {headline}"
        self.actuators.update_p10(alert_text=alert_msg)

        speech_text = f"Severe disaster warning from {source}. {headline}. {description}"
        self.actuators.speak(speech_text, priority=True)

        logger.warning(f"🚨 [ALERT MANAGER] Severe external alert activated: {headline}")

    def handle_reset_button(self, operator_name: str = "TOWER_OPERATOR"):
        """
        Hardware Reset Button or Dashboard Silence Action:
          - Silences siren immediately
          - Acknowledges active alert
          - Updates P10 display
          - Writes audit log to local database
        """
        now_ts = time.strftime("%Y-%m-%d %H:%M:%S")
        logger.info(f"[RESET] Reset button activated by {operator_name} at {now_ts}")

        self.actuators.siren_off()

        active_sos = self.storage.get_active_sos()

        if active_sos:
            self.current_alert_level = "WARNING"
            self.actuators.set_light("AMBER")
            self.actuators.update_p10(alert_text=f"ALERT SILENCED BY {operator_name} - SOS IN PROGRESS")
            self.actuators.speak("Alert acknowledged. Siren silenced. Rescue operation in progress.")
        else:
            self.reset_to_normal(log_audit=False)
            self.actuators.speak("Alert acknowledged. All systems normal.")

        try:
            self.storage.record_event(
                event_type="INFO",
                device_id=0x0001,
                lat=0.0,
                lon=0.0,
                location_state="UNAVAILABLE",
                rssi=0,
                battery=100,
                status="ACKNOWLEDGED",
                details={
                    "action": "ALARM_SILENCED",
                    "operator": operator_name,
                    "timestamp": now_ts,
                    "previous_level": self.current_alert_level
                }
            )
        except Exception as e:
            logger.error(f"[RESET] Failed to log audit event: {e}")

    def reset_to_normal(self, log_audit: bool = True):
        """Restore tower outputs to quiescent green state."""
        self.current_alert_level = "NORMAL"
        self.active_alert_info = None

        self.actuators.set_light("GREEN")
        self.actuators.siren_off()
        self.actuators.update_p10(alert_text="QUICKRESCUE TOWER - SYSTEM NORMAL")

        if log_audit:
            logger.info("[ALERT MANAGER] Restored to NORMAL state")

    def update_weather_display(self, temp_c: float, rain_mm: float, batt_v: float):
        """Update the background weather ticker on the P10 board."""
        weather_str = f"TEMP: {temp_c:.1f}C | RAIN: {rain_mm:.1f}mm | BATT: {batt_v:.1f}V"
        self.actuators.update_p10(weather_info=weather_str)
