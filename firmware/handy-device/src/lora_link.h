#pragma once
#include <Arduino.h>
#include "qr_codec.h"

struct LoRaLinkState {
    bool     initialised;
    uint16_t tx_seq;
    int16_t  last_rx_rssi;
    bool     ack_pending;
    uint32_t last_tx_ms;
    uint16_t last_tx_seq;
};

extern LoRaLinkState g_lora;

bool loraInit();

bool loraSend(QRPacket *pkt);

bool loraPoll(QRPacket *rx_out, uint8_t *raw_wire_out = nullptr);

bool loraRelayWire(const uint8_t *wire);

bool loraIsAckPending();

uint16_t loraNextSeq();
