# QuickRescue LoRa Binary Protocol — Complete Specification
# Version 1 | AES-128-CBC | 865-867 MHz India ISM Band

---

## 1. Design Principles

| Principle | Decision |
|---|---|
| Wire format | Packed binary, little-endian integers |
| Encryption | AES-128-CBC, PKCS7 padding, per-message random IV |
| Header | Sent **plaintext** (8 bytes) for relay routing without decryption |
| Payload | AES-128-CBC encrypted (20 bytes plain -> 32 bytes cipher + 16-byte IV) |
| Total wire size | **56 bytes** |
| Duplicate detection | Source Device ID + Sequence Number pair |

---

## 2. Message Types

| Code | Hex | Priority | Description |
|---|---|---|---|
| SOS | 0x03 | 1 (highest) | Life-threatening emergency, full GPS or fallback |
| HELP | 0x02 | 2 | Distress, assistance needed |
| BROADCAST | 0x05 | 3 | Tower -> all devices, weather warning or evacuation order |
| SAFE | 0x01 | 4 | Responder / survivor status confirmed OK |
| HEARTBEAT | 0x04 | 5 | Periodic device telemetry |
| ACK | 0x06 | 6 (lowest) | Acknowledgment of received packet |

---

## 3. GPS Fix Status Flags

| Code | Hex | Meaning |
|---|---|---|
| GPS_VALID | 0x01 | Fresh GPS fix; lat/lon fields are current |
| GPS_LAST_KNOWN | 0x02 | GPS lost; lat/lon = last successfully cached fix; RSSI included |
| GPS_UNAVAILABLE | 0x00 | No fix ever obtained; lat/lon = 0x00000000; display "Location Unavailable" |

---

## 4. Motion Status Codes (MPU6050)

| Code | Hex | Meaning |
|---|---|---|
| STATIC | 0x00 | Device at rest |
| MOVING | 0x01 | Normal movement |
| FALL | 0x02 | Fall/impact detected |

---

## 5. Packet Structure (Wire Format)

```
+-----------+------+----------+----------------------------------------------+
|  PLAINTEXT HEADER (8 bytes) - routed by relay nodes without decryption     |
+-----------+------+----------+----------------------------------------------+
| Offset    | Size | Type     | Description                                  |
+-----------+------+----------+----------------------------------------------+
| 0         | 1    | uint8    | Protocol Version (0x01)                      |
| 1         | 1    | uint8    | Message Type (see Section 2)                 |
| 2         | 2    | uint16LE | Source Device ID (0x0001 to 0xFFFE)          |
| 4         | 2    | uint16LE | Sequence Number (increments per device)      |
| 6         | 1    | uint8    | Hop Count (starts 0, relay increments +1)    |
| 7         | 1    | uint8    | TTL (starts 7, relay decrements; drop at 0)  |
+-----------+------+----------+----------------------------------------------+
|  IV (16 bytes) - random per-message, sent in plaintext                     |
+-----------+------+----------+----------------------------------------------+
| 8         | 16   | bytes    | AES-128-CBC Initialization Vector (IV)       |
+-----------+------+----------+----------------------------------------------+
|  ENCRYPTED PAYLOAD (32 bytes) - AES-128-CBC(PKCS7) of 20-byte plaintext    |
+-----------+------+----------+----------------------------------------------+
| 24        | 32   | bytes    | Ciphertext (20-byte body + 12-byte padding)  |
+-----------+------+----------+----------------------------------------------+
Total wire size: 8 + 16 + 32 = 56 bytes
```

---

## 6. Plaintext Payload Layout (20 bytes - before encryption)

