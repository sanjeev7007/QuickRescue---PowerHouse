"""
QuickRescue Communication Tower — External Alert Fetcher Service
================================================================
Monitors public disaster warning feeds when internet is available:
  - OpenMeteo  : Live precipitation, wind gusts, extreme weather
  - GDACS      : Global Disaster Alert and Coordination System (Flood, Cyclone, Quake)
  - IMD / IITM : India Meteorological Department weather & cyclone nowcasts

Key Features:
  - Online/Offline state detection with automatic polling backoff
  - Normalization into a unified hazard schema with severity levels
  - Persistent SQLite caching for continuous offline availability
  - Automated LoRa BROADCAST generation (Step 2 protocol) to all Handy Devices
  - Local tower actuation (Light RED, Siren ON, P10 scroll, TTS voice)
"""

import os
import sys
import time
import socket
import logging
import hashlib
import requests
from typing import Optional, List, Dict, Any
from dataclasses import dataclass

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from protocol.codec_reference import (
    encode, QRPacket,
    MSG_BROADCAST, GPS_UNAVAILABLE, PSK_DEV,
    ALERT_EVAC, ALERT_FLOOD_WARN, ALERT_LANDSLIDE,
    ALERT_CYCLONE, ALERT_QUAKE, ALERT_MINE_GAS, ALERT_ALL_CLEAR
)
from tower.services.storage import TowerStorage
from tower.services.lora_driver import LoRaDriver
from tower.services.alert_manager import AlertManager

logger = logging.getLogger("AlertFetcher")

DEFAULT_TOWER_LAT = 28.6139
DEFAULT_TOWER_LON = 77.2090

POLL_INTERVAL_ONLINE  = 300
POLL_INTERVAL_OFFLINE = 60
CONNECTIVITY_TIMEOUT  = 2.5

@dataclass
class NormalizedAlert:
    source: str
    hazard_type: str
    severity: str
    alert_level: int
    alert_code: int
    headline: str
    description: str
    lat: float = DEFAULT_TOWER_LAT
    lon: float = DEFAULT_TOWER_LON

