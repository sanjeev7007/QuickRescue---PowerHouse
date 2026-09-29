#pragma once
#include <Arduino.h>
#include "qr_codec.h"

struct BroadcastAlert {
    bool     pending;
    uint8_t  alert_level;
    uint16_t alert_code;
    uint32_t received_ms;
};

void meshInit(uint16_t own_id);

void meshOnReceive(const QRPacket &decoded, const uint8_t *raw_wire);

void meshPoll();

const BroadcastAlert &meshGetBroadcast();

void meshClearBroadcast();

bool meshIsMasterJacket();

uint8_t meshQueueCount();
