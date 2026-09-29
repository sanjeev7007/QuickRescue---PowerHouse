#include "imu_module.h"
#include "config.h"
#include <Wire.h>
#include <MPU6050.h>

static const float    EMA_ALPHA          = 0.10f;
static const float    MOVE_THRESHOLD     = 800.0f;
static const float    STATIC_THRESHOLD   = 400.0f;
static const uint32_t STATIC_HOLD_MS     = 2000;
static const uint32_t SAMPLE_INTERVAL_MS = 50;

static const float REST_MAGNITUDE = 16384.0f;

static MPU6050  s_mpu;
static ImuData  s_data  = {};
static uint32_t s_last_sample_ms  = 0;
static uint32_t s_below_thresh_ms = 0;

bool imuInit() {
    s_mpu.initialize();

    if (!s_mpu.testConnection()) {
        Serial.println(F("[IMU] MPU6050 not found — motion detection disabled"));
        s_data.mpu_ok        = false;
        s_data.motion_status = MOTION_STATIC;
        return false;
    }

    s_mpu.setFullScaleAccelRange(MPU6050_ACCEL_FS_2);
    s_mpu.setFullScaleGyroRange(MPU6050_GYRO_FS_250);
    s_mpu.setDLPFMode(MPU6050_DLPF_BW_20);

    s_data.mpu_ok        = true;
    s_data.motion_status = MOTION_STATIC;
    s_data.ema_deviation = 0.0f;

    Serial.println(F("[IMU] MPU6050 OK — ±2g, ±250°/s, DLPF 20 Hz"));
    return true;
}

void imuPoll() {
    if (!s_data.mpu_ok) return;

    uint32_t now = millis();
    if (now - s_last_sample_ms < SAMPLE_INTERVAL_MS) return;
    s_last_sample_ms = now;

    s_mpu.getMotion6(
        &s_data.ax, &s_data.ay, &s_data.az,
        &s_data.gx, &s_data.gy, &s_data.gz
    );

    float ax_f = (float)s_data.ax;
    float ay_f = (float)s_data.ay;
    float az_f = (float)s_data.az;
    float magnitude = sqrtf(ax_f*ax_f + ay_f*ay_f + az_f*az_f);

    float deviation = fabsf(magnitude - REST_MAGNITUDE);

    s_data.ema_deviation = EMA_ALPHA * deviation +
                           (1.0f - EMA_ALPHA) * s_data.ema_deviation;

    if (s_data.motion_status == MOTION_STATIC) {
        if (s_data.ema_deviation > MOVE_THRESHOLD) {

            s_data.motion_status = MOTION_MOVING;
            s_below_thresh_ms    = 0;
            Serial.printf("[IMU] STATIC -> MOVING (ema=%.0f)\n",
                          s_data.ema_deviation);
        }
    } else {

        if (s_data.ema_deviation < STATIC_THRESHOLD) {
            if (s_below_thresh_ms == 0) {
                s_below_thresh_ms = now;
            } else if (now - s_below_thresh_ms >= STATIC_HOLD_MS) {
                s_data.motion_status = MOTION_STATIC;
                s_below_thresh_ms    = 0;
                Serial.printf("[IMU] MOVING -> STATIC (ema=%.0f, held %u ms)\n",
                              s_data.ema_deviation, STATIC_HOLD_MS);
            }
        } else {

            s_below_thresh_ms = 0;
        }
    }
}

const ImuData &imuGet() { return s_data; }
