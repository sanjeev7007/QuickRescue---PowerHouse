"""
QuickRescue Communication Tower — Master Gateway Service
=========================================================
Unified supervisor process for Raspberry Pi 4 Communication Tower.
Coordinates:
  1. Offline-first SQLite storage (tower.db)
  2. LoRa transceiver driver (SX1276 / SX1302)
  3. Physical Actuators (Tri-Colour Light, Industrial Siren, P10 Board, TTS Speaker)
  4. LoRa Receiver Daemon (AES-128 decrypt, deduplicate, store, and return ACK)
  5. External Alert Fetcher (OpenMeteo, GDACS, IMD with LoRa BROADCAST generation)
  6. Local REST API (FastAPI on port 8000 for touchscreen & dashboard)
"""

import os
import sys
import time
import signal
import threading
import logging

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from tower.services.storage import TowerStorage
from tower.services.lora_driver import LoRaDriver
from tower.services.actuators import ActuatorController
from tower.services.alert_manager import AlertManager
from tower.services.receiver import ReceiverService
from tower.services.alert_fetcher import ExternalAlertFetcher
from tower.services.power_monitor import TowerPowerMonitor

LOG_FORMAT = "%(asctime)s [%(levelname)s] [TowerMaster] %(message)s"
logging.basicConfig(level=logging.INFO, format=LOG_FORMAT)
logger = logging.getLogger("TowerMaster")

class TowerMasterGateway:
    def __init__(self, db_path: str = "tower.db"):
        logger.info("Initializing QuickRescue Communication Tower Subsystems...")

        self.storage = TowerStorage(db_path=db_path)

        self.lora_driver = LoRaDriver()

        self.actuators = ActuatorController()
        self.alert_manager = AlertManager(storage=self.storage, actuators=self.actuators)

        self.receiver = ReceiverService(
            db_path=db_path,
            driver=self.lora_driver,
            alert_manager=self.alert_manager
        )

        self.fetcher = ExternalAlertFetcher(
            storage=self.storage,
            lora_driver=self.lora_driver,
            alert_manager=self.alert_manager
        )

        self.power_monitor = TowerPowerMonitor(storage=self.storage)

        self._threads = []
        self._running = False

    def start(self):
        self._running = True
        logger.info("Starting background worker threads...")

        rx_thread = threading.Thread(target=self.receiver.run, name="LoRaReceiverThread", daemon=True)
        rx_thread.start()
        self._threads.append(rx_thread)

        fetcher_thread = threading.Thread(target=self.fetcher.run, name="AlertFetcherThread", daemon=True)
        fetcher_thread.start()
        self._threads.append(fetcher_thread)

        power_thread = threading.Thread(target=self.power_monitor.run, name="PowerMonitorThread", daemon=True)
        power_thread.start()
        self._threads.append(power_thread)

        logger.info("✅ QuickRescue Tower Master Gateway is FULLY OPERATIONAL.")
        logger.info("Listening for Handy Device SOS/HELP packets, monitoring disaster feeds, and tracking solar/battery power.")

        while self._running:
            try:
                time.sleep(1.0)
            except KeyboardInterrupt:
                logger.info("Keyboard interrupt received. Initiating tower shutdown...")
                break

        self.stop()

    def stop(self):
        self._running = False
        logger.info("Stopping all tower subsystems...")
        self.receiver.stop()
        self.fetcher.running = False
        self.power_monitor.running = False
        self.actuators.shutdown()
        logger.info("Tower Master Gateway safely terminated.")

def main():
    gateway = TowerMasterGateway()

    def handle_sig(sig, frame):
        gateway.stop()
        sys.exit(0)

    signal.signal(signal.SIGINT, handle_sig)
    signal.signal(signal.SIGTERM, handle_sig)

    gateway.start()

if __name__ == "__main__":
    main()
