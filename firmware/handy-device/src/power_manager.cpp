#include "power_manager.h"
#include "config.h"
#include "buttons.h"
#include "lora_link.h"

#include <esp_sleep.h>
#include <driver/gpio.h>

static uint32_t s_boot_ms = 0;
static uint32_t s_last_log_ms = 0;

void powerInit() {

    analogSetAttenuation(ADC_11db);
    pinMode(PIN_BATT_ADC, INPUT);

    gpio_wakeup_enable((gpio_num_t)PIN_BTN_SAFE, GPIO_INTR_LOW_LEVEL);
    gpio_wakeup_enable((gpio_num_t)PIN_BTN_HELP, GPIO_INTR_LOW_LEVEL);

    gpio_wakeup_enable((gpio_num_t)PIN_LORA_DIO0, GPIO_INTR_HIGH_LEVEL);

    esp_sleep_enable_gpio_wakeup();

    s_boot_ms = millis();
    s_last_log_ms = millis();

    Serial.println(F("[POWER] Power Manager initialised (Light Sleep & GPIO wakeups ready)"));
}

uint16_t powerGetBatteryMv() {
    const uint8_t TOTAL_SAMPLES = 16;
    uint16_t samples[TOTAL_SAMPLES];

    for (uint8_t i = 0; i < TOTAL_SAMPLES; i++) {
        samples[i] = analogRead(PIN_BATT_ADC);
        delayMicroseconds(40);
    }

    for (uint8_t i = 0; i < TOTAL_SAMPLES - 1; i++) {
        for (uint8_t j = i + 1; j < TOTAL_SAMPLES; j++) {
            if (samples[i] > samples[j]) {
                uint16_t tmp = samples[i];
                samples[i] = samples[j];
                samples[j] = tmp;
            }
        }
    }

    uint32_t sum = 0;
    for (uint8_t i = 2; i < 14; i++) {
        sum += samples[i];
    }
    float avg_raw = (float)sum / 12.0f;

    float raw_mv  = (avg_raw / 4095.0f) * 3300.0f;
    float batt_mv = raw_mv / BATT_DIVIDER_RATIO;

    return (uint16_t)constrain((int)batt_mv, 2400, 4350);
}

uint8_t powerGetBatteryPct() {
    uint16_t mv = powerGetBatteryMv();

    if (mv <= (uint16_t)BATT_MV_EMPTY) return 0;
    if (mv >= (uint16_t)BATT_MV_FULL)  return 100;

    float pct = ((float)(mv - BATT_MV_EMPTY) /
                 (float)(BATT_MV_FULL - BATT_MV_EMPTY)) * 100.0f;

    return (uint8_t)constrain((int)pct, 0, 100);
}

bool powerIsLowBattery() {
    return (powerGetBatteryPct() <= BATT_LOW_THRESHOLD_PCT);
}

bool powerIsCriticalBattery() {
    return (powerGetBatteryPct() <= BATT_CRITICAL_THRESHOLD_PCT);
}

uint32_t powerGetUptimeSec() {
    return (millis() - s_boot_ms) / 1000;
}

void powerLogRuntime() {
    uint32_t sec  = powerGetUptimeSec();
    uint32_t hrs  = sec / 3600;
    uint32_t mins = (sec % 3600) / 60;
    uint32_t s    = sec % 60;

    uint16_t mv   = powerGetBatteryMv();
    uint8_t  pct  = powerGetBatteryPct();

    const char *status_str = "NORMAL";
    if (pct <= BATT_CRITICAL_THRESHOLD_PCT) {
        status_str = "CRITICAL_LOW";
    } else if (pct <= BATT_LOW_THRESHOLD_PCT) {
        status_str = "LOW_WARNING";
    }

    Serial.printf("[POWER] Runtime: %luh %02lum %02lus (%lu s) | Batt: %u mV (%u%%) | Status: %s\n",
                  hrs, mins, s, sec, mv, pct, status_str);
}

void powerSleepUntilNextTask(uint32_t max_sleep_ms) {
    if (max_sleep_ms == 0) return;

    if (!buttonsAreIdle()) {
        return;
    }

    if (digitalRead(PIN_LORA_DIO0) == HIGH) {
        return;
    }

    if (loraIsAckPending()) {

        if (max_sleep_ms > 10) {
            max_sleep_ms = 10;
        }
    }

    uint64_t sleep_us = (uint64_t)max_sleep_ms * 1000ULL;
    esp_sleep_enable_timer_wakeup(sleep_us);

    Serial.flush();

    esp_light_sleep_start();

}
