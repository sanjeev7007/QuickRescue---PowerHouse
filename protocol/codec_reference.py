"""
QuickRescue LoRa Binary Protocol — Reference Codec (Python)
=============================================================
Platform    : Raspberry Pi 4 (Communication Tower)
Encryption  : AES-128-CBC (pycryptodome)
Wire size   : 56 bytes total (8 header + 16 IV + 32 ciphertext)

Dependencies:
    pip install pycryptodome

Usage:
    # Encode a packet
    from protocol.codec_reference import QRPacket, encode, decode, MSG_SOS

    pkt = QRPacket(
        msg_type   = MSG_SOS,
        device_id  = 0x0042,
        seq        = 1,
        lat        = 28614000,
        lon        = 77209000,
        gps_flags  = GPS_VALID,
        rssi       = 0,
        battery    = 85,
        motion     = MOTION_MOVING,
        timestamp  = 1727583069,
    )
    wire = encode(pkt, psk=PSK_DEV, iv=None)   # iv=None -> random IV
    decoded = decode(wire, psk=PSK_DEV)

    # Self-test against known test vectors
    python codec_reference.py --selftest
"""

import struct
import os
import sys
import hashlib
from dataclasses import dataclass, field
from typing import Optional

from Crypto.Cipher import AES
from Crypto.Util.Padding import pad, unpad

PROTOCOL_VERSION = 0x01
PACKET_SIZE      = 56
HEADER_SIZE      = 8
IV_SIZE          = 16
CIPHER_SIZE      = 32
PAYLOAD_SIZE     = 20

MSG_SAFE       = 0x01
MSG_HELP       = 0x02
MSG_SOS        = 0x03
MSG_HEARTBEAT  = 0x04
MSG_BROADCAST  = 0x05
MSG_ACK        = 0x06

MSG_NAMES = {
    MSG_SAFE:      "SAFE",
    MSG_HELP:      "HELP",
    MSG_SOS:       "SOS",
    MSG_HEARTBEAT: "HEARTBEAT",
    MSG_BROADCAST: "BROADCAST",
    MSG_ACK:       "ACK",
}

GPS_UNAVAILABLE = 0x00
GPS_VALID       = 0x01
GPS_LAST_KNOWN  = 0x02

GPS_FLAG_NAMES = {
    GPS_UNAVAILABLE: "UNAVAILABLE",
    GPS_VALID:       "VALID",
    GPS_LAST_KNOWN:  "LAST_KNOWN",
}

MOTION_STATIC  = 0x00
MOTION_MOVING  = 0x01
MOTION_FALL    = 0x02

MOTION_NAMES = {
    MOTION_STATIC: "STATIC",
    MOTION_MOVING: "MOVING",
    MOTION_FALL:   "FALL",
}

ALERT_EVAC       = 0x0001
ALERT_FLOOD_WARN = 0x0002
ALERT_LANDSLIDE  = 0x0003
ALERT_CYCLONE    = 0x0004
ALERT_QUAKE      = 0x0005
ALERT_MINE_GAS   = 0x0006
ALERT_LOW_BATT   = 0x0010
ALERT_ALL_CLEAR  = 0x00FF

PSK_DEV = bytes([
    0x51, 0x52, 0x4B, 0x65, 0x79, 0x32, 0x30, 0x32,
    0x36, 0x50, 0x53, 0x48, 0x4F, 0x55, 0x53, 0x45,
])

IV_TEST_ZERO = bytes(16)

@dataclass
class QRPacket:
    msg_type:    int
    device_id:   int
    seq:         int
    lat:         int = 0
    lon:         int = 0
    gps_flags:   int = GPS_UNAVAILABLE
    rssi:        int = 0
    battery:     int = 0xFF
    motion:      int = MOTION_STATIC
    timestamp:   int = 0
    alert_level: int = 0
    alert_code:  int = 0
    hop_count:   int = 0
    ttl:         int = 7
    version:     int = PROTOCOL_VERSION

def _pack_payload(pkt: QRPacket) -> bytes:
    """
    Pack the 20-byte plaintext payload.

    Layout (little-endian):
        [0..3]   int32  latitude     (degrees * 1e6)
        [4..7]   int32  longitude    (degrees * 1e6)
        [8]      uint8  gps_flags
        [9]      uint8  rssi
        [10]     uint8  battery
        [11]     uint8  motion
        [12..15] uint32 timestamp
        [16]     uint8  alert_level
        [17..18] uint16 alert_code
        [19]     uint8  reserved (0x00)
    """
    assert PAYLOAD_SIZE == 20
    raw = struct.pack(
        "<iiBBBBI BHB",
        pkt.lat,
        pkt.lon,
        pkt.gps_flags & 0xFF,
        pkt.rssi      & 0xFF,
        pkt.battery   & 0xFF,
        pkt.motion    & 0xFF,
        pkt.timestamp & 0xFFFFFFFF,
        pkt.alert_level & 0xFF,
        pkt.alert_code  & 0xFFFF,
        0x00,
    )
    assert len(raw) == PAYLOAD_SIZE, f"Payload size mismatch: {len(raw)} != {PAYLOAD_SIZE}"
    return raw

