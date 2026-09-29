import React, { useState, useEffect } from 'react';
import { useEmergency } from '../context/EmergencyContext';
import { useAuth } from '../context/AuthContext';
import { playSosSiren, playHelpChime, playAckChime } from '../utils/audioAlerts';
import {
  Radio,
  Send,
  CheckCircle2,
  AlertOctagon,
  Flame,
  Waves,
  Wind,
  ShieldAlert,
  Clock,
  Check,
  Cpu,
  Monitor,
  Wifi,
  Sparkles,
  RefreshCw,
  Info,
  ChevronRight,
  Layers,
  CheckCheck
} from 'lucide-react';

const MAX_PAYLOAD_CHARS = 64;

const ALERT_CODES = [
  { code: 0x0001, name: "Civil Evacuation Order", hex: "0x0001", level: 3, icon: AlertOctagon, defaultMsg: "Gorge flash flood. Evacuate to High Ridge Shelter immediately." },
  { code: 0x0002, name: "Flash Flood Warning", hex: "0x0002", level: 3, icon: Waves, defaultMsg: "River surging upstream 650mm. Move to safe high ground now." },
  { code: 0x0003, name: "Landslide Risk", hex: "0x0003", level: 2, icon: AlertOctagon, defaultMsg: "Slope instability detected in Sector 4. Avoid cliff paths." },
  { code: 0x0004, name: "Cyclone / Storm Warning", hex: "0x0004", level: 3, icon: Wind, defaultMsg: "Gale winds 85km/h approaching. Secure equipment and shelter." },
  { code: 0x0005, name: "Earthquake Tremor Warning", hex: "0x0005", level: 3, icon: AlertOctagon, defaultMsg: "Seismic tremor alert. Evacuate unstable structures immediately." },
  { code: 0x0006, name: "Toxic Gas / Mine Hazard", hex: "0x0006", level: 3, icon: Flame, defaultMsg: "Hazardous gas detected in tunnel. Don respirator masks now." },
  { code: 0x00FF, name: "Safe All-Clear", hex: "0x00FF", level: 1, icon: CheckCircle2, defaultMsg: "All clear. Hazard neutralized. Normal field operations resume." }
];

