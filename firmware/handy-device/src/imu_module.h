#pragma once
#include <Arduino.h>
#include "qr_codec.h"

struct ImuData {
    uint8_t motion_status;
    bool    mpu_ok;
    int16_t ax, ay, az;
    int16_t gx, gy, gz;
    float   ema_deviation;
};

bool imuInit();

void imuPoll();

const ImuData &imuGet();