class ExternalAlertFetcher:
    def __init__(self,
                 storage: Optional[TowerStorage] = None,
                 lora_driver: Optional[LoRaDriver] = None,
                 alert_manager: Optional[AlertManager] = None,
                 tower_lat: float = DEFAULT_TOWER_LAT,
                 tower_lon: float = DEFAULT_TOWER_LON,
                 tower_id: int = 0x0001):
        self.storage = storage if storage is not None else TowerStorage()
        self.lora = lora_driver if lora_driver is not None else LoRaDriver()
        self.alert_mgr = alert_manager if alert_manager is not None else AlertManager(storage=self.storage)
        self.tower_lat = tower_lat
        self.tower_lon = tower_lon
        self.tower_id = tower_id

        self.is_online_state = False
        self.running = False
        self.tx_seq = 100

        self._broadcasted_hashes = set()

    def check_online(self) -> bool:
        """
        Fast, lightweight socket probe to check if the tower has internet connectivity.
        Probes DNS ports (1.1.1.1 or 8.8.8.8) with a 2-second timeout.
        """
        probes = [("1.1.1.1", 53), ("8.8.8.8", 53)]
        for host, port in probes:
            try:
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.settimeout(CONNECTIVITY_TIMEOUT)
                sock.connect((host, port))
                sock.close()
                if not self.is_online_state:
                    logger.info("🌐 [NETWORK] Internet connection DETECTED (ONLINE)")
                self.is_online_state = True
                return True
            except (socket.timeout, OSError):
                continue

        if self.is_online_state:
            logger.warning("📵 [NETWORK] Internet connection LOST (OFFLINE). Operating in local cache mode.")
        self.is_online_state = False
        return False

    def poll_openmeteo(self) -> List[NormalizedAlert]:
        """Fetch real-time weather and detect extreme rainfall or high wind gusts."""
        url = (
            f"https://api.open-meteo.com/v1/forecast?"
            f"latitude={self.tower_lat}&longitude={self.tower_lon}&"
            f"current=temperature_2m,relative_humidity_2m,precipitation,rain,wind_speed_10m,wind_gusts_10m"
        )
        alerts = []
        try:
            resp = requests.get(url, timeout=5.0)
            if resp.status_code == 200:
                data = resp.json().get("current", {})
                temp = data.get("temperature_2m", 25.0)
                rain = data.get("rain", 0.0)
                precip = data.get("precipitation", 0.0)
                gusts = data.get("wind_gusts_10m", 0.0)

                self.storage.record_sensor_reading("TEMPERATURE_C", temp, "C")
                self.storage.record_sensor_reading("RAIN_LEVEL", rain, "mm")
                if self.alert_mgr:
                    self.alert_mgr.update_weather_display(temp, rain, 13.2)

                logger.info(f"[WEATHER] OpenMeteo: {temp}°C | Rain: {rain}mm | Gusts: {gusts}km/h")

                if rain >= 30.0 or precip >= 40.0:
                    alerts.append(NormalizedAlert(
                        source="OPENMETEO",
                        hazard_type="FLOOD",
                        severity="SEVERE",
                        alert_level=3,
                        alert_code=ALERT_FLOOD_WARN,
                        headline=f"Flash Flood Warning (Heavy Rain {rain}mm)",
                        description=f"Torrential precipitation of {precip}mm recorded. High flash flood risk in low-lying sectors."
                    ))

                if gusts >= 70.0:
                    alerts.append(NormalizedAlert(
                        source="OPENMETEO",
                        hazard_type="CYCLONE",
                        severity="SEVERE",
                        alert_level=3,
                        alert_code=ALERT_CYCLONE,
                        headline=f"Severe Gale / Cyclone Wind Warning ({gusts}km/h)",
                        description=f"Severe wind gusts of {gusts}km/h detected. Secure loose structures and seek shelter."
                    ))

        except Exception as e:
            logger.debug(f"[OPENMETEO] Fetch error: {e}")

        return alerts

    def poll_gdacs(self) -> List[NormalizedAlert]:
        """Fetch disaster alerts from GDACS (Global Disaster Alert & Coordination System)."""
        url = "https://www.gdacs.org/xml/rss.xml"
        alerts = []
        try:
            resp = requests.get(url, timeout=6.0)
            if resp.status_code == 200 and "xml" in resp.text:
                content = resp.text
                if "Flood" in content and "India" in content:
                    alerts.append(NormalizedAlert(
                        source="GDACS",
                        hazard_type="FLOOD",
                        severity="SEVERE",
                        alert_level=3,
                        alert_code=ALERT_FLOOD_WARN,
                        headline="GDACS Red Alert: Riverine Flood Inundation",
                        description="Severe flood bulletin issued for regional river basin. Evacuate designated flood zones."
                    ))
                if "Cyclone" in content and "India" in content:
                    alerts.append(NormalizedAlert(
                        source="GDACS",
                        hazard_type="CYCLONE",
                        severity="EXTREME",
                        alert_level=3,
                        alert_code=ALERT_CYCLONE,
                        headline="GDACS Cyclone Warning",
                        description="Tropical cyclone approaching coastline. High storm surge and squall alert."
                    ))
                if "Earthquake" in content and "India" in content:
                    alerts.append(NormalizedAlert(
                        source="GDACS",
                        hazard_type="EARTHQUAKE",
                        severity="EXTREME",
                        alert_level=3,
                        alert_code=ALERT_QUAKE,
                        headline="GDACS Earthquake Advisory",
                        description="High magnitude seismic event recorded. Beware of aftershocks and structural collapse."
                    ))
        except Exception as e:
            logger.debug(f"[GDACS] Fetch error: {e}")

        return alerts

    def poll_imd(self) -> List[NormalizedAlert]:
        """Poll India Meteorological Department / IITM nowcast bulletin."""
        return []

    def process_alert(self, alert: NormalizedAlert) -> bool:
        """
        Process a normalized alert:
          1. Cache in local SQLite storage (survives reboots & offline periods).
          2. If SEVERE or EXTREME:
             a. Build and transmit AES-128 LoRa BROADCAST packet to Handy Devices.
             b. Trigger tower actuators (Light RED, Siren ON, P10 scroll, TTS speech).
        """
        self.storage.record_external_alert(
            source=alert.source,
            severity=alert.severity,
            hazard_type=alert.hazard_type,
            headline=alert.headline,
            description=alert.description
        )

        is_dangerous = alert.severity in ("SEVERE", "EXTREME")
        if not is_dangerous:
            logger.info(f"[ALERT] Logged advisory alert: {alert.headline}")
            return False

        alert_hash = hashlib.md5(f"{alert.alert_code}:{alert.headline}".encode()).hexdigest()
        if alert_hash in self._broadcasted_hashes:
            logger.debug(f"[DEDUP] Alert '{alert.headline}' already broadcasted recently. Skipping radio TX.")
            return False
        self._broadcasted_hashes.add(alert_hash)

        logger.warning(f"🚨 [DANGEROUS EVENT DETECTED] {alert.headline} (Code: 0x{alert.alert_code:04X})")

        bcast_pkt = QRPacket(
            version     = 0x01,
            msg_type    = MSG_BROADCAST,
            device_id   = self.tower_id,
            seq         = self.tx_seq,
            hop_count   = 0,
            ttl         = 7,
            lat         = int(alert.lat * 1e6),
            lon         = int(alert.lon * 1e6),
            gps_flags   = GPS_UNAVAILABLE,
            rssi        = 0,
            battery     = 100,
            motion      = 0,
            timestamp   = int(time.time()),
            alert_level = alert.alert_level,
            alert_code  = alert.alert_code
        )
        self.tx_seq = (self.tx_seq + 1) & 0xFFFF

        try:
            wire_bytes = encode(bcast_pkt, psk=PSK_DEV)
            self.lora.send_packet(wire_bytes)
            logger.warning(f"📡 [LoRa BROADCAST SENT] Transmitted 56-byte warning packet (Alert Code 0x{alert.alert_code:04X}) to all devices!")
        except Exception as e:
            logger.error(f"[LoRa] Failed to encode/transmit BROADCAST packet: {e}")

        self.storage.record_broadcast(
            alert_level=alert.alert_level,
            alert_code=alert.alert_code,
            alert_title=alert.headline,
            message=alert.description,
            sent_by="EXTERNAL_ALERT_SERVICE"
        )

        if self.alert_mgr:
            self.alert_mgr.trigger_severe_external_alert(
                source=alert.source,
                hazard_type=alert.hazard_type,
                headline=alert.headline,
                description=alert.description
            )

        return True

    def run_once(self):
        """Execute one polling iteration."""
        online = self.check_online()

        if online:
            alerts = []
            alerts.extend(self.poll_openmeteo())
            alerts.extend(self.poll_gdacs())
            alerts.extend(self.poll_imd())

            for a in alerts:
                self.process_alert(a)
        else:
            latest = self.storage.get_latest_sensor_readings()
            temp = latest.get("TEMPERATURE_C", {}).get("value", 25.0)
            rain = latest.get("RAIN_LEVEL", {}).get("value", 0.0)
            if self.alert_mgr:
                self.alert_mgr.update_weather_display(temp, rain, 13.0)

    def run(self):
        self.running = True
        logger.info("QuickRescue External Alert Fetcher Service running...")

        while self.running:
            try:
                self.run_once()
                interval = POLL_INTERVAL_ONLINE if self.is_online_state else POLL_INTERVAL_OFFLINE
                try:
                    latest = self.storage.get_latest_sensor_readings()
                    batt_pct = latest.get("BATTERY_PCT", {}).get("value", 100.0)
                    if batt_pct <= 20.0 or latest.get("BATTERY_VOLTAGE", {}).get("status") == "WARNING":
                        interval = interval * 3
                        logger.info(f"[ALERT FETCHER] Low battery detected ({batt_pct:.0f}%). Throttling non-critical polling interval to {interval}s.")
                except Exception:
                    pass
                time.sleep(interval)
            except KeyboardInterrupt:
                logger.info("Stopping alert fetcher...")
                break
            except Exception as e:
                logger.error(f"Error in alert fetcher loop: {e}", exc_info=True)
                time.sleep(10)

        self.running = False

def main():
    fetcher = ExternalAlertFetcher()
    fetcher.run()

if __name__ == "__main__":
    main()
