#include "gps_module.h"
#include <TinyGPS++.h>
#include <HardwareSerial.h>
#include <Preferences.h>

static TinyGPSPlus    s_gps;
static HardwareSerial s_serial(2);
static Preferences    s_prefs;
static GpsData        s_data = {};

static uint32_t s_last_valid_ms = 0;

static bool s_was_active = false;

static bool _isLeapYear(uint16_t y) {
    return (y % 4 == 0 && y % 100 != 0) || (y % 400 == 0);
}

static uint32_t _toUnixUtc(uint16_t year, uint8_t month, uint8_t day,
                             uint8_t  hour,  uint8_t  min,  uint8_t  sec) {

    uint32_t days = 0;
    for (uint16_t y = 1970; y < year; y++) {
        days += _isLeapYear(y) ? 366 : 365;
    }

    const uint8_t dim[12] = {31,28,31,30,31,30,31,31,30,31,30,31};
    for (uint8_t m = 1; m < month; m++) {
        days += dim[m - 1];
        if (m == 2 && _isLeapYear(year)) days++;
    }
    days += (uint32_t)(day - 1);
    return days * 86400UL + (uint32_t)hour * 3600UL +
           (uint32_t)min  * 60UL + (uint32_t)sec;
}

static void _saveNvs() {
    s_prefs.begin("qr_gps", false);
    s_prefs.putInt("lat_i32", (int32_t)s_data.lat_1e6);
    s_prefs.putInt("lon_i32", (int32_t)s_data.lon_1e6);
    s_prefs.putUInt("ts_u32", s_data.unix_ts);
    s_prefs.putUChar("has_fix", 1);
    s_prefs.end();
    Serial.printf("[GPS] NVS saved: lat=%.6f lon=%.6f ts=%u\n",
                  s_data.lat_1e6 / 1e6, s_data.lon_1e6 / 1e6, s_data.unix_ts);
}

static bool _loadNvs() {
    s_prefs.begin("qr_gps", true);
    bool has = (s_prefs.getUChar("has_fix", 0) == 1);
    if (has) {
        s_data.lat_1e6 = s_prefs.getInt("lat_i32", 0);
        s_data.lon_1e6 = s_prefs.getInt("lon_i32", 0);
        s_data.unix_ts = s_prefs.getUInt("ts_u32",  0);
    }
    s_prefs.end();
    return has;
}

static void _enterActive() {
    if (s_data.fix_state != GPS_FIX_ACTIVE) {
        Serial.println(F("[GPS] State -> ACTIVE (live fix)"));
    }
    s_data.fix_state = GPS_FIX_ACTIVE;
    s_data.qr_flags  = GPS_VALID;
}

static void _enterLastKnown(bool from_active) {
    if (from_active) {
        Serial.println(F("[GPS] State -> LAST_KNOWN (fix lost)"));
    }
    s_data.fix_state = GPS_FIX_LAST_KNOWN;
    s_data.qr_flags  = GPS_LAST_KNOWN;

}

static void _enterNone() {
    s_data.fix_state   = GPS_FIX_NONE;
    s_data.qr_flags    = GPS_UNAVAILABLE;
    s_data.lat_1e6     = 0;
    s_data.lon_1e6     = 0;
    s_data.unix_ts     = 0;
    s_data.satellites  = 0;
    s_data.hdop        = 99.0f;
}

void gpsInit(uint8_t rx_pin, uint8_t tx_pin, uint32_t baud) {

    s_data = {};
    s_data.hdop = 99.0f;

    s_serial.begin(baud, SERIAL_8N1, rx_pin, tx_pin);

    if (_loadNvs()) {

        _enterLastKnown(false);
        s_data.nvm_loaded = true;
        Serial.printf("[GPS] NVS loaded: lat=%.6f lon=%.6f ts=%u\n",
                      s_data.lat_1e6 / 1e6, s_data.lon_1e6 / 1e6, s_data.unix_ts);
    } else {

        _enterNone();
        s_data.nvm_loaded = false;
        Serial.println(F("[GPS] No NVS data — starting GPS_UNAVAILABLE"));
    }

    Serial.printf("[GPS] UART2 started (RX=%d TX=%d baud=%u)\n",
                  rx_pin, tx_pin, baud);
}

void gpsPoll() {

    while (s_serial.available()) {
        s_gps.encode(s_serial.read());
    }

    bool have_live_fix = (
        s_gps.location.isValid()          &&
        s_gps.location.age() < GPS_STALE_MS &&
        s_gps.satellites.isValid()         &&
        s_gps.satellites.value() >= GPS_MIN_SATS &&
        s_gps.hdop.isValid()               &&
        s_gps.hdop.hdop() <= GPS_MAX_HDOP
    );

    if (have_live_fix) {

        s_data.lat_1e6    = (int32_t)(s_gps.location.lat() * 1e6);
        s_data.lon_1e6    = (int32_t)(s_gps.location.lng() * 1e6);
        s_data.satellites = (uint8_t)s_gps.satellites.value();
        s_data.hdop       = (float)s_gps.hdop.hdop();

        if (s_gps.date.isValid() && s_gps.time.isValid() &&
            s_gps.date.year() >= 2024) {
            s_data.unix_ts = _toUnixUtc(
                s_gps.date.year(),  s_gps.date.month(), s_gps.date.day(),
                s_gps.time.hour(),  s_gps.time.minute(), s_gps.time.second()
            );
        }

        static uint32_t s_last_nvm_save = 0;
        if (millis() - s_last_nvm_save >= 60000) {
            s_last_nvm_save = millis();
            _saveNvs();
        }

        s_last_valid_ms = millis();

        if (s_data.fix_state != GPS_FIX_ACTIVE) {
            _enterActive();
            s_was_active = true;
        }

    } else {

        bool fix_timed_out = (s_last_valid_ms > 0) &&
                             (millis() - s_last_valid_ms >= GPS_STALE_MS);

        if (s_data.fix_state == GPS_FIX_ACTIVE && fix_timed_out) {

            _saveNvs();
            _enterLastKnown(true);
            s_data.satellites = 0;
            s_data.hdop       = 99.0f;
            s_was_active      = false;
        }

    }
}

const GpsData &gpsGet() { return s_data; }

void gpsSetLossRssi(uint8_t rssi_magnitude) {
    s_data.rssi_at_loss = rssi_magnitude;
}

const char *gpsStateStr() {
    switch (s_data.fix_state) {
        case GPS_FIX_ACTIVE:     return "GPS OK";
        case GPS_FIX_LAST_KNOWN: return "LAST KNOWN";
        default:                 return "NO GPS";
    }
}
