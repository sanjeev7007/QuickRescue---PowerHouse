#pragma once
#include <Arduino.h>
#include "qr_codec.h"

static const uint32_t GPS_STALE_MS = 10000;

static const uint8_t GPS_MIN_SATS = 3;

static const float GPS_MAX_HDOP = 5.0f;

enum GpsFixState : uint8_t {
    GPS_FIX_NONE       = 0,
    GPS_FIX_ACTIVE     = 1,
    GPS_FIX_LAST_KNOWN = 2,
};

struct GpsData {
    GpsFixState fix_state;
    uint8_t     qr_flags;

    int32_t     lat_1e6;
    int32_t     lon_1e6;
    uint32_t    unix_ts;

    uint8_t     satellites;
    float       hdop;

    uint8_t     rssi_at_loss;
    bool        nvm_loaded;
};

void gpsInit(uint8_t rx_pin, uint8_t tx_pin, uint32_t baud);

void gpsPoll();

const GpsData &gpsGet();

void gpsSetLossRssi(uint8_t rssi_magnitude);

const char *gpsStateStr();
