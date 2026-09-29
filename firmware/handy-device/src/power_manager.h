#pragma once

#include <Arduino.h>

void powerInit();

uint16_t powerGetBatteryMv();

uint8_t powerGetBatteryPct();

bool powerIsLowBattery();

bool powerIsCriticalBattery();

uint32_t powerGetUptimeSec();

void powerLogRuntime();

void powerSleepUntilNextTask(uint32_t max_sleep_ms);
