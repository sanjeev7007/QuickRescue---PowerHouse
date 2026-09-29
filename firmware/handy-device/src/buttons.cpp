#include "buttons.h"
#include "config.h"

static const uint32_t DEBOUNCE_MS  =   50;
static const uint32_t LONG_PRESS_MS = 3000;

enum BtnState { BS_IDLE, BS_DEBOUNCE_DOWN, BS_HELD, BS_DEBOUNCE_UP };

struct Button {
    uint8_t  pin;
    BtnState state;
    uint32_t edge_ms;
    uint32_t press_ms;
    bool     long_reported;
};

static Button s_safe = { PIN_BTN_SAFE, BS_IDLE, 0, 0, false };
static Button s_help = { PIN_BTN_HELP, BS_IDLE, 0, 0, false };

void buttonsInit() {
    pinMode(s_safe.pin, INPUT_PULLUP);
    pinMode(s_help.pin, INPUT_PULLUP);
}

static ButtonEvent _pollButton(Button *b, ButtonEvent event_on_release) {
    bool raw_pressed = (digitalRead(b->pin) == LOW);

    switch (b->state) {
        case BS_IDLE:
            if (raw_pressed) {
                b->state   = BS_DEBOUNCE_DOWN;
                b->edge_ms = millis();
            }
            break;

        case BS_DEBOUNCE_DOWN:
            if (!raw_pressed) {

                b->state = BS_IDLE;
            } else if (millis() - b->edge_ms >= DEBOUNCE_MS) {

                b->state        = BS_HELD;
                b->press_ms     = millis();
                b->long_reported = false;
            }
            break;

        case BS_HELD:
            if (!raw_pressed) {

                b->state   = BS_DEBOUNCE_UP;
                b->edge_ms = millis();
            } else if (!b->long_reported &&
                       (event_on_release == BTN_HELP) &&
                       (millis() - b->press_ms >= LONG_PRESS_MS)) {

                b->long_reported = true;
                return BTN_SOS;
            }
            break;

        case BS_DEBOUNCE_UP:
            if (raw_pressed) {

                b->state = BS_HELD;
            } else if (millis() - b->edge_ms >= DEBOUNCE_MS) {

                b->state = BS_IDLE;
                if (!b->long_reported) {

                    return event_on_release;
                }
            }
            break;
    }
    return BTN_NONE;
}

ButtonEvent buttonsUpdate() {
    ButtonEvent e;

    e = _pollButton(&s_safe, BTN_SAFE);
    if (e != BTN_NONE) return e;

    e = _pollButton(&s_help, BTN_HELP);
    if (e != BTN_NONE) return e;

    return BTN_NONE;
}

bool buttonsAreIdle() {
    return (s_safe.state == BS_IDLE && s_help.state == BS_IDLE);
}
