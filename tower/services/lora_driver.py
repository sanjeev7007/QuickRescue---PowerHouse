"""
QuickRescue Communication Tower — LoRa Transceiver Driver
==========================================================
Supports hardware SX1276/78 on Raspberry Pi 4 (SPI0, GPIO22 RST, GPIO25 DIO0)
and virtual/simulated driver mode for cross-platform development & automated testing.
"""

import os
import time
import logging
from typing import Optional, Tuple, Callable

logger = logging.getLogger("LoRaDriver")

REG_FIFO                 = 0x00
REG_OP_MODE              = 0x01
REG_FRF_MSB              = 0x06
REG_FRF_MID              = 0x07
REG_FRF_LSB              = 0x08
REG_PA_CONFIG            = 0x09
REG_LNA                  = 0x0C
REG_FIFO_ADDR_PTR        = 0x0D
REG_FIFO_TX_BASE_ADDR    = 0x0E
REG_FIFO_RX_BASE_ADDR    = 0x0F
REG_FIFO_RX_CURRENT_ADDR = 0x10
REG_IRQ_FLAGS            = 0x12
REG_RX_NB_BYTES          = 0x13
REG_PKT_RSSI_VALUE       = 0x1A
REG_MODEM_CONFIG_1       = 0x1D
REG_MODEM_CONFIG_2       = 0x1E
REG_PREAMBLE_MSB         = 0x20
REG_PREAMBLE_LSB         = 0x21
REG_PAYLOAD_LENGTH       = 0x22
REG_MODEM_CONFIG_3       = 0x26
REG_SYNC_WORD            = 0x39
REG_DIO_MAPPING_1        = 0x40
REG_VERSION              = 0x42

MODE_LONG_RANGE_MODE     = 0x80
MODE_SLEEP               = 0x00
MODE_STDBY               = 0x01
MODE_TX                  = 0x03
MODE_RX_CONTINUOUS       = 0x05

IRQ_RX_DONE_MASK         = 0x40
IRQ_TX_DONE_MASK         = 0x08
IRQ_PAYLOAD_CRC_ERROR    = 0x20

