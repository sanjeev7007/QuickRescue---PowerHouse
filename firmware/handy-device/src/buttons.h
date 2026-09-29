#pragma once
#include <Arduino.h>

enum ButtonEvent {
    BTN_NONE = 0,
    BTN_SAFE,
    BTN_HELP,
    BTN_SOS
};

void buttonsInit();

ButtonEvent buttonsUpdate();

bool buttonsAreIdle();
