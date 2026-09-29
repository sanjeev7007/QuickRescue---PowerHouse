#pragma once

#include <stdint.h>
#include <string.h>
#include <mbedtls/aes.h>
#include <esp_random.h>

#define QR_PACKET_SIZE  56
#define QR_HEADER_SIZE   8
#define QR_IV_SIZE      16
#define QR_CIPHER_SIZE  32
#define QR_PAYLOAD_SIZE 20

#define MSG_SAFE        0x01
#define MSG_HELP        0x02
#define MSG_SOS         0x03
#define MSG_HEARTBEAT   0x04
#define MSG_BROADCAST   0x05
#define MSG_ACK         0x06

#define GPS_UNAVAILABLE 0x00
#define GPS_VALID       0x01
#define GPS_LAST_KNOWN  0x02

#define MOTION_STATIC   0x00
#define MOTION_MOVING   0x01
#define MOTION_FALL     0x02

#define ALERT_EVAC        0x0001
#define ALERT_FLOOD_WARN  0x0002
#define ALERT_LANDSLIDE   0x0003
#define ALERT_CYCLONE     0x0004
#define ALERT_QUAKE       0x0005
#define ALERT_MINE_GAS    0x0006
#define ALERT_LOW_BATT    0x0010
#define ALERT_ALL_CLEAR   0x00FF

static const uint8_t PSK_DEV[16] = {
    0x51, 0x52, 0x4B, 0x65, 0x79, 0x32, 0x30, 0x32,
    0x36, 0x50, 0x53, 0x48, 0x4F, 0x55, 0x53, 0x45,
};

static const uint8_t IV_TEST_ZERO[16] = {0};

typedef struct {
    uint8_t  version;
    uint8_t  msg_type;
    uint16_t device_id;
    uint16_t seq;
    uint8_t  hop_count;
    uint8_t  ttl;

    int32_t  lat;
    int32_t  lon;
    uint8_t  gps_flags;
    uint8_t  rssi;
    uint8_t  battery;
    uint8_t  motion;
    uint32_t timestamp;
    uint8_t  alert_level;
    uint16_t alert_code;
} QRPacket;

static uint16_t _pkcs7_pad(uint8_t *buf, uint16_t data_len, uint16_t block_size) {
    uint8_t pad_len = block_size - (data_len % block_size);
    for (uint8_t i = 0; i < pad_len; i++) {
        buf[data_len + i] = pad_len;
    }
    return data_len + pad_len;
}

static uint16_t _pkcs7_unpad(const uint8_t *buf, uint16_t padded_len) {
    if (padded_len == 0) return 0;
    uint8_t pad_val = buf[padded_len - 1];
    if (pad_val == 0 || pad_val > 16) return 0;
    for (uint8_t i = 0; i < pad_val; i++) {
        if (buf[padded_len - 1 - i] != pad_val) return 0;
    }
    return padded_len - pad_val;
}

int qr_encode(const QRPacket *pkt, const uint8_t *psk,
              const uint8_t *iv_override, uint8_t *wire_out)
{

    wire_out[0] = pkt->version;
    wire_out[1] = pkt->msg_type;
    wire_out[2] = (uint8_t)(pkt->device_id & 0xFF);
    wire_out[3] = (uint8_t)(pkt->device_id >> 8);
    wire_out[4] = (uint8_t)(pkt->seq & 0xFF);
    wire_out[5] = (uint8_t)(pkt->seq >> 8);
    wire_out[6] = pkt->hop_count;
    wire_out[7] = pkt->ttl;

    uint8_t iv[QR_IV_SIZE];
    if (iv_override != NULL) {
        memcpy(iv, iv_override, QR_IV_SIZE);
    } else {
        esp_fill_random(iv, QR_IV_SIZE);
    }
    memcpy(&wire_out[QR_HEADER_SIZE], iv, QR_IV_SIZE);

    uint8_t payload[QR_PAYLOAD_SIZE + 16] = {0};
    uint16_t offset = 0;

    memcpy(&payload[offset], &pkt->lat, 4);  offset += 4;

    memcpy(&payload[offset], &pkt->lon, 4);  offset += 4;
    payload[offset++] = pkt->gps_flags;
    payload[offset++] = pkt->rssi;
    payload[offset++] = pkt->battery;
    payload[offset++] = pkt->motion;

    memcpy(&payload[offset], &pkt->timestamp, 4); offset += 4;
    payload[offset++] = pkt->alert_level;

    payload[offset++] = (uint8_t)(pkt->alert_code & 0xFF);
    payload[offset++] = (uint8_t)(pkt->alert_code >> 8);
    payload[offset++] = 0x00;

    uint16_t padded_len = _pkcs7_pad(payload, QR_PAYLOAD_SIZE, 16);

    mbedtls_aes_context aes;
    mbedtls_aes_init(&aes);

    if (mbedtls_aes_setkey_enc(&aes, psk, 128) != 0) {
        mbedtls_aes_free(&aes);
        return -1;
    }

    uint8_t iv_working[QR_IV_SIZE];
    memcpy(iv_working, iv, QR_IV_SIZE);

    if (mbedtls_aes_crypt_cbc(&aes, MBEDTLS_AES_ENCRYPT,
                               padded_len,
                               iv_working,
                               payload,
                               &wire_out[QR_HEADER_SIZE + QR_IV_SIZE]) != 0) {
        mbedtls_aes_free(&aes);
        return -1;
    }

    mbedtls_aes_free(&aes);
    return 0;
}