class LoRaDriver:
    """
    LoRa SX1276/SX1278 transceiver driver for Raspberry Pi 4.
    Automatically detects SPI hardware or falls back to simulation mode.
    """
    def __init__(self,
                 frequency_hz: float = 866.0e6,
                 sf: int = 10,
                 bw_hz: float = 125.0e3,
                 cr: int = 5,
                 sync_word: int = 0x12,
                 tx_power: int = 17,
                 spi_bus: int = 0,
                 spi_cs: int = 0,
                 pin_rst: int = 22,
                 pin_dio0: int = 25,
                 force_simulated: bool = False):
        self.frequency_hz = frequency_hz
        self.sf = sf
        self.bw_hz = bw_hz
        self.cr = cr
        self.sync_word = sync_word
        self.tx_power = tx_power
        self.spi_bus = spi_bus
        self.spi_cs = spi_cs
        self.pin_rst = pin_rst
        self.pin_dio0 = pin_dio0

        self.is_hardware = False
        self.spi = None
        self.gpio = None
        self._rx_queue = []
        self._tx_history = []

        if not force_simulated:
            self._try_init_hardware()

        if not self.is_hardware:
            logger.info("[LoRa] Operating in SIMULATED / TEST MODE (Hardware SPI not detected)")

    def _try_init_hardware(self):
        """Attempt to open spidev and configure GPIO on Raspberry Pi Linux."""
        try:
            import spidev
            import RPi.GPIO as GPIO

            self.gpio = GPIO
            self.gpio.setwarnings(False)
            self.gpio.setmode(self.gpio.BCM)
            self.gpio.setup(self.pin_rst, self.gpio.OUT)
            self.gpio.setup(self.pin_dio0, self.gpio.IN)

            self.gpio.output(self.pin_rst, self.gpio.LOW)
            time.sleep(0.01)
            self.gpio.output(self.pin_rst, self.gpio.HIGH)
            time.sleep(0.01)

            self.spi = spidev.SpiDev()
            self.spi.open(self.spi_bus, self.spi_cs)
            self.spi.max_speed_hz = 5000000
            self.spi.mode = 0

            ver = self._read_reg(REG_VERSION)
            if ver != 0x12:
                logger.warning(f"[LoRa] Unexpected chip version: 0x{ver:02X} (Expected 0x12 for SX1276/78)")
                self.spi.close()
                self.spi = None
                return

            self._configure_radio()
            self.is_hardware = True
            logger.info(f"[LoRa] Hardware SX1276/78 initialised successfully on SPI{self.spi_bus}.{self.spi_cs}")

        except Exception as e:
            logger.info(f"[LoRa] Hardware initialization skipped ({e})")
            self.is_hardware = False

    def _write_reg(self, reg: int, val: int):
        if self.spi:
            self.spi.xfer2([reg | 0x80, val & 0xFF])

    def _read_reg(self, reg: int) -> int:
        if self.spi:
            resp = self.spi.xfer2([reg & 0x7F, 0x00])
            return resp[1]
        return 0

    def _configure_radio(self):
        """Configure SX1276 registers for 866 MHz, SF10, BW125, CR4/5, Sync 0x12."""
        self._write_reg(REG_OP_MODE, MODE_LONG_RANGE_MODE | MODE_SLEEP)
        time.sleep(0.01)
        self._write_reg(REG_OP_MODE, MODE_LONG_RANGE_MODE | MODE_STDBY)

        frf = int((self.frequency_hz * 524288) / 32000000)
        self._write_reg(REG_FRF_MSB, (frf >> 16) & 0xFF)
        self._write_reg(REG_FRF_MID, (frf >> 8) & 0xFF)
        self._write_reg(REG_FRF_LSB, frf & 0xFF)

        self._write_reg(REG_FIFO_TX_BASE_ADDR, 0x00)
        self._write_reg(REG_FIFO_RX_BASE_ADDR, 0x00)

        self._write_reg(REG_LNA, 0x23)

        self._write_reg(REG_MODEM_CONFIG_1, 0x72)

        self._write_reg(REG_MODEM_CONFIG_2, (self.sf << 4) | 0x04)

        self._write_reg(REG_MODEM_CONFIG_3, 0x0C)

        self._write_reg(REG_PREAMBLE_MSB, 0x00)
        self._write_reg(REG_PREAMBLE_LSB, 0x08)

        self._write_reg(REG_SYNC_WORD, self.sync_word)

        self._write_reg(REG_PA_CONFIG, 0x80 | 14)

        self._write_reg(REG_DIO_MAPPING_1, 0x00)

        self._write_reg(REG_OP_MODE, MODE_LONG_RANGE_MODE | MODE_RX_CONTINUOUS)

    def receive_packet(self) -> Optional[Tuple[bytes, int]]:
        """
        Poll for an incoming packet.
        Returns:
            (packet_bytes, rssi_dBm) or None if no packet is ready.
        """
        if self.is_hardware:
            irq_flags = self._read_reg(REG_IRQ_FLAGS)

            if irq_flags & IRQ_PAYLOAD_CRC_ERROR:
                self._write_reg(REG_IRQ_FLAGS, 0xFF)
                logger.warning("[LoRa] Hardware reported CRC Error on incoming packet")
                return None

            if irq_flags & IRQ_RX_DONE_MASK:
                self._write_reg(REG_IRQ_FLAGS, 0xFF)

                nb_bytes = self._read_reg(REG_RX_NB_BYTES)
                current_addr = self._read_reg(REG_FIFO_RX_CURRENT_ADDR)
                self._write_reg(REG_FIFO_ADDR_PTR, current_addr)

                raw = []
                for _ in range(nb_bytes):
                    raw.append(self._read_reg(REG_FIFO))
                wire_bytes = bytes(raw)

                raw_rssi = self._read_reg(REG_PKT_RSSI_VALUE)
                rssi = raw_rssi - 157

                return wire_bytes, rssi

            return None
        else:
            if self._rx_queue:
                return self._rx_queue.pop(0)
            return None

    def send_packet(self, wire_bytes: bytes) -> bool:
        """
        Transmit wire bytes over LoRa.
        Returns True on successful transmission.
        """
        if self.is_hardware:
            self._write_reg(REG_OP_MODE, MODE_LONG_RANGE_MODE | MODE_STDBY)

            self._write_reg(REG_FIFO_ADDR_PTR, 0x00)
            self._write_reg(REG_PAYLOAD_LENGTH, len(wire_bytes))

            for b in wire_bytes:
                self._write_reg(REG_FIFO, b)

            self._write_reg(REG_DIO_MAPPING_1, 0x40)

            self._write_reg(REG_OP_MODE, MODE_LONG_RANGE_MODE | MODE_TX)

            start_t = time.time()
            while (time.time() - start_t) < 2.0:
                irq = self._read_reg(REG_IRQ_FLAGS)
                if irq & IRQ_TX_DONE_MASK:
                    self._write_reg(REG_IRQ_FLAGS, 0xFF)
                    self._write_reg(REG_DIO_MAPPING_1, 0x00)
                    self._write_reg(REG_OP_MODE, MODE_LONG_RANGE_MODE | MODE_RX_CONTINUOUS)
                    return True
                time.sleep(0.005)

            logger.error("[LoRa] Hardware TX timed out!")
            self._write_reg(REG_OP_MODE, MODE_LONG_RANGE_MODE | MODE_RX_CONTINUOUS)
            return False
        else:
            self._tx_history.append((wire_bytes, time.time()))
            logger.info(f"[LoRa SIM] Transmitted packet ({len(wire_bytes)} bytes): {wire_bytes[:8].hex().upper()}...")
            return True

    def inject_simulated_rx(self, wire_bytes: bytes, rssi: int = -80):
        """Simulate an incoming packet for unit tests."""
        self._rx_queue.append((wire_bytes, rssi))

    def get_last_tx(self) -> Optional[bytes]:
        """Get the most recently transmitted packet in simulation mode."""
        if self._tx_history:
            return self._tx_history[-1][0]
        return None
