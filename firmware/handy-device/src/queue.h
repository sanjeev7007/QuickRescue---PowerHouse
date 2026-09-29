#pragma once
#include <Arduino.h>
#include "qr_codec.h"
#include "config.h"

struct QueueEntry {
    uint8_t  wire[QR_PACKET_SIZE];
    uint32_t transmit_after_ms;
    uint8_t  priority;
    bool     used;
};

void queueInit();

bool queuePush(const uint8_t *wire, uint32_t delay_ms, uint8_t priority);

bool queuePop(uint8_t *wire_out);

uint8_t queueCount();

bool queueIsFull();

void queueDump();
