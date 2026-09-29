#pragma once

#define PIN_LORA_SCK        18
#define PIN_LORA_MISO       19
#define PIN_LORA_MOSI       23
#define PIN_LORA_SS          5

#define PIN_LORA_RST        14
#define PIN_LORA_DIO0       26

#define PIN_GPS_RX          16
#define PIN_GPS_TX          17
#define GPS_BAUD          9600

#define PIN_I2C_SDA         21
#define PIN_I2C_SCL         22

#define I2C_ADDR_OLED     0x3C
#define I2C_ADDR_MPU      0x68

#define PIN_MPU_INT          4

#define PIN_LED_GREEN       25
#define PIN_LED_RED         27

#define PIN_BTN_SAFE        32

#define PIN_BTN_HELP        33

#define PIN_BATT_ADC        35
#define BATT_DIVIDER_RATIO  0.5f
#define BATT_MV_FULL     4200.0f
#define BATT_MV_EMPTY    3000.0f

#define LORA_FREQUENCY  866.0E6
#define LORA_BANDWIDTH  125.0E3
#define LORA_SF              10
#define LORA_CR               5
#define LORA_TX_POWER        17

#define LORA_PREAMBLE_LEN     8
#define LORA_SYNC_WORD     0x12

#ifndef HEARTBEAT_INTERVAL_MS
#define HEARTBEAT_INTERVAL_MS   60000
#endif
#define SOS_RETRY_COUNT             3
#define SOS_RETRY_INTERVAL_MS     250
#define HELP_RETRY_COUNT            2
#define HELP_RETRY_INTERVAL_MS    500

#define BATT_LOW_THRESHOLD_PCT      20
#define BATT_CRITICAL_THRESHOLD_PCT 10
#define LIGHT_SLEEP_DEFAULT_MS      50
#define RUNTIME_LOG_INTERVAL_MS  60000

#define MESH_DEFAULT_TTL            7
#define MESH_SEEN_CACHE_SIZE       64

#define MESH_JITTER_NORMAL_MIN_MS   20
#define MESH_JITTER_NORMAL_MAX_MS   80
#define MESH_JITTER_URGENT_MIN_MS    5
#define MESH_JITTER_URGENT_MAX_MS   20

#define MESH_QUEUE_SIZE              8
#define MESH_QUEUE_PRIORITY_SOS      3
#define MESH_QUEUE_PRIORITY_URGENT   2
#define MESH_QUEUE_PRIORITY_NORMAL   1

#ifndef IS_MASTER_JACKET
#define IS_MASTER_JACKET             0
#endif