int qr_decode(const uint8_t *wire, const uint8_t *psk, QRPacket *pkt_out)
{

    pkt_out->version   = wire[0];
    pkt_out->msg_type  = wire[1];
    pkt_out->device_id = (uint16_t)wire[2] | ((uint16_t)wire[3] << 8);
    pkt_out->seq       = (uint16_t)wire[4] | ((uint16_t)wire[5] << 8);
    pkt_out->hop_count = wire[6];
    pkt_out->ttl       = wire[7];

    uint8_t iv[QR_IV_SIZE];
    memcpy(iv, &wire[QR_HEADER_SIZE], QR_IV_SIZE);

    mbedtls_aes_context aes;
    mbedtls_aes_init(&aes);

    if (mbedtls_aes_setkey_dec(&aes, psk, 128) != 0) {
        mbedtls_aes_free(&aes);
        return -1;
    }

    uint8_t plaintext[QR_CIPHER_SIZE] = {0};
    const uint8_t *ciphertext = &wire[QR_HEADER_SIZE + QR_IV_SIZE];

    if (mbedtls_aes_crypt_cbc(&aes, MBEDTLS_AES_DECRYPT,
                               QR_CIPHER_SIZE,
                               iv,
                               ciphertext,
                               plaintext) != 0) {
        mbedtls_aes_free(&aes);
        return -1;
    }
    mbedtls_aes_free(&aes);

    uint16_t data_len = _pkcs7_unpad(plaintext, QR_CIPHER_SIZE);
    if (data_len != QR_PAYLOAD_SIZE) {
        return (data_len == 0) ? -2 : -3;
    }

    uint16_t offset = 0;
    memcpy(&pkt_out->lat, &plaintext[offset], 4);      offset += 4;
    memcpy(&pkt_out->lon, &plaintext[offset], 4);      offset += 4;
    pkt_out->gps_flags   = plaintext[offset++];
    pkt_out->rssi        = plaintext[offset++];
    pkt_out->battery     = plaintext[offset++];
    pkt_out->motion      = plaintext[offset++];
    memcpy(&pkt_out->timestamp, &plaintext[offset], 4); offset += 4;
    pkt_out->alert_level = plaintext[offset++];
    pkt_out->alert_code  = (uint16_t)plaintext[offset] | ((uint16_t)plaintext[offset + 1] << 8);
    offset += 2;

    return 0;
}

#ifdef QR_SELFTEST
#include <Arduino.h>

static const uint8_t TV1_EXPECTED[QR_PACKET_SIZE] = {

    0x01,0x03,0x42,0x00,0x01,0x00,0x00,0x07,

    0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
    0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,

    0x81,0xDE,0xBE,0x3C,0x51,0x96,0x93,0x58,
    0x82,0xC4,0x11,0xBD,0x82,0x61,0x56,0x77,
    0x41,0xB2,0x09,0xE1,0x85,0xBA,0x59,0xB3,
    0xA0,0x69,0xA8,0x3B,0xFA,0x1E,0x95,0x73,
};

static const uint8_t TV2_EXPECTED[QR_PACKET_SIZE] = {

    0x01,0x02,0x17,0x00,0x23,0x00,0x01,0x06,

    0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
    0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,

    0x44,0x85,0x71,0xCE,0xDD,0x55,0x8B,0x32,
    0xE6,0x38,0x18,0x9D,0x45,0x48,0x6C,0x8D,
    0x2F,0x98,0xFA,0x97,0x8F,0xF8,0x1D,0x97,
    0x73,0xCA,0x43,0x59,0xE4,0xD9,0x20,0xCC,
};

static const uint8_t TV3_EXPECTED[QR_PACKET_SIZE] = {

    0x01,0x01,0xAB,0x00,0x07,0x00,0x00,0x07,

    0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
    0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,

    0x66,0x76,0x56,0xD5,0x7A,0x88,0x62,0xDA,
    0x5D,0xBA,0x78,0x65,0x5E,0x38,0xE6,0xAD,
    0xFA,0x11,0x89,0x43,0xE2,0xC2,0xC1,0x7C,
    0x14,0x63,0x4B,0x08,0xA8,0x2A,0x59,0x41,
};

