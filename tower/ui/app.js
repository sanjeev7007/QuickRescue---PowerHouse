const API_BASE = window.location.origin;

const clockEl = document.getElementById("clockDisplay");
const netBadgeEl = document.getElementById("netStatusBadge");
const netTextEl = document.getElementById("netStatusText");
const powerTextEl = document.getElementById("powerText");
const btnSilenceEl = document.getElementById("btnSilence");
const alertFeedEl = document.getElementById("alertFeedContainer");
const devListEl = document.getElementById("deviceListContainer");
const squadCountEl = document.getElementById("squadCounter");
const btnMicEl = document.getElementById("btnMic");
const voiceTextEl = document.getElementById("voiceResponseText");

const valTempEl = document.getElementById("valTemp");
const valWaterEl = document.getElementById("valWater");
const valBattEl = document.getElementById("valBatt");
const valSolarEl = document.getElementById("valSolar");
const solarBadgeEl = document.getElementById("solarBadge");

function updateClock() {
  const now = new Date();
  clockEl.textContent = now.toTimeString().split(" ")[0];
}
setInterval(updateClock, 1000);
updateClock();

async function refreshEvents() {
  try {
    const res = await fetch(`${API_BASE}/api/events?limit=50`);
    if (!res.ok) throw new Error("API error");
    const events = await res.json();

    if (!events || events.length === 0) {
      alertFeedEl.innerHTML = '<div class="loading-state">Zero active alerts. System all-clear.</div>';
      return;
    }

    alertFeedEl.innerHTML = events.map(ev => {
      const isSos = ev.type === "SOS";
      const isHelp = ev.type === "HELP";
      const cardClass = isSos ? "incident-sos" : (isHelp ? "incident-help" : "");
      const pillClass = isSos ? "pill-sos" : (isHelp ? "pill-help" : "pill-safe");

      const statusClass = ev.status === "NEW" ? "status-new" :
                         (ev.status === "IN PROGRESS" ? "status-progress" :
                         (ev.status === "RESOLVED" ? "status-resolved" : ""));

      return `
        <div class="incident-card ${cardClass}" data-id="${ev.id}">
          <div class="incident-header-row">
            <div class="incident-tag-group">
              <span class="type-pill ${pillClass}">${ev.type}</span>
              <span class="device-badge">DEV 0x${ev.device_id.toString(16).toUpperCase().padStart(4, '0')}</span>
              <span class="status-indicator ${statusClass}">${ev.status}</span>
            </div>
            <span class="incident-time">${new Date(ev.event_time * 1000).toLocaleTimeString()}</span>
          </div>

          <div class="incident-details-row">
            <span>LOC: <span class="coord-link">${ev.lat.toFixed(4)}, ${ev.lon.toFixed(4)}</span> (${ev.location_state})</span>
            <div class="metric-group">
              <span class="metric-chip">⚡ ${ev.battery}%</span>
              <span class="metric-chip">📶 ${ev.rssi} dBm</span>
            </div>
          </div>

          <div class="incident-actions">
            <button class="btn-action btn-ack" onclick="updateIncidentStatus(${ev.id}, 'ACKNOWLEDGED')">ACKNOWLEDGE</button>
            <button class="btn-action btn-progress" onclick="updateIncidentStatus(${ev.id}, 'IN PROGRESS')">IN PROGRESS</button>
            <button class="btn-action btn-resolve" onclick="updateIncidentStatus(${ev.id}, 'RESOLVED')">RESOLVE</button>
          </div>
        </div>
      `;
    }).join("");

  } catch (err) {
    console.error("Failed to fetch events:", err);
  }
}

