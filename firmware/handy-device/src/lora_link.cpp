#include "lora_link.h"
#include "config.h"
#include <LoRa.h>
#include <SPI.h>

static struct {
    uint8_t  wire[QR_PACKET_SIZE];
    uint8_t  retries_left;
    uint32_t next_retry_ms;
    bool     active;
} s_retry;

LoRaLinkState g_lora = {};

bool loraInit() {
    SPI.begin(PIN_LORA_SCK, PIN_LORA_MISO, PIN_LORA_MOSI, PIN_LORA_SS);
    LoRa.setPins(PIN_LORA_SS, PIN_LORA_RST, PIN_LORA_DIO0);

    if (!LoRa.begin((long)LORA_FREQUENCY)) {
        Serial.println(F("[LoRa] INIT FAILED — check wiring!"));
        return false;
    }

    LoRa.setSpreadingFactor(LORA_SF);
    LoRa.setSignalBandwidth(LORA_BANDWIDTH);
    LoRa.setCodingRate4(LORA_CR);
    LoRa.setPreambleLength(LORA_PREAMBLE_LEN);
    LoRa.setSyncWord(LORA_SYNC_WORD);
    LoRa.setTxPower(LORA_TX_POWER, PA_OUTPUT_PA_BOOST_PIN);
    LoRa.enableCrc();

    g_lora.initialised = true;
    g_lora.tx_seq      = 0;

    Serial.printf("[LoRa] OK — %.1f MHz SF%d BW%.0fkHz CR4/%d TX%ddBm sync=0x%02X\n",
        LORA_FREQUENCY / 1e6, LORA_SF,
        LORA_BANDWIDTH / 1e3, LORA_CR,
        LORA_TX_POWER, LORA_SYNC_WORD);

    return true;
}

static bool _loraTransmitWire(const uint8_t *wire) {
    LoRa.beginPacket();
    LoRa.write(wire, QR_PACKET_SIZE);
    bool ok = (LoRa.endPacket() == 1);
    LoRa.receive();
    return ok;
}

bool loraSend(QRPacket *pkt) {
    if (!g_lora.initialised) return false;

    pkt->version   = QR_PROTOCOL_VER;
    pkt->seq       = loraNextSeq();
    pkt->hop_count = 0;
    pkt->ttl       = MESH_DEFAULT_TTL;

    uint8_t wire[QR_PACKET_SIZE];
    if (qr_encode(pkt, QR_PSK, nullptr, wire) != 0) {
        Serial.println(F("[LoRa] Encode failed!"));
        return false;
    }

    if (!_loraTransmitWire(wire)) {
        Serial.println(F("[LoRa] TX failed!"));
        return false;
    }

    g_lora.last_tx_ms  = millis();
    g_lora.last_tx_seq = pkt->seq;
    g_lora.ack_pending = (pkt->msg_type == MSG_SOS ||
                          pkt->msg_type == MSG_HELP);

    Serial.printf("[LoRa] TX type=0x%02X seq=%u dev=0x%04X (%d bytes)\n",
                  pkt->msg_type, pkt->seq, pkt->device_id, QR_PACKET_SIZE);

    s_retry.active = false;
    if (pkt->msg_type == MSG_SOS) {
        memcpy(s_retry.wire, wire, QR_PACKET_SIZE);
        s_retry.retries_left  = SOS_RETRY_COUNT;
        s_retry.next_retry_ms = millis() + SOS_RETRY_INTERVAL_MS;
        s_retry.active        = true;
    } else if (pkt->msg_type == MSG_HELP) {
        memcpy(s_retry.wire, wire, QR_PACKET_SIZE);
        s_retry.retries_left  = HELP_RETRY_COUNT;
        s_retry.next_retry_ms = millis() + HELP_RETRY_INTERVAL_MS;
        s_retry.active        = true;
    }

    return true;
}