static void _print_hex(const char *label, const uint8_t *buf, uint16_t len) {
    Serial.print(label);
    for (uint16_t i = 0; i < len; i++) {
        if (buf[i] < 0x10) Serial.print("0");
        Serial.print(buf[i], HEX);
        if (i < len - 1) Serial.print(" ");
    }
    Serial.println();
}

void qr_selftest() {
    Serial.println("============================================================");
    Serial.println("QuickRescue Protocol Self-Test (C++)");
    Serial.println("Vectors verified against pycryptodome reference.");
    Serial.println("============================================================");

    struct {
        const char    *name;
        QRPacket       pkt;
        const uint8_t *expected;
    } vectors[] = {
        {
            "TV1: SOS with Valid GPS",
            {PROTOCOL_VERSION, MSG_SOS, 0x0042, 0x0001, 0, 7,
             28614000, 77209000, GPS_VALID, 0, 85, MOTION_MOVING,
             1727583069, 0, 0},
            TV1_EXPECTED,
        },
        {
            "TV2: HELP with Last-Known Location",
            {PROTOCOL_VERSION, MSG_HELP, 0x0017, 0x0023, 1, 6,
             28612000, 77210000, GPS_LAST_KNOWN, 87, 42, MOTION_STATIC,
             1727583100, 0, 0},
            TV2_EXPECTED,
        },
        {
            "TV3: SAFE with No GPS",
            {PROTOCOL_VERSION, MSG_SAFE, 0x00AB, 0x0007, 0, 7,
             0, 0, GPS_UNAVAILABLE, 0, 99, MOTION_STATIC,
             1727583200, 0, 0},
            TV3_EXPECTED,
        },
    };

    bool all_passed = true;
    for (auto &tv : vectors) {
        Serial.printf("--- %s ---\n", tv.name);

        uint8_t wire[QR_PACKET_SIZE];
        int enc_res = qr_encode(&tv.pkt, PSK_DEV, IV_TEST_ZERO, wire);
        if (enc_res != 0) {
            Serial.printf("  FAIL encode(): returned %d\n", enc_res);
            all_passed = false;
            continue;
        }

        bool wire_match = (memcmp(wire, tv.expected, QR_PACKET_SIZE) == 0);
        if (!wire_match) {
            Serial.println("  FAIL wire: mismatch vs pycryptodome reference");
            _print_hex("  Got      : ", wire,        QR_PACKET_SIZE);
            _print_hex("  Expected : ", tv.expected, QR_PACKET_SIZE);
            all_passed = false;
        } else {
            Serial.println("  PASS wire: matches pycryptodome byte-for-byte");
        }

        QRPacket decoded = {};
        int dec_res = qr_decode(wire, PSK_DEV, &decoded);
        if (dec_res != 0) {
            Serial.printf("  FAIL decode(): returned %d\n", dec_res);
            all_passed = false;
            continue;
        }
        bool fields_ok = (
            decoded.msg_type    == tv.pkt.msg_type   &&
            decoded.device_id   == tv.pkt.device_id  &&
            decoded.seq         == tv.pkt.seq         &&
            decoded.lat         == tv.pkt.lat         &&
            decoded.lon         == tv.pkt.lon         &&
            decoded.gps_flags   == tv.pkt.gps_flags   &&
            decoded.rssi        == tv.pkt.rssi        &&
            decoded.battery     == tv.pkt.battery     &&
            decoded.motion      == tv.pkt.motion      &&
            decoded.timestamp   == tv.pkt.timestamp   &&
            decoded.alert_level == tv.pkt.alert_level &&
            decoded.alert_code  == tv.pkt.alert_code
        );
        if (fields_ok) {
            Serial.println("  PASS decode: all fields round-trip correctly");
        } else {
            Serial.println("  FAIL decode: field mismatch after decode");
            all_passed = false;
        }

        _print_hex("  Header : ", wire,     QR_HEADER_SIZE);
        _print_hex("  IV     : ", wire + 8,  QR_IV_SIZE);
        _print_hex("  Cipher : ", wire + 24, QR_CIPHER_SIZE);
        Serial.print("  Full   : ");
        for (int i = 0; i < QR_PACKET_SIZE; i++) {
            if (wire[i] < 0x10) Serial.print("0");
            Serial.print(wire[i], HEX);
        }
        Serial.println();
        Serial.println();
    }

    Serial.println("============================================================");
    Serial.println(all_passed ? "RESULT: ALL TEST VECTORS PASSED"
                              : "RESULT: SOME TEST VECTORS FAILED");
    Serial.println("============================================================");
}
#endif
