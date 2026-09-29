#include <Arduino.h>
#include <Wire.h>
#include <esp_system.h>

#include "config.h"
#include "qr_codec.h"
#include "gps_module.h"
#include "imu_module.h"
#include "lora_link.h"
#include "mesh.h"
#include "buttons.h"
#include "display.h"
#include "leds.h"
#include "power_manager.h"

static DisplayState s_disp = {};

static uint32_t s_last_heartbeat_ms = 0;
static uint32_t s_last_display_ms   = 0;
static uint32_t s_last_power_log_ms = 0;

static uint16_t s_device_id = 0;

static uint16_t _getDeviceId() {
#ifdef QR_DEVICE_ID
    return (uint16_t)(QR_DEVICE_ID);
#else
    uint8_t mac[6];
    esp_efuse_mac_get_default(mac);
    return (uint16_t)((mac[4] << 8) | mac[5]);
#endif
}

static void _fillPacket(QRPacket *pkt, uint8_t msg_type) {
    memset(pkt, 0, sizeof(QRPacket));
    pkt->device_id   = s_device_id;
    pkt->msg_type    = msg_type;

    const GpsData &gps = gpsGet();
    pkt->gps_flags   = gps.qr_flags;
    pkt->lat         = gps.lat_1e6;
    pkt->lon         = gps.lon_1e6;
    pkt->timestamp   = gps.unix_ts;
    pkt->rssi        = (gps.fix_state == GPS_FIX_LAST_KNOWN)
                       ? gps.rssi_at_loss : 0;

    const ImuData &imu = imuGet();
    pkt->motion      = imu.motion_status;
    pkt->battery     = powerGetBatteryPct();
    pkt->alert_level = 0;
    pkt->alert_code  = 0;

    if (msg_type == MSG_HEARTBEAT && powerIsLowBattery()) {
        pkt->alert_level = 2;
        pkt->alert_code  = ALERT_LOW_BATT;
    }

    Serial.printf("[PKT] type=0x%02X gps=%s lat=%.6f lon=%.6f bat=%u%% motion=%u alert=%u:0x%04X\n",
                  msg_type, gpsStateStr(),
                  gps.lat_1e6 / 1e6, gps.lon_1e6 / 1e6,
                  pkt->battery, pkt->motion,
                  pkt->alert_level, pkt->alert_code);
}

static void _handleBroadcast(const BroadcastAlert &bcast) {
    Serial.printf("[BCAST] Alert level=%u code=0x%04X\n",
                  bcast.alert_level, bcast.alert_code);

    ledsSetMode(LED_SOS_ACTIVE);

    s_disp.last_msg_type = MSG_BROADCAST;
    s_disp.ack_ok        = false;
    s_disp.ack_pending   = false;

    displayUpdate(s_disp);

    meshClearBroadcast();
}

void setup() {
    Serial.begin(115200);
    delay(500);
    Serial.println(F("\n============================"));
    Serial.println(F(" QuickRescue Handy Device"));
    Serial.println(F(" Team POWERHOUSE | SIH2026"));
    if (IS_MASTER_JACKET) {
        Serial.println(F(" *** MASTER JACKET ***"));
    }
    Serial.println(F("============================"));

    s_device_id = _getDeviceId();
    Serial.printf("[INIT] Device ID: 0x%04X  mode=%s\n",
                  s_device_id,
                  IS_MASTER_JACKET ? "MASTER_JACKET" : "FIELD_NODE");

    powerInit();

    ledsInit();
    ledsSetMode(LED_SENDING);

    Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);

    if (displayInit()) {
        displayShowBoot();
    } else {
        Serial.println(F("[INIT] OLED failed — continuing"));
    }
    delay(800);

    gpsInit(PIN_GPS_RX, PIN_GPS_TX, GPS_BAUD);

    imuInit();

    buttonsInit();
    Serial.println(F("[INIT] Buttons OK"));

    if (!loraInit()) {
        displayShowError("LoRa FAIL!\nCheck SX1276");
        ledsSetMode(LED_NO_ACK);
        Serial.println(F("[INIT] FATAL: LoRa init failed. Halted."));
        while (true) { ledsUpdate(); delay(10); }
    }

    meshInit(s_device_id);

    s_disp.device_id      = s_device_id;
    s_disp.battery_pct    = powerGetBatteryPct();
    s_disp.low_battery    = powerIsLowBattery();
    s_disp.gps_flags      = gpsGet().qr_flags;
    s_disp.gps_status_str = gpsStateStr();
    s_disp.satellites     = gpsGet().satellites;
    s_disp.last_msg_type  = 0;
    s_disp.ack_ok         = false;
    s_disp.ack_pending    = false;
    s_disp.motion         = MOTION_STATIC;
    displayUpdate(s_disp);

    ledsSetMode(LED_IDLE);

    Serial.println(F("[INIT] Boot complete."));
    Serial.println(F("[INIT] Press SAFE or HELP. Hold HELP 3 s for SOS."));
    s_last_heartbeat_ms = millis();
    s_last_power_log_ms = millis();

    powerLogRuntime();
}