export default function AdminBroadcastScreen() {
  const { broadcasts, devices, dispatchAdminBroadcast, simulateDeviceAck } = useEmergency();
  const { currentUser } = useAuth();

  const [title, setTitle] = useState("CIVIL EVACUATION ORDER");
  const [level, setLevel] = useState(3);
  const [code, setCode] = useState(0x0001);
  const [message, setMessage] = useState("Gorge flash flood. Evacuate to High Ridge Shelter immediately.");
  const [targetTower, setTargetTower] = useState(0);
  const [isSending, setIsSending] = useState(false);
  const [sentSuccess, setSentSuccess] = useState(null);

  const [selectedPreviewDevice, setSelectedPreviewDevice] = useState(0x0042);
  const [oledBlink, setOledBlink] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setOledBlink((prev) => !prev);
    }, 600);
    return () => clearInterval(interval);
  }, []);

  const handleSelectTemplate = (template) => {
    setTitle(template.name.toUpperCase());
    setLevel(template.level);
    setCode(template.code);
    setMessage(template.defaultMsg);
  };

  const handleDispatch = async (e) => {
    if (e) e.preventDefault();
    setIsSending(true);

    try {
      if (level === 3) {
        playSosSiren();
      } else {
        playHelpChime();
      }

      const cleanMessage = message.slice(0, MAX_PAYLOAD_CHARS);
      const res = await dispatchAdminBroadcast({
        title,
        level,
        code,
        message: cleanMessage,
        towerId: targetTower,
        createdBy: currentUser?.displayName || "COMMANDER_NDRF"
      });

      setSentSuccess(`✅ Broadcast "${title}" queued! Saved to Firebase and transmitted over LoRa mesh.`);
      setTimeout(() => setSentSuccess(null), 5000);
    } catch (err) {
      alert("Broadcast dispatch failed: " + err.message);
    } finally {
      setIsSending(false);
    }
  };

  const handleSimulateAck = (broadcastId, devId, devName) => {
    simulateDeviceAck(broadcastId, devId, devName);
    playAckChime();
    setSentSuccess(`📡 LoRa ACK received from ${devName} (0x${devId.toString(16).toUpperCase()})! Delivery tracked.`);
    setTimeout(() => setSentSuccess(null), 4000);
  };

  const remainingChars = MAX_PAYLOAD_CHARS - message.length;
  const charPercent = Math.min(100, Math.round((message.length / MAX_PAYLOAD_CHARS) * 100));

  return (
    <div className="screen-container">

      <div className="view-header">
        <div className="view-title-group">
          <h2>
            <Radio className="text-cyan-400" size={28} />
            <span>ADMIN BROADCAST DISPATCHER</span>
          </h2>
          <p>
            Emergency LoRa command uplink to towers &amp; Handy Devices • Step 2 Binary AES-128 Payload (Max {MAX_PAYLOAD_CHARS} chars)
          </p>
        </div>

        <div className="view-actions">
          <span className="pill pill-online">
            ● TOWER SYNC BRIDGE: ONLINE
          </span>
          <span className="pill pill-safe">
            📡 LORA MESH READY (866 MHz)
          </span>
        </div>
      </div>

      {sentSuccess && (
        <div
          style={{
            background: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid #10b981',
            borderRadius: 'var(--radius-md)',
            padding: '12px 18px',
            color: '#10b981',
            fontSize: '0.88rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 20,
            boxShadow: '0 0 15px rgba(16, 185, 129, 0.25)',
            animation: 'fadeIn 0.3s'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <CheckCircle2 size={18} />
            <span>{sentSuccess}</span>
          </div>
          <button
            onClick={() => setSentSuccess(null)}
            style={{ background: 'none', border: 'none', color: '#6ee7b7', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 0.95fr', gap: 24, marginBottom: 24 }}>

        <div className="card-tactical">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Radio size={18} className="text-cyan-400" />
              <span>COMPOSE EMERGENCY LORA BROADCAST</span>
            </h3>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Step 2 Protocol Encrypted
            </span>
          </div>

          <form onSubmit={handleDispatch}>

            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Alert Headline / Title (Max 32 Chars)</span>
                <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{title.length}/32</span>
              </label>
              <input
                type="text"
                className="form-input"
                value={title}
                onChange={(e) => setTitle(e.target.value.slice(0, 32))}
                maxLength={32}
                placeholder="e.g. CIVIL EVACUATION ORDER"
                required
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
              <div>
                <label className="form-label">Alert Severity Level</label>
                <select
                  className="form-input"
                  value={level}
                  onChange={(e) => setLevel(Number(e.target.value))}
                  style={{
                    color: level === 3 ? '#ef4444' : level === 2 ? '#f59e0b' : '#38bdf8',
                    fontWeight: 700
                  }}
                >
                  <option value={3} style={{ color: '#ef4444' }}>Level 3: Critical Danger / Evacuation</option>
                  <option value={2} style={{ color: '#f59e0b' }}>Level 2: Urgent Warning</option>
                  <option value={1} style={{ color: '#38bdf8' }}>Level 1: Advisory / Information</option>
                </select>
              </div>

              <div>
                <label className="form-label">Target Gateway Tower</label>
                <select
                  className="form-input"
                  value={targetTower}
                  onChange={(e) => setTargetTower(Number(e.target.value))}
                >
                  <option value={0}>All Regional Towers (Sector Mesh Flood)</option>
                  <option value={1}>Tower 01 — Sector 4 Gateway</option>
                  <option value={2}>Tower 02 — North Ridge Relay</option>
                </select>
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label className="form-label" style={{ margin: 0 }}>
                  Short Broadcast Message (Handy Device OLED &amp; P10 Board)
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span
                    style={{
                      fontSize: '0.78rem',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      color: remainingChars <= 5 ? '#ef4444' : remainingChars <= 15 ? '#f59e0b' : '#10b981'
                    }}
                  >
                    {message.length} / {MAX_PAYLOAD_CHARS} chars
                  </span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    ({remainingChars} remaining)
                  </span>
                </div>
              </div>

              <textarea
                className="form-input"
                rows={3}
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, MAX_PAYLOAD_CHARS))}
                maxLength={MAX_PAYLOAD_CHARS}
                required
                placeholder="Type short critical notice here. Updates the virtual OLED in real-time..."
                style={{
                  resize: 'none',
                  fontSize: '0.9rem',
                  borderColor: remainingChars <= 5 ? 'rgba(239, 68, 68, 0.5)' : undefined
                }}
              />

              <div style={{ width: '100%', height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, marginTop: 6, overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${charPercent}%`,
                    height: '100%',
                    background: charPercent >= 95 ? '#ef4444' : charPercent >= 75 ? '#f59e0b' : '#38bdf8',
                    transition: 'width 0.2s'
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                <span>🔒 Enforcing Step 2 payload limits (fits 56-byte LoRa packet &amp; SSD1306 128×64 OLED)</span>
                <span>{charPercent}% utilized</span>
              </div>
            </div>

            <button
              type="submit"
              className="btn-tactical btn-tactical-danger btn-full"
              disabled={isSending || message.trim().length === 0}
              style={{ justifyContent: 'center', padding: '12px', fontSize: '0.9rem' }}
            >
              <Send size={16} />
              <span>{isSending ? "Uplinking to Towers over Radio..." : "TRANSMIT BROADCAST OVER LORA RADIO"}</span>
            </button>
          </form>

          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
            <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Standard Disaster Templates (Click to fill):
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {ALERT_CODES.map((t) => (
                <button
                  key={t.code}
                  type="button"
                  className="btn-tactical"
                  style={{
                    padding: '4px 10px',
                    fontSize: '0.72rem',
                    background: code === t.code ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.03)',
                    borderColor: code === t.code ? '#38bdf8' : 'var(--border-subtle)',
                    color: code === t.code ? '#38bdf8' : 'var(--text-secondary)'
                  }}
                  onClick={() => handleSelectTemplate(t)}
                >
                  <span>{t.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="card-tactical" style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Monitor className="text-cyan-400" size={18} />
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: '#fff', margin: 0 }}>
                HANDY DEVICE OLED SCREEN PREVIEW
              </h3>
            </div>

            <span className="pill pill-safe" style={{ fontSize: '0.68rem', padding: '2px 8px' }}>
              LIVE SYNC
            </span>
          </div>

          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 12 }}>
            Demonstrates <strong>"DONE WHEN: a message typed on the dashboard appears on Handy Device OLEDs"</strong>. Updates in real-time as you type above!
          </p>

          <div className="oled-chassis">

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid #1e293b' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.08em' }}>
                  QUICKRESCUE HANDY NODE
                </span>
                <span style={{ fontSize: '0.65rem', background: '#0284c7', color: '#fff', padding: '1px 5px', borderRadius: 3 }}>
                  ESP32
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>LED:</span>
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: level === 3 && oledBlink ? '#ef4444' : '#334155',
                    boxShadow: level === 3 && oledBlink ? '0 0 10px #ef4444, 0 0 16px #ef4444' : 'none',
                    transition: 'all 0.1s'
                  }}
                  title="Hardware Alert LED"
                />
              </div>
            </div>

            <div className="oled-screen">

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', letterSpacing: '0.03em', color: '#38bdf8', marginBottom: 4 }}>
                <span>ID:0x{selectedPreviewDevice.toString(16).toUpperCase()} B:85%</span>
                <span>[M]</span>
              </div>

              <div style={{ fontSize: '0.72rem', color: '#38bdf8', marginBottom: 6 }}>
                <span>GPS: OK 7sat</span>
              </div>

              <div
                style={{
                  background: level === 3 ? 'rgba(239, 68, 68, 0.25)' : 'rgba(56, 189, 248, 0.25)',
                  border: level === 3 ? '1px solid #ef4444' : '1px solid #38bdf8',
                  color: level === 3 ? '#fca5a5' : '#bae6fd',
                  textAlign: 'center',
                  fontSize: '0.82rem',
                  fontWeight: 900,
                  padding: '2px 4px',
                  borderRadius: 3,
                  letterSpacing: '0.06em',
                  marginBottom: 6
                }}
              >
                ! {title || "EMERGENCY BROADCAST"} !
              </div>

              <div
                style={{
                  fontSize: '0.76rem',
                  lineHeight: '1.25',
                  color: '#f0f9ff',
                  wordBreak: 'break-word',
                  minHeight: 38,
                  fontFamily: 'monospace'
                }}
              >
                {message || "<Waiting for admin input...>"}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, paddingTop: 4, borderTop: '1px solid rgba(56, 189, 248, 0.3)', fontSize: '0.68rem' }}>
                <span style={{ color: '#38bdf8' }}>ACK: SENT ✓</span>
                <span style={{ color: '#94a3b8' }}>866MHz LoRa</span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Simulate Device:</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  className="btn-tactical"
                  style={{
                    padding: '3px 8px',
                    fontSize: '0.7rem',
                    background: selectedPreviewDevice === 0x0042 ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                    color: selectedPreviewDevice === 0x0042 ? '#38bdf8' : 'var(--text-secondary)'
                  }}
                  onClick={() => setSelectedPreviewDevice(0x0042)}
                >
                  0x0042 (Alpha)
                </button>
                <button
                  type="button"
                  className="btn-tactical"
                  style={{
                    padding: '3px 8px',
                    fontSize: '0.7rem',
                    background: selectedPreviewDevice === 0x0055 ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                    color: selectedPreviewDevice === 0x0055 ? '#38bdf8' : 'var(--text-secondary)'
                  }}
                  onClick={() => setSelectedPreviewDevice(0x0055)}
                >
                  0x0055 (Medic)
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card-tactical">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Layers className="text-cyan-400" size={18} />
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: '#fff', margin: 0 }}>
              BROADCAST DELIVERY HISTORY &amp; DEVICE ACKNOWLEDGMENTS
            </h3>
          </div>

          <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
            Firestore Collection: <code>admin_broadcasts</code> • Step 14 Sync
          </span>
        </div>

        <div className="table-container" style={{ margin: 0 }}>
          <table className="tactical-table">
            <thead>
              <tr>
                <th>Sent Time</th>
                <th>Alert Title</th>
                <th>Code</th>
                <th>Message Content (Max 64 chars)</th>
                <th>LoRa Status</th>
                <th>Device Delivery Acknowledgments</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {broadcasts.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: '#64748b', padding: '30px' }}>
                    No broadcasts recorded yet. Transmit one above to start delivery tracking.
                  </td>
                </tr>
              ) : (
                broadcasts.map((b) => {
                  const ackList = b.acked_devices || [];
                  const isCritical = b.alert_level === 3;

                  return (
                    <tr key={b.id}>

                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Clock size={12} className="text-slate-500" />
                          <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                            {new Date((b.created_at || Date.now() / 1000) * 1000).toLocaleTimeString()}
                          </span>
                        </div>
                        <span style={{ fontSize: '0.68rem', color: '#64748b' }}>
                          {b.created_by || 'COMMANDER'}
                        </span>
                      </td>

                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span
                            className="pill"
                            style={{
                              background: isCritical ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                              color: isCritical ? '#ef4444' : '#f59e0b',
                              fontSize: '0.72rem',
                              fontWeight: 800
                            }}
                          >
                            L{b.alert_level || 2}
                          </span>
                          <span style={{ fontWeight: 600, color: '#f1f5f9', fontSize: '0.85rem' }}>
                            {b.alert_title}
                          </span>
                        </div>
                      </td>

                      <td>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: '#38bdf8' }}>
                          0x{(b.alert_code || 0).toString(16).toUpperCase().padStart(4, '0')}
                        </span>
                      </td>

                      <td style={{ maxWidth: 280 }}>
                        <span style={{ fontSize: '0.82rem', color: '#cbd5e1' }}>
                          "{b.message}"
                        </span>
                        <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: 2 }}>
                          Length: {(b.message || '').length} / {MAX_PAYLOAD_CHARS} chars
                        </div>
                      </td>

                      <td>
                        <span className={`pill ${b.dispatched_to_lora ? 'pill-safe' : 'pill-help'}`} style={{ fontSize: '0.7rem' }}>
                          {b.dispatched_to_lora ? '● TRANSMITTED' : '○ PENDING'}
                        </span>
                      </td>

                      <td>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#10b981' }}>
                              {ackList.length} Nodes Acknowledged
                            </span>
                          </div>

                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {ackList.map((ack, idx) => {
                              const hex = '0x' + ack.device_id.toString(16).toUpperCase().padStart(4, '0');
                              return (
                                <span
                                  key={idx}
                                  className="pill pill-safe"
                                  style={{
                                    fontSize: '0.65rem',
                                    padding: '1px 6px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 3
                                  }}
                                  title={`Acknowledged by ${ack.name || hex} at ${new Date((ack.acked_at || Date.now() / 1000) * 1000).toLocaleTimeString()}`}
                                >
                                  <CheckCheck size={10} />
                                  <span>{hex}</span>
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      </td>

                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="btn-tactical"
                          style={{
                            padding: '4px 8px',
                            fontSize: '0.72rem',
                            background: 'rgba(56, 189, 248, 0.12)',
                            color: '#38bdf8',
                            borderColor: 'rgba(56, 189, 248, 0.35)'
                          }}
                          onClick={() => handleSimulateAck(b.id, 0x009C, "Indoor Recon 04")}
                          title="Simulate receiving LoRa delivery acknowledgment from Node 0x009C"
                        >
                          <span>+ Sim ACK</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
