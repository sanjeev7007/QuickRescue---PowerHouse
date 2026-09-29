#include "queue.h"

static QueueEntry s_q[MESH_QUEUE_SIZE];

void queueInit() {
    for (uint8_t i = 0; i < MESH_QUEUE_SIZE; i++) {
        s_q[i].used = false;
    }
}

bool queuePush(const uint8_t *wire, uint32_t delay_ms, uint8_t priority) {

    for (uint8_t i = 0; i < MESH_QUEUE_SIZE; i++) {
        if (!s_q[i].used) {
            memcpy(s_q[i].wire, wire, QR_PACKET_SIZE);
            s_q[i].transmit_after_ms = millis() + delay_ms;
            s_q[i].priority          = priority;
            s_q[i].used              = true;
            return true;
        }
    }

    if (priority == MESH_QUEUE_PRIORITY_SOS) {

        uint8_t evict_idx = 0xFF;
        uint8_t lowest_pri = 0xFF;
        for (uint8_t i = 0; i < MESH_QUEUE_SIZE; i++) {
            if (s_q[i].used && s_q[i].priority < lowest_pri &&
                s_q[i].priority < MESH_QUEUE_PRIORITY_SOS) {
                lowest_pri = s_q[i].priority;
                evict_idx  = i;
            }
        }
        if (evict_idx != 0xFF) {
            Serial.printf("[QUEUE] Full — evicting priority=%u to make room for SOS\n",
                          s_q[evict_idx].priority);
            memcpy(s_q[evict_idx].wire, wire, QR_PACKET_SIZE);
            s_q[evict_idx].transmit_after_ms = millis() + delay_ms;
            s_q[evict_idx].priority          = priority;
            return true;
        }
    }
    Serial.println(F("[QUEUE] Full — relay dropped"));
    return false;
}

bool queuePop(uint8_t *wire_out) {
    uint32_t now = millis();
    uint8_t  best_idx  = 0xFF;
    uint8_t  best_pri  = 0;
    uint32_t best_time = UINT32_MAX;

    for (uint8_t i = 0; i < MESH_QUEUE_SIZE; i++) {
        if (!s_q[i].used) continue;
        if (s_q[i].transmit_after_ms > now) continue;

        if (s_q[i].priority > best_pri ||
            (s_q[i].priority == best_pri &&
             s_q[i].transmit_after_ms < best_time)) {
            best_pri  = s_q[i].priority;
            best_time = s_q[i].transmit_after_ms;
            best_idx  = i;
        }
    }

    if (best_idx == 0xFF) return false;

    memcpy(wire_out, s_q[best_idx].wire, QR_PACKET_SIZE);
    s_q[best_idx].used = false;
    return true;
}

uint8_t queueCount() {
    uint8_t n = 0;
    for (uint8_t i = 0; i < MESH_QUEUE_SIZE; i++) {
        if (s_q[i].used) n++;
    }
    return n;
}

bool queueIsFull() { return queueCount() >= MESH_QUEUE_SIZE; }

void queueDump() {
    Serial.printf("[QUEUE] %u/%u slots used:\n", queueCount(), MESH_QUEUE_SIZE);
    uint32_t now = millis();
    for (uint8_t i = 0; i < MESH_QUEUE_SIZE; i++) {
        if (!s_q[i].used) continue;
        int32_t wait = (int32_t)s_q[i].transmit_after_ms - (int32_t)now;
        Serial.printf("  [%u] pri=%u dev=0x%02X%02X seq=%02X%02X ttl=%u hop=%u "
                      "wait=%ldms\n",
                      i, s_q[i].priority,
                      s_q[i].wire[3], s_q[i].wire[2],
                      s_q[i].wire[5], s_q[i].wire[4],
                      s_q[i].wire[7], s_q[i].wire[6],
                      (long)max(0L, wait));
    }
}