bool loraPoll(QRPacket *rx_out, uint8_t *raw_wire_out) {

    if (s_retry.active && millis() >= s_retry.next_retry_ms) {
        if (s_retry.retries_left > 0 && g_lora.ack_pending) {
            _loraTransmitWire(s_retry.wire);
            s_retry.retries_left--;
            s_retry.next_retry_ms = millis() +
                (s_retry.wire[1] == MSG_SOS ? SOS_RETRY_INTERVAL_MS
                                            : HELP_RETRY_INTERVAL_MS);
            Serial.printf("[LoRa] Retry %d remaining\n", s_retry.retries_left);
        } else {

            s_retry.active = false;
        }
    }

    int packet_size = LoRa.parsePacket();
    if (packet_size != QR_PACKET_SIZE) {
        if (packet_size > 0) {
            Serial.printf("[LoRa] RX unexpected size %d — discarded\n", packet_size);
        }
        return false;
    }

    uint8_t wire[QR_PACKET_SIZE];
    for (int i = 0; i < QR_PACKET_SIZE; i++) wire[i] = LoRa.read();
    g_lora.last_rx_rssi = (int16_t)LoRa.packetRssi();

    if (raw_wire_out) memcpy(raw_wire_out, wire, QR_PACKET_SIZE);

    if (wire[7] == 0) {
        Serial.println(F("[LoRa] RX dropped — TTL expired"));
        return false;
    }

    QRPacket pkt = {};
    int decode_res = qr_decode(wire, QR_PSK, &pkt);
    if (decode_res != 0) {
        Serial.printf("[LoRa] Decode error %d (wrong key or CRC fail)\n", decode_res);
        return false;
    }

    if (pkt.msg_type == MSG_ACK &&
        pkt.alert_code == g_lora.last_tx_seq) {
        g_lora.ack_pending = false;
        s_retry.active     = false;
        Serial.printf("[LoRa] ACK received for seq=%u\n", g_lora.last_tx_seq);
    }

    const char *type_str = "?";
    switch (pkt.msg_type) {
        case MSG_SAFE:      type_str = "SAFE";      break;
        case MSG_HELP:      type_str = "HELP";      break;
        case MSG_SOS:       type_str = "SOS";       break;
        case MSG_HEARTBEAT: type_str = "HEARTBEAT"; break;
        case MSG_BROADCAST: type_str = "BROADCAST"; break;
        case MSG_ACK:       type_str = "ACK";       break;
    }

    const char *gps_str = "UNAVAIL";
    if      (pkt.gps_flags == GPS_VALID)      gps_str = "VALID";
    else if (pkt.gps_flags == GPS_LAST_KNOWN) gps_str = "LAST_KNOWN";

    Serial.println(F("-------- RX PACKET --------"));
    Serial.printf("  type=%-9s dev=0x%04X seq=%u hop=%u ttl=%u RSSI=%d\n",
                  type_str, pkt.device_id, pkt.seq,
                  pkt.hop_count, pkt.ttl, g_lora.last_rx_rssi);
    Serial.printf("  bat=%u%%  motion=%u  gps=%s\n",
                  pkt.battery, pkt.motion, gps_str);

    if (pkt.gps_flags == GPS_VALID || pkt.gps_flags == GPS_LAST_KNOWN) {
        Serial.printf("  lat=%.6f  lon=%.6f\n",
                      pkt.lat / 1e6, pkt.lon / 1e6);
    } else {
        Serial.println(F("  Location Unavailable"));
    }
    Serial.printf("  ts=%u  alert_level=%u  alert_code=0x%04X\n",
                  pkt.timestamp, pkt.alert_level, pkt.alert_code);
    Serial.println(F("---------------------------"));

    if (rx_out) *rx_out = pkt;
    return true;
}

bool loraIsAckPending() { return g_lora.ack_pending; }

uint16_t loraNextSeq() {
    g_lora.tx_seq++;
    if (g_lora.tx_seq == 0) g_lora.tx_seq = 1;
    return g_lora.tx_seq;
}

bool loraRelayWire(const uint8_t *wire) {
    if (!g_lora.initialised) return false;
    bool ok = _loraTransmitWire(wire);
    if (ok) {
        g_lora.last_tx_ms = millis();

    }
    return ok;
}
