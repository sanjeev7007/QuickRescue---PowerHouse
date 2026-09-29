#include "display.h"
#include "config.h"
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

static Adafruit_SSD1306 s_oled(128, 64, &Wire, -1);

bool displayInit() {
    Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
    if (!s_oled.begin(SSD1306_SWITCHCAPVCC, I2C_ADDR_OLED)) {
        Serial.println(F("[OLED] Init failed — check wiring or I2C address"));
        return false;
    }
    s_oled.clearDisplay();
    s_oled.setTextWrap(false);
    Serial.println(F("[OLED] Init OK"));
    return true;
}

void displayShowBoot() {
    s_oled.clearDisplay();
    s_oled.setTextSize(2);
    s_oled.setTextColor(SSD1306_WHITE);
    s_oled.setCursor(0, 0);
    s_oled.print(F("Quick"));
    s_oled.setCursor(0, 16);
    s_oled.print(F("Rescue"));
    s_oled.setTextSize(1);
    s_oled.setCursor(0, 40);
    s_oled.print(F("Initialising..."));
    s_oled.setCursor(0, 52);
    s_oled.print(F("POWERHOUSE SIH2026"));
    s_oled.display();
}

void displayShowError(const char *msg) {
    s_oled.clearDisplay();
    s_oled.setTextSize(1);
    s_oled.setTextColor(SSD1306_WHITE);
    s_oled.setCursor(0, 0);
    s_oled.print(F("!! ERROR !!"));
    s_oled.setCursor(0, 12);
    s_oled.print(msg);
    s_oled.display();
}

static void _drawBatteryBar(uint8_t pct, bool low_battery) {

    const uint8_t bar_x = 0, bar_y = 57, bar_w = 118, bar_h = 6;
    s_oled.drawRect(bar_x, bar_y, bar_w + 2, bar_h, SSD1306_WHITE);

    s_oled.fillRect(bar_x + bar_w + 2, bar_y + 2, 2, bar_h - 4, SSD1306_WHITE);

    uint8_t fill_w = (uint8_t)((pct * bar_w) / 100);
    if (fill_w > 0) {

        if (!low_battery || ((millis() / 500) % 2 == 0)) {
            s_oled.fillRect(bar_x + 1, bar_y + 1, fill_w, bar_h - 2, SSD1306_WHITE);
        }
    }
}

void displayUpdate(const DisplayState &s) {
    s_oled.clearDisplay();
    s_oled.setTextColor(SSD1306_WHITE);

    s_oled.setTextSize(1);
    s_oled.setCursor(0, 0);
    if (s.low_battery) {
        s_oled.printf("ID:0x%04X B:%u%%!LOW", s.device_id, s.battery_pct);
    } else {
        s_oled.printf("ID:0x%04X  B:%u%%", s.device_id, s.battery_pct);
    }

    s_oled.setCursor(0, 10);
    s_oled.print(F("GPS:"));
    if (s.gps_status_str) {
        s_oled.print(s.gps_status_str);
    } else {

        switch (s.gps_flags) {
            case GPS_VALID:      s_oled.print(F("OK"));         break;
            case GPS_LAST_KNOWN: s_oled.print(F("LAST KNOWN")); break;
            default:             s_oled.print(F("NO GPS"));     break;
        }
    }

    if (s.gps_flags == GPS_VALID && s.satellites > 0) {
        s_oled.printf(" %usat", s.satellites);
    }

    if (s.gps_flags == GPS_LAST_KNOWN && s.rssi != 0) {
        s_oled.printf(" R:%d", s.rssi);
    }

    s_oled.setTextSize(2);
    s_oled.setCursor(0, 20);
    switch (s.last_msg_type) {
        case MSG_SAFE:
            s_oled.print(F("SAFE"));
            break;
        case MSG_HELP:
            s_oled.print(F("HELP"));
            break;
        case MSG_SOS:
            s_oled.print(F("SOS!"));
            break;
        case MSG_HEARTBEAT:
            s_oled.print(F("HB"));
            break;
        case MSG_BROADCAST:
            s_oled.print(F("BCAST"));
            break;
        default:
            s_oled.print(F("----"));
            break;
    }

    s_oled.setTextSize(1);
    s_oled.setCursor(0, 40);
    if (s.ack_pending) {
        s_oled.print(F("ACK: WAITING..."));
    } else if (s.ack_ok) {
        s_oled.print(F("ACK: OK"));
    } else if (s.low_battery && ((millis() / 1000) % 2 == 0)) {
        s_oled.print(F("! LOW BATTERY !"));
    } else if (s.last_msg_type != 0) {
        s_oled.print(F("ACK: NONE"));
    }

    s_oled.setCursor(112, 0);
    switch (s.motion) {
        case MOTION_FALL:   s_oled.print(F("F")); break;
        case MOTION_MOVING: s_oled.print(F("M")); break;
        default:            s_oled.print(F(".")); break;
    }

    _drawBatteryBar(s.battery_pct, s.low_battery);

    s_oled.display();
}
