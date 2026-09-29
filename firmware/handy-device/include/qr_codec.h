#pragma once

#include <stdint.h>
#include <string.h>
#include <mbedtls/aes.h>
#include <esp_random.h>

#define QR_PACKET_SIZE   56
#define QR_HEADER_SIZE    8
#define QR_IV_SIZE       16
#define QR_CIPHER_SIZE   32
#define QR_PAYLOAD_SIZE  20

#define MSG_SAFE        0x01
#define MSG_HELP        0x02
#define MSG_SOS         0x03
#define MSG_HEARTBEAT   0x04
#define MSG_BROADCAST   0x05
#define MSG_ACK         0x06

#define GPS_UNAVAILABLE  0x00
#define GPS_VALID        0x01
#define GPS_LAST_KNOWN   0x02

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

#define QR_PROTOCOL_VER  0x01

static const uint8_t QR_PSK[16] = {
    0x51, 0x52, 0x4B, 0x65, 0x79, 0x32, 0x30, 0x32,
    0x36, 0x50, 0x53, 0x48, 0x4F, 0x55, 0x53, 0x45,
};

static const uint8_t QR_IV_ZEROS[16] = { 0 };

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

static inline uint8_t _qr_pkcs7_pad(uint8_t *buf, uint8_t data_len) {
    const uint8_t block = 16;
    uint8_t pad_val     = block - (data_len % block);
    for (uint8_t i = 0; i < pad_val; i++) buf[data_len + i] = pad_val;
    return data_len + pad_val;
}

static inline uint8_t _qr_pkcs7_unpad(const uint8_t *buf, uint8_t padded_len) {
    if (padded_len == 0 || padded_len > 32) return 0;
    uint8_t pad_val = buf[padded_len - 1];
    if (pad_val == 0 || pad_val > 16) return 0;
    for (uint8_t i = 1; i <= pad_val; i++) {
        if (buf[padded_len - i] != pad_val) return 0;
    }
    return padded_len - pad_val;
}

static int qr_encode(const QRPacket *pkt,
                     const uint8_t  *psk,
                     const uint8_t  *iv_force,
                     uint8_t        *wire_out)
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
    if (iv_force) {
        memcpy(iv, iv_force, QR_IV_SIZE);
    } else {
        esp_fill_random(iv, QR_IV_SIZE);
    }
    memcpy(&wire_out[QR_HEADER_SIZE], iv, QR_IV_SIZE);

    uint8_t payload[QR_PAYLOAD_SIZE + 16] = {0};
    uint8_t o = 0;
    memcpy(&payload[o], &pkt->lat,       4); o += 4;
    memcpy(&payload[o], &pkt->lon,       4); o += 4;
    payload[o++] = pkt->gps_flags;
    payload[o++] = pkt->rssi;
    payload[o++] = pkt->battery;
    payload[o++] = pkt->motion;
    memcpy(&payload[o], &pkt->timestamp, 4); o += 4;
    payload[o++] = pkt->alert_level;
    payload[o++] = (uint8_t)(pkt->alert_code & 0xFF);
    payload[o++] = (uint8_t)(pkt->alert_code >> 8);
    payload[o++] = 0x00;

    uint8_t padded_len = _qr_pkcs7_pad(payload, QR_PAYLOAD_SIZE);

    mbedtls_aes_context aes;
    mbedtls_aes_init(&aes);
    if (mbedtls_aes_setkey_enc(&aes, psk, 128) != 0) {
        mbedtls_aes_free(&aes);
        return -1;
    }
    uint8_t iv_work[QR_IV_SIZE];
    memcpy(iv_work, iv, QR_IV_SIZE);
    if (mbedtls_aes_crypt_cbc(&aes, MBEDTLS_AES_ENCRYPT,
                               padded_len, iv_work,
                               payload,
                               &wire_out[QR_HEADER_SIZE + QR_IV_SIZE]) != 0) {
        mbedtls_aes_free(&aes);
        return -1;
    }
    mbedtls_aes_free(&aes);
    return 0;
}

static int qr_decode(const uint8_t *wire,
                     const uint8_t *psk,
                     QRPacket      *pkt_out)
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
    uint8_t plain[QR_CIPHER_SIZE] = {0};
    if (mbedtls_aes_crypt_cbc(&aes, MBEDTLS_AES_DECRYPT,
                               QR_CIPHER_SIZE, iv,
                               &wire[QR_HEADER_SIZE + QR_IV_SIZE],
                               plain) != 0) {
        mbedtls_aes_free(&aes);
        return -1;
    }
    mbedtls_aes_free(&aes);

    uint8_t data_len = _qr_pkcs7_unpad(plain, QR_CIPHER_SIZE);
    if (data_len == 0)                 return -2;
    if (data_len != QR_PAYLOAD_SIZE)   return -3;

    uint8_t o = 0;
    memcpy(&pkt_out->lat,       &plain[o], 4); o += 4;
    memcpy(&pkt_out->lon,       &plain[o], 4); o += 4;
    pkt_out->gps_flags   = plain[o++];
    pkt_out->rssi        = plain[o++];
    pkt_out->battery     = plain[o++];
    pkt_out->motion      = plain[o++];
    memcpy(&pkt_out->timestamp, &plain[o], 4); o += 4;
    pkt_out->alert_level = plain[o++];
    pkt_out->alert_code  = (uint16_t)plain[o] | ((uint16_t)plain[o + 1] << 8);
    return 0;
}