def _pack_header(pkt: QRPacket) -> bytes:
    """
    Pack the 8-byte plaintext header.

    Layout (little-endian):
        [0]    uint8  version
        [1]    uint8  msg_type
        [2..3] uint16 device_id
        [4..5] uint16 seq
        [6]    uint8  hop_count
        [7]    uint8  ttl
    """
    return struct.pack(
        "<BBHHHBB",
        pkt.version  & 0xFF,
        pkt.msg_type & 0xFF,
        pkt.device_id & 0xFFFF,
        pkt.seq       & 0xFFFF,
        pkt.hop_count & 0xFF,
        pkt.ttl       & 0xFF,
        0x00,
    )[:HEADER_SIZE]

def _pack_header_correct(pkt: QRPacket) -> bytes:
    """Correctly pack 8-byte header without struct alignment issues."""
    return struct.pack(
        "<BBHHBB",
        pkt.version   & 0xFF,
        pkt.msg_type  & 0xFF,
        pkt.device_id & 0xFFFF,
        pkt.seq       & 0xFFFF,
        pkt.hop_count & 0xFF,
        pkt.ttl       & 0xFF,
    )

def encode(pkt: QRPacket, psk: bytes = PSK_DEV, iv: Optional[bytes] = None) -> bytes:
    """
    Encode a QRPacket into a 56-byte LoRa wire packet.

    Wire layout:
        [0..7]   plaintext header     (8 bytes)
        [8..23]  IV                   (16 bytes, plaintext)
        [24..55] AES-128-CBC payload  (32 bytes, ciphertext)

    Args:
        pkt: QRPacket to encode.
        psk: 16-byte pre-shared AES key.
        iv:  16-byte IV (None = os.urandom(16) for production).

    Returns:
        56-byte wire packet as bytes.
    """
    assert len(psk) == 16, "PSK must be exactly 16 bytes for AES-128"

    header  = _pack_header_correct(pkt)
    payload = _pack_payload(pkt)

    assert len(header)  == HEADER_SIZE
    assert len(payload) == PAYLOAD_SIZE

    if iv is None:
        iv = os.urandom(IV_SIZE)
    assert len(iv) == IV_SIZE, "IV must be exactly 16 bytes"

    cipher = AES.new(psk, AES.MODE_CBC, iv)
    ciphertext = cipher.encrypt(pad(payload, AES.block_size))

    assert len(ciphertext) == CIPHER_SIZE

    wire = header + iv + ciphertext
    assert len(wire) == PACKET_SIZE, f"Wire size mismatch: {len(wire)} != {PACKET_SIZE}"
    return wire

def decode(wire: bytes, psk: bytes = PSK_DEV) -> QRPacket:
    """
    Decode a 56-byte LoRa wire packet into a QRPacket.

    Raises:
        ValueError: on size mismatch, bad padding, or bad GPS unavailable lat/lon.
        KeyError: on unknown message type.

    Args:
        wire: 56-byte wire packet.
        psk:  16-byte pre-shared AES key.

    Returns:
        Decoded QRPacket.
    """
    if len(wire) != PACKET_SIZE:
        raise ValueError(f"Expected {PACKET_SIZE} bytes, got {len(wire)}")

    version, msg_type, device_id, seq, hop_count, ttl = struct.unpack_from(
        "<BBHHBB", wire, offset=0
    )

    iv         = wire[HEADER_SIZE : HEADER_SIZE + IV_SIZE]
    ciphertext = wire[HEADER_SIZE + IV_SIZE : PACKET_SIZE]

    assert len(iv)         == IV_SIZE
    assert len(ciphertext) == CIPHER_SIZE

    cipher    = AES.new(psk, AES.MODE_CBC, iv)
    payload   = unpad(cipher.decrypt(ciphertext), AES.block_size)

    if len(payload) != PAYLOAD_SIZE:
        raise ValueError(f"Decrypted payload size {len(payload)} != {PAYLOAD_SIZE}")

    lat, lon, gps_flags, rssi, battery, motion, timestamp, alert_level, alert_code, _reserved = (
        struct.unpack("<iiBBBBIBHB", payload)
    )

    return QRPacket(
        version     = version,
        msg_type    = msg_type,
        device_id   = device_id,
        seq         = seq,
        hop_count   = hop_count,
        ttl         = ttl,
        lat         = lat,
        lon         = lon,
        gps_flags   = gps_flags,
        rssi        = rssi,
        battery     = battery,
        motion      = motion,
        timestamp   = timestamp,
        alert_level = alert_level,
        alert_code  = alert_code,
    )

