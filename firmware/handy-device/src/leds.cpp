#include "leds.h"
#include "config.h"

static LedMode  s_mode         = LED_IDLE;
static uint32_t s_mode_start   = 0;
static uint32_t s_blink_last   = 0;
static bool     s_blink_state  = false;

void ledsInit() {
    pinMode(PIN_LED_GREEN, OUTPUT);
    pinMode(PIN_LED_RED,   OUTPUT);
    digitalWrite(PIN_LED_GREEN, HIGH);
    digitalWrite(PIN_LED_RED,   LOW);
    s_mode       = LED_IDLE;
    s_mode_start = millis();
}

void ledsSetMode(LedMode mode) {
    if (mode == s_mode) return;
    s_mode       = mode;
    s_mode_start = millis();
    s_blink_last = millis();
    s_blink_state = false;

    switch (mode) {
        case LED_IDLE:
            digitalWrite(PIN_LED_GREEN, HIGH);
            digitalWrite(PIN_LED_RED,   LOW);
            break;
        case LED_SENDING:

            digitalWrite(PIN_LED_GREEN, LOW);
            digitalWrite(PIN_LED_RED,   LOW);
            break;
        case LED_ACK_OK:
            digitalWrite(PIN_LED_GREEN, HIGH);
            digitalWrite(PIN_LED_RED,   LOW);
            break;
        case LED_NO_ACK:

            digitalWrite(PIN_LED_GREEN, LOW);
            digitalWrite(PIN_LED_RED,   HIGH);
            break;
        case LED_SOS_ACTIVE:

            digitalWrite(PIN_LED_GREEN, LOW);
            digitalWrite(PIN_LED_RED,   HIGH);
            break;
        case LED_LOW_BATTERY:

            digitalWrite(PIN_LED_GREEN, HIGH);
            digitalWrite(PIN_LED_RED,   LOW);
            break;
    }
}

void ledsUpdate() {
    uint32_t now = millis();

    switch (s_mode) {
        case LED_IDLE:

            break;

        case LED_SENDING: {

            if (now - s_blink_last >= 250) {
                s_blink_last  = now;
                s_blink_state = !s_blink_state;
                digitalWrite(PIN_LED_GREEN, s_blink_state ? HIGH : LOW);
            }
            break;
        }

        case LED_ACK_OK:

            if (now - s_mode_start >= 2000) {
                ledsSetMode(LED_IDLE);
            }
            break;

        case LED_NO_ACK: {

            if (now - s_blink_last >= 500) {
                s_blink_last  = now;
                s_blink_state = !s_blink_state;
                digitalWrite(PIN_LED_RED, s_blink_state ? HIGH : LOW);
            }
            break;
        }

        case LED_SOS_ACTIVE: {

            if (now - s_blink_last >= 200) {
                s_blink_last  = now;
                s_blink_state = !s_blink_state;
                digitalWrite(PIN_LED_RED, s_blink_state ? HIGH : LOW);
            }
            break;
        }

        case LED_LOW_BATTERY: {

            if (now - s_blink_last >= 500) {
                s_blink_last  = now;
                s_blink_state = !s_blink_state;
                digitalWrite(PIN_LED_GREEN, s_blink_state ? HIGH : LOW);
                digitalWrite(PIN_LED_RED,  !s_blink_state ? HIGH : LOW);
            }
            break;
        }
    }
}

LedMode ledsGetMode() { return s_mode; }
