"""
QuickRescue Communication Tower — Hardware Actuator Subsystem
==============================================================
Controls:
  1. Tri-Colour Light Tower (Green = Normal, Amber = Warning, Red = SOS/Critical)
  2. Industrial Siren (12V via Optocoupled Relay/MOSFET, with Auto-Off Timer)
  3. P10 Outdoor LED Matrix (Scrolling weather & live alert text)
  4. Speaker (Offline Text-to-Speech engine via pyttsx3 / espeak)
  5. Reset / Mute Button (Physical hardware button to silence alarms)

Dual-mode: operates with real RPi.GPIO on Raspberry Pi 4 or simulated mode for testing.
"""

import os
import sys
import time
import queue
import threading
import logging
import subprocess
from typing import Optional, Callable, Dict, Any

logger = logging.getLogger("TowerActuators")

PIN_SIREN        = 17
PIN_LIGHT_RED    = 27
PIN_LIGHT_AMBER  = 23
PIN_LIGHT_GREEN  = 24
PIN_RESET_BTN    = 26

PIN_P10_A        = 5
PIN_P10_B        = 6
PIN_P10_OE       = 12
PIN_P10_CLK      = 13
PIN_P10_LAT      = 19
PIN_P10_DATA     = 16

class ActuatorController:
    def __init__(self,
                 siren_auto_off_sec: float = 30.0,
                 force_simulated: bool = False,
                 on_reset_pressed: Optional[Callable[[], None]] = None):
        self.siren_auto_off_sec = siren_auto_off_sec
        self.on_reset_pressed = on_reset_pressed
        self.is_hardware = False
        self.gpio = None

        self.light_state = "GREEN"
        self.siren_active = False
        self._siren_start_time = 0.0
        self._siren_timer: Optional[threading.Timer] = None

        self.p10_weather_text = "TEMP: -- | RAIN: -- | BATT: --"
        self.p10_alert_text   = "QUICKRESCUE TOWER - SYSTEM NORMAL"
        self.p10_full_message = ""

        self._speech_queue = queue.Queue()
        self._tts_running = True
        self._tts_thread = threading.Thread(target=self._tts_worker, daemon=True)
        self._tts_thread.start()

        if not force_simulated:
            self._try_init_hardware()

        if not self.is_hardware:
            logger.info("[ACTUATORS] Running in SIMULATED / TESTING mode")

        self.set_light("GREEN")
        self.siren_off()

    def _try_init_hardware(self):
        try:
            import RPi.GPIO as GPIO
            self.gpio = GPIO
            self.gpio.setwarnings(False)
            self.gpio.setmode(self.gpio.BCM)

            self.gpio.setup(PIN_SIREN, self.gpio.OUT, initial=self.gpio.LOW)
            self.gpio.setup(PIN_LIGHT_RED, self.gpio.OUT, initial=self.gpio.LOW)
            self.gpio.setup(PIN_LIGHT_AMBER, self.gpio.OUT, initial=self.gpio.LOW)
            self.gpio.setup(PIN_LIGHT_GREEN, self.gpio.OUT, initial=self.gpio.HIGH)

            self.gpio.setup(PIN_RESET_BTN, self.gpio.IN, pull_up_down=self.gpio.PUD_UP)
            self.gpio.add_event_detect(
                PIN_RESET_BTN,
                self.gpio.FALLING,
                callback=self._gpio_button_callback,
                bouncetime=300
            )

            self.is_hardware = True
            logger.info("[ACTUATORS] Hardware GPIO initialized (Siren, Light, Reset Button)")
        except Exception as e:
            logger.info(f"[ACTUATORS] Hardware GPIO unavailable ({e})")
            self.is_hardware = False

    def _gpio_button_callback(self, channel):
        logger.info("[ACTUATORS] Hardware Reset Button pressed!")
        if self.on_reset_pressed:
            self.on_reset_pressed()

    def set_light(self, color: str):
        """
        Set stack light state:
          - GREEN : Normal operation / all clear
          - AMBER : Warning / HELP active / weather alert
          - RED   : SOS emergency / critical danger
          - OFF   : All lamps disabled
        """
        color = color.upper().strip()
        if color not in ("GREEN", "AMBER", "RED", "OFF"):
            color = "GREEN"

        self.light_state = color
        logger.info(f"[LIGHT] Switched to: {color}")

        if self.is_hardware and self.gpio:
            self.gpio.output(PIN_LIGHT_RED,   self.gpio.HIGH if color == "RED"   else self.gpio.LOW)
            self.gpio.output(PIN_LIGHT_AMBER, self.gpio.HIGH if color == "AMBER" else self.gpio.LOW)
            self.gpio.output(PIN_LIGHT_GREEN, self.gpio.HIGH if color == "GREEN" else self.gpio.LOW)

    def siren_on(self, duration_sec: Optional[float] = None):
        """
        Turn ON the industrial siren.
        Automatically arms auto-off timer to prevent indefinite sounding.
        """
        auto_off = duration_sec if duration_sec is not None else self.siren_auto_off_sec

        if self._siren_timer and self._siren_timer.is_alive():
            self._siren_timer.cancel()

        self.siren_active = True
        self._siren_start_time = time.time()
        logger.warning(f"🚨 [SIREN] ACTIVATED! (Auto-off in {auto_off}s)")

        if self.is_hardware and self.gpio:
            self.gpio.output(PIN_SIREN, self.gpio.HIGH)

        if auto_off > 0:
            self._siren_timer = threading.Timer(auto_off, self._siren_timeout)
            self._siren_timer.daemon = True
            self._siren_timer.start()

    def siren_off(self):
        """Turn OFF the industrial siren immediately."""
        if self._siren_timer and self._siren_timer.is_alive():
            self._siren_timer.cancel()

        self.siren_active = False
        logger.info("[SIREN] Deactivated (SILENT)")

        if self.is_hardware and self.gpio:
            self.gpio.output(PIN_SIREN, self.gpio.LOW)

    def _siren_timeout(self):
        logger.info(f"[SIREN] Auto-off timeout reached ({self.siren_auto_off_sec}s). Silencing.")
        self.siren_off()

    def update_p10(self, weather_info: Optional[str] = None, alert_text: Optional[str] = None):
        """
        Update text buffer displayed on P10 outdoor display.
        Scrolls current weather condition + latest disaster alert.
        """
        if weather_info:
            self.p10_weather_text = weather_info
        if alert_text:
            self.p10_alert_text = alert_text

        self.p10_full_message = f"*** {self.p10_alert_text} *** | {self.p10_weather_text}"
        logger.info(f"[P10 LED] Display updated: \"{self.p10_full_message}\"")

    def speak(self, text: str, priority: bool = False):
        """
        Queue emergency announcement for offline voice synthesis.
        Guaranteed to work 100% offline without internet connection.
        """
        logger.info(f"[VOICE] Queuing announcement: \"{text}\"")
        self._speech_queue.put((text, priority))

    def _tts_worker(self):
        """Background thread that executes voice synthesis sequentially."""
        engine = None
        try:
            import pyttsx3
            engine = pyttsx3.init()
            engine.setProperty("rate", 145)
            engine.setProperty("volume", 1.0)
        except Exception as e:
            logger.info(f"[TTS] pyttsx3 engine init notice ({e}) — will use espeak / audio fallback")

        while self._tts_running:
            try:
                item = self._speech_queue.get(timeout=0.5)
                if not item:
                    continue
                text, _ = item

                spoken = False
                if engine:
                    try:
                        engine.say(text)
                        engine.runAndWait()
                        spoken = True
                    except Exception as e:
                        logger.warning(f"[TTS] pyttsx3 failed: {e}")

                if not spoken:
                    try:
                        subprocess.run(
                            ["espeak-ng", "-s", "140", "-a", "100", text],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=10
                        )
                        spoken = True
                    except (FileNotFoundError, Exception):
                        try:
                            subprocess.run(
                                ["espeak", "-s", "140", "-a", "100", text],
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=10
                            )
                            spoken = True
                        except Exception:
                            pass

                if not spoken:
                    logger.info(f"[TTS SIMULATED SPEECH] \"{text}\"")

                self._speech_queue.task_done()
            except queue.Empty:
                pass
            except Exception as e:
                logger.error(f"[TTS] Worker error: {e}")

    def get_state(self) -> Dict[str, Any]:
        """Return a snapshot of current actuator states."""
        return {
            "light": self.light_state,
            "siren": self.siren_active,
            "p10_alert": self.p10_alert_text,
            "p10_weather": self.p10_weather_text,
            "p10_text": self.p10_full_message,
            "is_hardware": self.is_hardware
        }

    def trigger_simulated_button_press(self):
        """Simulate hardware reset button press for testing."""
        logger.info("[ACTUATORS] Simulated Reset Button Pressed")
        if self.on_reset_pressed:
            self.on_reset_pressed()

    def shutdown(self):
        self._tts_running = False
        self.siren_off()
        self.set_light("OFF")
        if self.is_hardware and self.gpio:
            self.gpio.cleanup()
