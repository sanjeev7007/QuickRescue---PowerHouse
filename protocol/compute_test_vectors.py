"""
QuickRescue Protocol — Standalone AES-128-CBC Self-Test (stdlib only)
======================================================================
This script implements AES-128-CBC from scratch (pure Python, no dependencies)
to compute and print the three protocol test vectors.

Run with any Python 3.6+ interpreter — no pip required.

    python protocol/compute_test_vectors.py
"""

import struct

SBOX = [
    0x63,0x7C,0x77,0x7B,0xF2,0x6B,0x6F,0xC5,0x30,0x01,0x67,0x2B,0xFE,0xD7,0xAB,0x76,
    0xCA,0x82,0xC9,0x7D,0xFA,0x59,0x47,0xF0,0xAD,0xD4,0xA2,0xAF,0x9C,0xA4,0x72,0xC0,
    0xB7,0xFD,0x93,0x26,0x36,0x3F,0xF7,0xCC,0x34,0xA5,0xE5,0xF1,0x71,0xD8,0x31,0x15,
    0x04,0xC7,0x23,0xC3,0x18,0x96,0x05,0x9A,0x07,0x12,0x80,0xE2,0xEB,0x27,0xB2,0x75,
    0x09,0x83,0x2C,0x1A,0x1B,0x6E,0x5A,0xA0,0x52,0x3B,0xD6,0xB3,0x29,0xE3,0x2F,0x84,
    0x53,0xD1,0x00,0xED,0x20,0xFC,0xB1,0x5B,0x6A,0xCB,0xBE,0x39,0x4A,0x4C,0x58,0xCF,
    0xD0,0xEF,0xAA,0xFB,0x43,0x4D,0x33,0x85,0x45,0xF9,0x02,0x7F,0x50,0x3C,0x9F,0xA8,
    0x51,0xA3,0x40,0x8F,0x92,0x9D,0x38,0xF5,0xBC,0xB6,0xDA,0x21,0x10,0xFF,0xF3,0xD2,
    0xCD,0x0C,0x13,0xEC,0x5F,0x97,0x44,0x17,0xC4,0xA7,0x7E,0x3D,0x64,0x5D,0x19,0x73,
    0x60,0x81,0x4F,0xDC,0x22,0x2A,0x90,0x88,0x46,0xEE,0xB8,0x14,0xDE,0x5E,0x0B,0xDB,
    0xE0,0x32,0x3A,0x0A,0x49,0x06,0x24,0x5C,0xC2,0xD3,0xAC,0x62,0x91,0x95,0xE4,0x79,
    0xE7,0xC8,0x37,0x6D,0x8D,0xD5,0x4E,0xA9,0x6C,0x56,0xF4,0xEA,0x65,0x7A,0xAE,0x08,
    0xBA,0x78,0x25,0x2E,0x1C,0xA6,0xB4,0xC6,0xE8,0xDD,0x74,0x1F,0x4B,0xBD,0x8B,0x8A,
    0x70,0x3E,0xB5,0x66,0x48,0x03,0xF6,0x0E,0x61,0x35,0x57,0xB9,0x86,0xC1,0x1D,0x9E,
    0xE1,0xF8,0x98,0x11,0x69,0xD9,0x8E,0x94,0x9B,0x1E,0x87,0xE9,0xCE,0x55,0x28,0xDF,
    0x8C,0xA1,0x89,0x0D,0xBF,0xE6,0x42,0x68,0x41,0x99,0x2D,0x0F,0xB0,0x54,0xBB,0x16,
]

RCON = [0x00,0x01,0x02,0x04,0x08,0x10,0x20,0x40,0x80,0x1B,0x36]

def _xtime(a):
    return (((a << 1) ^ 0x1B) & 0xFF) if (a & 0x80) else ((a << 1) & 0xFF)

def _gmul(a, b):
    p = 0
    for _ in range(8):
        if b & 1: p ^= a
        hi = a & 0x80
        a = (a << 1) & 0xFF
        if hi: a ^= 0x1B
        b >>= 1
    return p