def location_string(pkt: QRPacket) -> str:
    """Return a human-readable location string respecting GPS flag."""
    if pkt.gps_flags == GPS_VALID:
        return f"{pkt.lat / 1e6:.6f}, {pkt.lon / 1e6:.6f} (GPS valid)"
    elif pkt.gps_flags == GPS_LAST_KNOWN:
        return (
            f"{pkt.lat / 1e6:.6f}, {pkt.lon / 1e6:.6f} "
            f"(last-known, RSSI=-{pkt.rssi} dBm)"
        )
    else:
        return "Location Unavailable"

def packet_summary(pkt: QRPacket) -> str:
    return (
        f"[{MSG_NAMES.get(pkt.msg_type, '?')}] "
        f"dev=0x{pkt.device_id:04X} seq={pkt.seq} "
        f"hop={pkt.hop_count} ttl={pkt.ttl} "
        f"bat={pkt.battery}% motion={MOTION_NAMES.get(pkt.motion, '?')} "
        f"loc={location_string(pkt)} ts={pkt.timestamp}"
    )

def _run_selftest():
    """
    Encode 3 known test vectors with a fixed all-zero IV, then decode and
    verify byte-for-byte. Print wire bytes for cross-validation with C++ codec.
    """
    print("=" * 60)
    print("QuickRescue Protocol Self-Test")
    print("=" * 60)
    print(f"PSK : {PSK_DEV.hex(' ').upper()}")
    print(f"IV  : {IV_TEST_ZERO.hex(' ').upper()} (TEST ONLY — all-zero)")
    print()

    vectors = [
        (
            "TV1: SOS with Valid GPS",
            QRPacket(
                msg_type   = MSG_SOS,
                device_id  = 0x0042,
                seq        = 0x0001,
                hop_count  = 0,
                ttl        = 7,
                lat        = 28614000,
                lon        = 77209000,
                gps_flags  = GPS_VALID,
                rssi       = 0,
                battery    = 85,
                motion     = MOTION_MOVING,
                timestamp  = 1727583069,
                alert_level= 0,
                alert_code = 0,
            ),
        ),
        (
            "TV2: HELP with Last-Known Location",
            QRPacket(
                msg_type   = MSG_HELP,
                device_id  = 0x0017,
                seq        = 0x0023,
                hop_count  = 1,
                ttl        = 6,
                lat        = 28612000,
                lon        = 77210000,
                gps_flags  = GPS_LAST_KNOWN,
                rssi       = 87,
                battery    = 42,
                motion     = MOTION_STATIC,
                timestamp  = 1727583100,
                alert_level= 0,
                alert_code = 0,
            ),
        ),
        (
            "TV3: SAFE with No GPS",
            QRPacket(
                msg_type   = MSG_SAFE,
                device_id  = 0x00AB,
                seq        = 0x0007,
                hop_count  = 0,
                ttl        = 7,
                lat        = 0,
                lon        = 0,
                gps_flags  = GPS_UNAVAILABLE,
                rssi       = 0,
                battery    = 99,
                motion     = MOTION_STATIC,
                timestamp  = 1727583200,
                alert_level= 0,
                alert_code = 0,
            ),
        ),
    ]

    all_passed = True
    for name, pkt in vectors:
        print(f"--- {name} ---")

        wire = encode(pkt, psk=PSK_DEV, iv=IV_TEST_ZERO)

        decoded = decode(wire, psk=PSK_DEV)

        failed_fields = []
        for attr in [
            "msg_type", "device_id", "seq", "hop_count", "ttl",
            "lat", "lon", "gps_flags", "rssi", "battery",
            "motion", "timestamp", "alert_level", "alert_code",
        ]:
            orig = getattr(pkt, attr)
            dec  = getattr(decoded, attr)
            if orig != dec:
                failed_fields.append(f"{attr}: orig={orig} decoded={dec}")

        if failed_fields:
            print(f"  FAIL - Field mismatches:")
            for f in failed_fields:
                print(f"    {f}")
            all_passed = False
        else:
            print(f"  PASS - All fields round-trip correctly")

        print(f"  Wire ({len(wire)} bytes):")
        header_hex  = wire[0:8].hex(" ").upper()
        iv_hex      = wire[8:24].hex(" ").upper()
        cipher_hex  = wire[24:56].hex(" ").upper()
        print(f"  Header : {header_hex}")
        print(f"  IV     : {iv_hex}")
        print(f"  Cipher : {cipher_hex}")
        print(f"  Full   : {wire.hex().upper()}")
        print(f"  Summary: {packet_summary(decoded)}")
        print()

    print("=" * 60)
    if all_passed:
        print("RESULT: ALL TEST VECTORS PASSED")
    else:
        print("RESULT: SOME TEST VECTORS FAILED")
        sys.exit(1)
    print("=" * 60)
    print()
    print("Copy the 'Full' hex lines above into the C++ test to verify cross-compatibility.")

if __name__ == "__main__":
    if "--selftest" in sys.argv:
        _run_selftest()
    else:
        print(__doc__)