void loop() {

    gpsPoll();
    if (gpsGet().fix_state == GPS_FIX_LAST_KNOWN) {
        gpsSetLossRssi((uint8_t)abs(g_lora.last_rx_rssi));
    }

    imuPoll();

    ButtonEvent evt = buttonsUpdate();
    if (evt != BTN_NONE) {
        QRPacket pkt = {};

        switch (evt) {
            case BTN_SAFE:
                _fillPacket(&pkt, MSG_SAFE);
                Serial.println(F("[BTN] SAFE"));
                ledsSetMode(LED_SENDING);
                break;
            case BTN_HELP:
                _fillPacket(&pkt, MSG_HELP);
                Serial.println(F("[BTN] HELP"));
                ledsSetMode(LED_SOS_ACTIVE);
                break;
            case BTN_SOS:
                _fillPacket(&pkt, MSG_SOS);
                Serial.println(F("[BTN] SOS! (3 s hold triggered)"));
                ledsSetMode(LED_SOS_ACTIVE);
                break;
            default: break;
        }

        if (pkt.msg_type != 0) {
            bool sent = loraSend(&pkt);
            s_disp.last_msg_type = pkt.msg_type;
            s_disp.ack_pending   = (sent && loraIsAckPending());
            s_disp.ack_ok        = false;

            if (!sent) {
                ledsSetMode(LED_NO_ACK);
            } else if (pkt.msg_type == MSG_SAFE) {
                ledsSetMode(LED_ACK_OK);
                s_disp.ack_pending = false;
                s_disp.ack_ok      = true;
            }
        }
    }

    QRPacket rx        = {};
    uint8_t  raw_wire[QR_PACKET_SIZE] = {};
    bool     got_rx    = loraPoll(&rx, raw_wire);

    if (got_rx) {
        s_disp.rssi = g_lora.last_rx_rssi;

        meshOnReceive(rx, raw_wire);

        if (!loraIsAckPending() && s_disp.ack_pending) {
            s_disp.ack_pending = false;
            s_disp.ack_ok      = true;
            ledsSetMode(LED_ACK_OK);
        }
    }

    if (s_disp.ack_pending && !loraIsAckPending()) {
        s_disp.ack_pending = false;
        s_disp.ack_ok      = false;
        if (ledsGetMode() == LED_SOS_ACTIVE || ledsGetMode() == LED_SENDING) {
            ledsSetMode(LED_NO_ACK);
        }
    }

    meshPoll();

    const BroadcastAlert &bcast = meshGetBroadcast();
    if (bcast.pending) {
        _handleBroadcast(bcast);
    }

    if (millis() - s_last_heartbeat_ms >= HEARTBEAT_INTERVAL_MS) {
        s_last_heartbeat_ms = millis();
        QRPacket hb = {};
        _fillPacket(&hb, MSG_HEARTBEAT);
        loraSend(&hb);
        if (powerIsLowBattery()) {
            Serial.printf("[HB] Heartbeat sent (LOW BATTERY WARNING: %u%%)\n", hb.battery);
        } else {
            Serial.printf("[HB] Heartbeat sent (bat=%u%%)\n", hb.battery);
        }
    }

    if (millis() - s_last_power_log_ms >= RUNTIME_LOG_INTERVAL_MS) {
        s_last_power_log_ms = millis();
        powerLogRuntime();
    }

    if (millis() - s_last_display_ms >= 500) {
        s_last_display_ms = millis();

        const GpsData &gps = gpsGet();
        const ImuData &imu = imuGet();

        s_disp.battery_pct    = powerGetBatteryPct();
        s_disp.low_battery    = powerIsLowBattery();
        s_disp.gps_flags      = gps.qr_flags;
        s_disp.gps_status_str = gpsStateStr();
        s_disp.satellites     = gps.satellites;
        s_disp.rssi           = g_lora.last_rx_rssi;
        s_disp.motion         = imu.motion_status;
        s_disp.ack_pending    = loraIsAckPending();

        if (s_disp.low_battery && ledsGetMode() == LED_IDLE) {
            ledsSetMode(LED_LOW_BATTERY);
        } else if (!s_disp.low_battery && ledsGetMode() == LED_LOW_BATTERY) {
            ledsSetMode(LED_IDLE);
        }

        displayUpdate(s_disp);
    }

    ledsUpdate();

    powerSleepUntilNextTask(LIGHT_SLEEP_DEFAULT_MS);
}
