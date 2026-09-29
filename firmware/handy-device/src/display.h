#pragma once
#include <Arduino.h>
#include "qr_codec.h"

struct DisplayState {
    uint16_t    device_id;
    uint8_t     battery_pct;
    uint8_t     gps_flags;
    const char *gps_status_str;
    uint8_t     satellites;
    int16_t     rssi;
    uint8_t     last_msg_type;
    bool        ack_ok;
    bool        ack_pending;
    uint8_t     motion;
    bool        low_battery;
};

bool displayInit();

void displayUpdate(const DisplayState &s);

void displayShowBoot();

void displayShowError(const char *msg);
