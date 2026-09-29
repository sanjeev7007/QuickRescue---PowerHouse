#pragma once
#include <Arduino.h>

enum LedMode {
    LED_IDLE = 0,
    LED_SENDING,
    LED_ACK_OK,
    LED_NO_ACK,
    LED_SOS_ACTIVE,
    LED_LOW_BATTERY
};

void ledsInit();

void ledsSetMode(LedMode mode);

void ledsUpdate();

LedMode ledsGetMode();
