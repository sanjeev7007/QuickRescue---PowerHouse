#include "mesh.h"
#include "queue.h"
#include "lora_link.h"
#include "config.h"

struct SeenEntry { uint16_t dev; uint16_t seq; };
static SeenEntry s_seen[MESH_SEEN_CACHE_SIZE];
static uint8_t   s_seen_head = 0;

static bool _isSeen(uint16_t dev, uint16_t seq) {
    for (uint8_t i = 0; i < MESH_SEEN_CACHE_SIZE; i++) {
        if (s_seen[i].dev == dev && s_seen[i].seq == seq) return true;
    }
    return false;
}

static void _markSeen(uint16_t dev, uint16_t seq) {
    s_seen[s_seen_head].dev = dev;
    s_seen[s_seen_head].seq = seq;
    s_seen_head = (s_seen_head + 1) % MESH_SEEN_CACHE_SIZE;
}

static uint16_t      s_own_id  = 0;
static BroadcastAlert s_bcast  = {};

static uint8_t _priority(uint8_t msg_type) {
    switch (msg_type) {
        case MSG_SOS:       return MESH_QUEUE_PRIORITY_SOS;
        case MSG_HELP:      return MESH_QUEUE_PRIORITY_URGENT;
        case MSG_BROADCAST: return MESH_QUEUE_PRIORITY_URGENT;
        default:            return MESH_QUEUE_PRIORITY_NORMAL;
    }
}

static uint32_t _jitter(uint8_t msg_type) {
    if (msg_type == MSG_SOS || msg_type == MSG_HELP ||
        msg_type == MSG_BROADCAST) {
        return (uint32_t)random(MESH_JITTER_URGENT_MIN_MS,
                                MESH_JITTER_URGENT_MAX_MS + 1);
    }
    return (uint32_t)random(MESH_JITTER_NORMAL_MIN_MS,
                             MESH_JITTER_NORMAL_MAX_MS + 1);
}

static void _prepareRelay(const uint8_t *in_wire, uint8_t *out_wire) {
    memcpy(out_wire, in_wire, QR_PACKET_SIZE);
    out_wire[6]++;
    out_wire[7]--;
}

void meshInit(uint16_t own_id) {
    s_own_id = own_id;
    queueInit();
    memset(s_seen, 0, sizeof(s_seen));
    s_seen_head = 0;
    s_bcast = {};
    randomSeed(esp_random());

    Serial.printf("[MESH] Init — own_id=0x%04X mode=%s\n",
                  own_id,
                  IS_MASTER_JACKET ? "MASTER_JACKET" : "FIELD_NODE");
}

void meshOnReceive(const QRPacket &decoded, const uint8_t *raw_wire) {

    if (decoded.device_id == s_own_id) {
        Serial.printf("[MESH] Own packet echoed (dev=0x%04X seq=%u) — skip relay\n",
                      decoded.device_id, decoded.seq);
        return;
    }

    uint8_t current_ttl = raw_wire[7];
    if (current_ttl == 0) {
        Serial.printf("[MESH] TTL expired (dev=0x%04X seq=%u) — drop\n",
                      decoded.device_id, decoded.seq);
        return;
    }

    if (_isSeen(decoded.device_id, decoded.seq)) {
        Serial.printf("[MESH] Dup (dev=0x%04X seq=%u) — drop\n",
                      decoded.device_id, decoded.seq);
        return;
    }
    _markSeen(decoded.device_id, decoded.seq);

    if (decoded.msg_type == MSG_BROADCAST) {
        s_bcast.pending      = true;
        s_bcast.alert_level  = decoded.alert_level;
        s_bcast.alert_code   = decoded.alert_code;
        s_bcast.received_ms  = millis();

        Serial.printf("[MESH] BROADCAST received — level=%u code=0x%04X\n",
                      decoded.alert_level, decoded.alert_code);

    }

    if (current_ttl <= 1) {

        Serial.printf("[MESH] TTL=1 — packet consumed, not relayed "
                      "(dev=0x%04X seq=%u)\n", decoded.device_id, decoded.seq);
        return;
    }

    uint8_t relay_wire[QR_PACKET_SIZE];
    _prepareRelay(raw_wire, relay_wire);

    uint8_t  pri    = _priority(decoded.msg_type);
    uint32_t jitter = _jitter(decoded.msg_type);

    if (IS_MASTER_JACKET && (decoded.msg_type == MSG_SOS ||
                              decoded.msg_type == MSG_HELP)) {
        jitter = jitter / 2;
        Serial.printf("[MESH] Master Jacket: priority relay of %s (jitter=%ums)\n",
                      decoded.msg_type == MSG_SOS ? "SOS" : "HELP",
                      (unsigned)jitter);
    }

    bool pushed = queuePush(relay_wire, jitter, pri);
    if (pushed) {
        Serial.printf("[MESH] Queued relay: dev=0x%04X seq=%u "
                      "type=0x%02X hop=%u ttl=%u pri=%u jitter=%ums\n",
                      decoded.device_id, decoded.seq,
                      decoded.msg_type,
                      relay_wire[6],
                      relay_wire[7],
                      pri, (unsigned)jitter);
    }
}

void meshPoll() {
    uint8_t relay_wire[QR_PACKET_SIZE];
    if (!queuePop(relay_wire)) return;

    uint16_t src_dev  = (uint16_t)relay_wire[2] | ((uint16_t)relay_wire[3] << 8);
    uint16_t src_seq  = (uint16_t)relay_wire[4] | ((uint16_t)relay_wire[5] << 8);
    uint8_t  hop      = relay_wire[6];
    uint8_t  ttl      = relay_wire[7];
    uint8_t  msg_type = relay_wire[1];

    bool ok = loraRelayWire(relay_wire);

    Serial.printf("[MESH] Relay TX %s: dev=0x%04X seq=%u hop=%u ttl=%u → %s\n",
                  ok ? "OK" : "FAIL",
                  src_dev, src_seq, hop, ttl,
                  ok ? "sent" : "radio error");

    (void)msg_type;
}

const BroadcastAlert &meshGetBroadcast() { return s_bcast; }

void meshClearBroadcast() { s_bcast.pending = false; }

bool meshIsMasterJacket() { return IS_MASTER_JACKET != 0; }

uint8_t meshQueueCount() { return queueCount(); }