def _key_expansion(key):
    assert len(key) == 16
    w = [list(key[i*4:(i+1)*4]) for i in range(4)]
    for i in range(4, 44):
        temp = w[i-1][:]
        if i % 4 == 0:
            temp = [SBOX[temp[1]], SBOX[temp[2]], SBOX[temp[3]], SBOX[temp[0]]]
            temp[0] ^= RCON[i // 4]
        w.append([w[i-4][j] ^ temp[j] for j in range(4)])
    return [bytes(w[i*4:(i+1)*4][j] for i in range(4) for j in range(4)) for _ in range(11)]

def _expand_key(key):
    assert len(key) == 16
    w = list(key)
    for i in range(16, 176):
        temp = w[i-4] ^ w[i-16]
        if i % 16 == 0:
            j = i // 16
            temp = (SBOX[w[i-3]] ^ RCON[j] ^ w[i-16])
            w.append(temp)
            w.append(SBOX[w[i-2]] ^ w[i-15])
            w.append(SBOX[w[i-1]] ^ w[i-14])
            w.append(SBOX[w[i-4]] ^ w[i-13])
            continue
        w.append(temp)
    return [bytes(w[i*16:(i+1)*16]) for i in range(11)]

def _add_round_key(state, rk):
    return [state[i] ^ rk[i] for i in range(16)]

def _sub_bytes(state):
    return [SBOX[b] for b in state]

def _shift_rows(state):
    s = state[:]
    s[1], s[5], s[9],  s[13] = state[5], state[9],  state[13], state[1]
    s[2], s[6], s[10], s[14] = state[10],state[14], state[2],  state[6]
    s[3], s[7], s[11], s[15] = state[15],state[3],  state[7],  state[11]
    return s

def _mix_col(col):
    a = col[:]
    return [
        _gmul(a[0],2) ^ _gmul(a[1],3) ^ a[2]          ^ a[3],
        a[0]          ^ _gmul(a[1],2) ^ _gmul(a[2],3) ^ a[3],
        a[0]          ^ a[1]          ^ _gmul(a[2],2) ^ _gmul(a[3],3),
        _gmul(a[0],3) ^ a[1]          ^ a[2]          ^ _gmul(a[3],2),
    ]

def _mix_columns(state):
    out = []
    for c in range(4):
        col = [state[r*4+c] for r in range(4)]
        mc  = _mix_col(col)
        for r in range(4): out.append((r, c, mc[r]))
    result = state[:]
    for r, c, v in out: result[r*4+c] = v
    return result

def _aes128_encrypt_block(plaintext, rkeys):
    state = list(plaintext)
    state = _add_round_key(state, rkeys[0])
    for rnd in range(1, 10):
        state = _sub_bytes(state)
        state = _shift_rows(state)
        state = _mix_columns(state)
        state = _add_round_key(state, rkeys[rnd])
    state = _sub_bytes(state)
    state = _shift_rows(state)
    state = _add_round_key(state, rkeys[10])
    return bytes(state)

def aes128_cbc_encrypt(key, iv, plaintext):
    """AES-128-CBC encrypt with PKCS7 padding."""
    assert len(key) == 16
    assert len(iv)  == 16
    pad_len = 16 - (len(plaintext) % 16)
    padded  = plaintext + bytes([pad_len] * pad_len)
    rkeys   = _expand_key(key)
    prev    = list(iv)
    out     = b""
    for i in range(0, len(padded), 16):
        block = [padded[i+j] ^ prev[j] for j in range(16)]
        enc   = _aes128_encrypt_block(block, rkeys)
        prev  = list(enc)
        out  += enc
    return out

PROTOCOL_VERSION = 0x01
MSG_SAFE         = 0x01
MSG_HELP         = 0x02
MSG_SOS          = 0x03
MSG_HEARTBEAT    = 0x04
MSG_BROADCAST    = 0x05
MSG_ACK          = 0x06

GPS_UNAVAILABLE  = 0x00
GPS_VALID        = 0x01
GPS_LAST_KNOWN   = 0x02

MOTION_STATIC    = 0x00
MOTION_MOVING    = 0x01
MOTION_FALL      = 0x02

MSG_NAMES = {1:"SAFE",2:"HELP",3:"SOS",4:"HEARTBEAT",5:"BROADCAST",6:"ACK"}

PSK_DEV = bytes([
    0x51, 0x52, 0x4B, 0x65, 0x79, 0x32, 0x30, 0x32,
    0x36, 0x50, 0x53, 0x48, 0x4F, 0x55, 0x53, 0x45,
])
IV_TEST_ZERO = bytes(16)

def pack_and_encrypt(msg_type, device_id, seq, hop, ttl,
                     lat, lon, gps_flags, rssi, battery, motion,
                     timestamp, alert_level=0, alert_code=0):
    header = struct.pack("<BBHHBB",
        PROTOCOL_VERSION, msg_type,
        device_id, seq,
        hop, ttl,
    )
    payload = struct.pack("<iiBBBBIBHB",
        lat, lon,
        gps_flags, rssi, battery, motion,
        timestamp,
        alert_level, alert_code,
        0x00,
    )
    assert len(header)  == 8
    assert len(payload) == 20

    cipher = aes128_cbc_encrypt(PSK_DEV, IV_TEST_ZERO, payload)
    assert len(cipher) == 32

    wire = header + IV_TEST_ZERO + cipher
    assert len(wire) == 56
    return wire

if __name__ == "__main__":
    print("=" * 64)
    print("QuickRescue Protocol — Test Vector Computation (pure stdlib)")
    print("=" * 64)
    print(f"PSK : {PSK_DEV.hex(' ').upper()}")
    print(f"IV  : {IV_TEST_ZERO.hex(' ').upper()} (ALL-ZERO, TEST ONLY)")
    print()

    vectors = [
        ("TV1: SOS with Valid GPS",
         dict(msg_type=MSG_SOS,    device_id=0x0042, seq=0x0001, hop=0, ttl=7,
              lat=28614000, lon=77209000, gps_flags=GPS_VALID,
              rssi=0, battery=85, motion=MOTION_MOVING, timestamp=1727583069)),
        ("TV2: HELP with Last-Known Location",
         dict(msg_type=MSG_HELP,   device_id=0x0017, seq=0x0023, hop=1, ttl=6,
              lat=28612000, lon=77210000, gps_flags=GPS_LAST_KNOWN,
              rssi=87, battery=42, motion=MOTION_STATIC, timestamp=1727583100)),
        ("TV3: SAFE with No GPS",
         dict(msg_type=MSG_SAFE,   device_id=0x00AB, seq=0x0007, hop=0, ttl=7,
              lat=0, lon=0, gps_flags=GPS_UNAVAILABLE,
              rssi=0, battery=99, motion=MOTION_STATIC, timestamp=1727583200)),
    ]

    for name, kwargs in vectors:
        wire = pack_and_encrypt(**kwargs)
        print(f"--- {name} ---")
        print(f"  Header  : {wire[0:8].hex(' ').upper()}")
        print(f"  IV      : {wire[8:24].hex(' ').upper()}")
        print(f"  Cipher  : {wire[24:56].hex(' ').upper()}")
        print(f"  Full 56B: {wire.hex().upper()}")
        print(f"  Size    : {len(wire)} bytes (expected 56)")
        print()

    print("=" * 64)
    print("Paste these 'Full 56B' values into codec_reference.h and")
    print("codec_reference.py to verify cross-platform byte identity.")
    print("=" * 64)