| Offset | Size | Type     | Field           | Notes |
|--------|------|----------|-----------------|-------|
| 0      | 4    | int32LE  | Latitude        | Degrees x 10^6 (e.g. 28.614 deg -> 28614000) |
| 4      | 4    | int32LE  | Longitude       | Degrees x 10^6 (e.g. 77.209 deg -> 77209000) |
| 8      | 1    | uint8    | GPS Flags       | 0x00=Unavailable, 0x01=Valid, 0x02=Last-Known |
| 9      | 1    | uint8    | Last Known RSSI | Stored as positive magnitude, e.g. -90 dBm -> 90 |
| 10     | 1    | uint8    | Battery %       | 0-100; 0xFF = unknown |
| 11     | 1    | uint8    | Motion Status   | 0x00=Static, 0x01=Moving, 0x02=Fall |
| 12     | 4    | uint32LE | Timestamp       | Unix epoch (seconds since Jan 1 1970 UTC) |
| 16     | 1    | uint8    | Alert Level     | 0=None, 1=Info, 2=Warning, 3=Critical (BROADCAST only) |
| 17     | 2    | uint16LE | Alert Code      | Predefined event code (BROADCAST only), else 0x0000 |
| 19     | 1    | uint8    | Reserved        | Must be 0x00 |

---

## 7. AES-128-CBC Encryption Scheme

```
Pre-Shared Key (PSK):  16 bytes, identical on all devices and the tower.
                        Stored in firmware as a compile-time constant.
                        Development key (CHANGE IN PRODUCTION):
                        51 52 4B 65 79 32 30 32 36 50 53 48 4F 55 53 45
                        (ASCII: "QRKey2026PSHOUSE")

IV Generation:          - ESP32: esp_fill_random() - hardware TRNG
                        - Raspberry Pi: os.urandom(16)
                        - IV is per-message, never reused.
                        - IV sent plaintext at packet bytes [8..23].

Padding:                PKCS7 - 20-byte payload padded to 32 bytes
                        (12 padding bytes, each value 0x0C)

Decryption:             Receiver reads IV from bytes [8..23],
                        decrypts bytes [24..55] with PSK + IV,
                        strips PKCS7 padding, recovers 20-byte payload.

Key Management:         PSK rotated via physical firmware update only.
                        No OTA key exchange (no internet in disaster scenario).
```

---

## 8. Duplicate Detection

```
seen_packets = set of (device_id, seq_num) pairs
Per relay node: if (src_id, seq) already in seen_packets -> discard silently
Cache size: last 64 entries per node (sliding window)
Sequence number wraps at 0xFFFF -> 0x0000; treated as newer.
```

---

## 9. Priority Transmission Rules

```
SOS       -> immediate preempt, retry 3x at 250 ms intervals
HELP      -> immediate transmit, retry 2x at 500 ms intervals
BROADCAST -> immediate transmit (from tower only), no retry
SAFE      -> enqueued, transmit when channel free
HEARTBEAT -> lowest priority queue, may be dropped under congestion
ACK       -> single attempt, no retry
```

---

## 10. Payload Size Summary

| Phase | Size |
|---|---|
| Plaintext payload | 20 bytes |
| After PKCS7 padding | 32 bytes |
| AES IV (prepended) | 16 bytes |
| Plaintext header | 8 bytes |
| **Total wire packet** | **56 bytes** |

---

## 11. Alert Codes (BROADCAST message type)

| Name | Hex | Meaning |
|------|-----|---------|
| EVAC | 0x0001 | Evacuate immediately |
| FLOOD_WARN | 0x0002 | Flash flood warning |
| LANDSLIDE | 0x0003 | Landslide risk |
| CYCLONE | 0x0004 | Cyclone approaching |
| QUAKE | 0x0005 | Seismic event |
| MINE_GAS | 0x0006 | Hazardous gas detected |
| ALL_CLEAR | 0x00FF | Situation resolved - all clear |

---

## 12. Test Vectors

> IVs are fixed to all-zeroes **only for test verification**.
> In production, IV MUST be cryptographically random.

### Pre-Shared Key (Test Only)
```
PSK: 51 52 4B 65 79 32 30 32 36 50 53 48 4F 55 53 45
     (ASCII: "QRKey2026PSHOUSE")
```