window.updateIncidentStatus = async function(eventId, newStatus) {
  try {
    const res = await fetch(`${API_BASE}/api/events/${eventId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus })
    });
    if (!res.ok) throw new Error("Update failed");
    refreshEvents();
  } catch (err) {
    console.error("Status update error:", err);
  }
};

async function refreshDevices() {
  try {
    const res = await fetch(`${API_BASE}/api/devices`);
    if (!res.ok) throw new Error("Devices error");
    const devices = await res.json();

    const activeCount = devices.filter(d => d.is_active).length;
    squadCountEl.textContent = `${activeCount} / ${devices.length} ONLINE`;

    if (devices.length === 0) {
      devListEl.innerHTML = '<div class="loading-state">Zero devices detected yet.</div>';
      return;
    }

    devListEl.innerHTML = devices.map(d => {
      const sosClass = d.is_sos_active ? "device-sos" : "";
      const idHex = "0x" + d.device_id.toString(16).toUpperCase().padStart(4, "0");
      const activePill = d.is_active ? '<span style="color:#34d399">● ACTIVE</span>' : '<span style="color:#94a3b8">○ IDLE</span>';
      const roleText = d.is_master_jacket ? "[LEADER] " : "";

      return `
        <div class="device-row ${sosClass}">
          <div>
            <span class="dev-id-text">${roleText}${idHex}</span>
            <span class="dev-meta-text">(${d.battery}%, ${d.last_rssi}dBm, hop:${d.hop_count})</span>
          </div>
          <div>${activePill}</div>
        </div>
      `;
    }).join("");

  } catch (err) {
    console.error("Failed to fetch devices:", err);
  }
}

async function refreshHealthAndSensors() {
  try {
    const [resHealth, resSensors] = await Promise.all([
      fetch(`${API_BASE}/api/health`),
      fetch(`${API_BASE}/api/sensors/latest`)
    ]);

    if (resHealth.ok) {
      const health = await resHealth.json();

      const isOnline = health.status === "ONLINE";
      if (isOnline) {
        netBadgeEl.className = "status-badge badge-online";
        netTextEl.textContent = "ONLINE (CLOUD)";
      } else {
        netBadgeEl.className = "status-badge badge-offline";
        netTextEl.textContent = "OFFLINE (MESH ONLY)";
      }
    }

    if (resSensors.ok) {
      const sensors = await resSensors.json();
      if (sensors.TEMPERATURE_C && valTempEl) {
        valTempEl.textContent = `${sensors.TEMPERATURE_C.value.toFixed(1)} °C`;
      }
      if (sensors.WATER_LEVEL_MM && valWaterEl) {
        const val = sensors.WATER_LEVEL_MM.value;
        valWaterEl.textContent = `${val.toFixed(0)} mm`;
        valWaterEl.style.color = val > 1000 ? "#ef4444" : "#38bdf8";
      }

      const bv = sensors.BATTERY_VOLTAGE ? sensors.BATTERY_VOLTAGE.value : 13.2;
      const bp = sensors.BATTERY_PCT ? sensors.BATTERY_PCT.value : 75;
      const bi = sensors.BATTERY_CURRENT ? sensors.BATTERY_CURRENT.value : 0.8;

      if (valBattEl) {
        valBattEl.textContent = `${bv.toFixed(2)}V (${bp.toFixed(0)}%)`;
        valBattEl.style.color = bp <= 20 ? "#ef4444" : (bp <= 35 ? "#f59e0b" : "#38bdf8");
      }

      let solarText = "FLOAT (0.0A)";
      if (bi > 0.15) {
        solarText = `☀️ CHG (+${bi.toFixed(1)}A)`;
      } else if (bi < -0.15) {
        solarText = `🔋 DISC (${bi.toFixed(1)}A)`;
      }

      if (valSolarEl) {
        valSolarEl.textContent = solarText;
      }

      if (solarBadgeEl) {
        if (bp <= 20) {
          solarBadgeEl.textContent = "LOW BATT MODE";
          solarBadgeEl.style.background = "rgba(239, 68, 68, 0.25)";
          solarBadgeEl.style.color = "#ef4444";
        } else {
          solarBadgeEl.textContent = bi > 0.15 ? "SOLAR CHARGING" : "SOLAR STANDBY";
          solarBadgeEl.style.background = "rgba(56, 189, 248, 0.15)";
          solarBadgeEl.style.color = "#38bdf8";
        }
      }

      if (powerTextEl) {
        powerTextEl.textContent = `${bv.toFixed(1)}V (${bp.toFixed(0)}%) | ${bi > 0.15 ? '20W SOLAR' : 'BATTERY'}`;
      }
    }
  } catch (err) {
    console.error("Health/Sensors poll error:", err);
  }
}

btnSilenceEl.addEventListener("click", async () => {
  try {
    btnSilenceEl.textContent = "MUTING...";
    await fetch(`${API_BASE}/api/alerts/silence`, { method: "POST" });
    btnSilenceEl.textContent = "SILENCED";
    setTimeout(() => { btnSilenceEl.textContent = "🔇 SILENCE ALARM"; }, 2000);
    refreshEvents();
  } catch (err) {
    console.error("Silence error:", err);
  }
});

async function sendVoiceQuery(queryText) {
  try {
    voiceTextEl.textContent = `Processing: "${queryText}"...`;
    const res = await fetch(`${API_BASE}/api/voice/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: queryText })
    });

    if (!res.ok) throw new Error("Voice query failed");
    const data = await res.json();
    voiceTextEl.textContent = data.spoken_reply;
  } catch (err) {
    voiceTextEl.textContent = `Voice query error: ${err.message}`;
  }
}

btnMicEl.addEventListener("click", () => {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition) {
    const recognition = new SpeechRecognition();
    recognition.lang = "en-IN";
    btnMicEl.classList.add("listening");
    voiceTextEl.textContent = "Listening to microphone... speak now.";

    recognition.onresult = (event) => {
      const speechToText = event.results[0][0].transcript;
      btnMicEl.classList.remove("listening");
      sendVoiceQuery(speechToText);
    };

    recognition.onerror = () => {
      btnMicEl.classList.remove("listening");
      voiceTextEl.textContent = "Microphone listening timed out. Tap chip or try again.";
    };

    recognition.start();
  } else {

    const promptQuery = prompt("Ask Station Query (Microphone input):", "current alerts");
    if (promptQuery) {
      sendVoiceQuery(promptQuery);
    }
  }
});

document.querySelectorAll(".chip").forEach(chip => {
  chip.addEventListener("click", () => {
    const query = chip.getAttribute("data-query");
    sendVoiceQuery(query);
  });
});

function refreshAll() {
  refreshEvents();
  refreshDevices();
  refreshHealthAndSensors();
}

refreshAll();
setInterval(refreshAll, 2500);