### Test Vector 1 - SOS with Valid GPS

| Field | Value |
|---|---|
| version | 1 |
| msg_type | SOS (0x03) |
| device_id | 0x0042 |
| seq | 0x0001 |
| hop / ttl | 0 / 7 |
| lat / lon | 28614000 / 77209000 (28.614 N, 77.209 E) |
| gps_flags | GPS_VALID (0x01) |
| rssi | 0 |
| battery | 85% |
| motion | MOVING (0x01) |
| timestamp | 1727583069 |
| alert_level / alert_code | 0 / 0 |

**Computed wire (56 bytes, IV = all-zero test IV):**
```
Header  : 01 03 42 00 01 00 00 07
IV      : 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
Cipher  : 81 DE BE 3C 51 96 93 58 82 C4 11 BD 82 61 56 77
          41 B2 09 E1 85 BA 59 B3 A0 69 A8 3B FA 1E 95 73
Full    : 010342000100000700000000000000000000000000000000
          81DEBE3C5196935882C411BD8261567741B209E185BA59B3
          A069A83BFA1E9573
```

---

### Test Vector 2 - HELP with Last-Known Location

| Field | Value |
|---|---|
| version | 1 |
| msg_type | HELP (0x02) |
| device_id | 0x0017 |
| seq | 0x0023 |
| hop / ttl | 1 / 6 |
| lat / lon | 28612000 / 77210000 (28.612 N, 77.210 E) |
| gps_flags | GPS_LAST_KNOWN (0x02) |
| rssi | 87 (i.e. -87 dBm) |
| battery | 42% |
| motion | STATIC (0x00) |
| timestamp | 1727583100 |
| alert_level / alert_code | 0 / 0 |

**Computed wire (56 bytes, IV = all-zero test IV):**
```
Header  : 01 02 17 00 23 00 01 06
IV      : 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
Cipher  : 44 85 71 CE DD 55 8B 32 E6 38 18 9D 45 48 6C 8D
          2F 98 FA 97 8F F8 1D 97 73 CA 43 59 E4 D9 20 CC
Full    : 010217002300010600000000000000000000000000000000
          448571CEDD558B32E638189D45486C8D2F98FA978FF81D97
          73CA4359E4D920CC
```

---

### Test Vector 3 - SAFE with No GPS

| Field | Value |
|---|---|
| version | 1 |
| msg_type | SAFE (0x01) |
| device_id | 0x00AB |
| seq | 0x0007 |
| hop / ttl | 0 / 7 |
| lat / lon | 0 / 0 (GPS never acquired) |
| gps_flags | GPS_UNAVAILABLE (0x00) |
| rssi | 0 |
| battery | 99% |
| motion | STATIC (0x00) |
| timestamp | 1727583200 |
| alert_level / alert_code | 0 / 0 |

**Computed wire (56 bytes, IV = all-zero test IV):**
```
Header  : 01 01 AB 00 07 00 00 07
IV      : 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
Cipher  : 66 76 56 D5 7A 88 62 DA 5D BA 78 65 5E 38 E6 AD
          FA 11 89 43 E2 C2 C1 7C 14 63 4B 08 A8 2A 59 41
Full    : 0101AB00070000070000000000000000000000000000000066
          7656D57A8862DA5DBA78655E38E6ADFA118943E2C2C17C14
          634B08A82A5941
```

---

## Verification Steps

1. **Python (pycryptodome — authoritative):**
   `pip install pycryptodome` then
   `python protocol/codec_reference.py --selftest`
2. **C++ (ESP32):** Add `#define QR_SELFTEST` before including `codec_reference.h`,
   call `qr_selftest()` in `setup()`, and compare Serial Monitor hex output to the
   `Full` values above byte-for-byte.

All methods must produce identical `Full` hex strings for the protocol to be
considered cross-platform verified.

