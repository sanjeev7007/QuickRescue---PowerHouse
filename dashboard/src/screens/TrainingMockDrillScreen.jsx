import React, { useState, useEffect, useRef } from 'react';
import { useEmergency } from '../context/EmergencyContext';
import { playSosSiren, playHelpChime, playAckChime } from '../utils/audioAlerts';
import {
  GraduationCap,
  BookOpen,
  Award,
  Play,
  StopCircle,
  Timer,
  CheckCircle2,
  AlertTriangle,
  Radio,
  Battery,
  Shield,
  ShieldAlert,
  Flame,
  Waves,
  Wind,
  Mountain,
  HardHat,
  Monitor,
  Check,
  X,
  HelpCircle,
  Clock,
  Layers,
  FileText,
  RotateCcw,
  Sparkles,
  Zap,
  Cpu,
  ArrowRight
} from 'lucide-react';

const TRAINING_MODULES = [
  {
    id: "flood",
    title: "Flood & Flash Inundation",
    code: "0x0002 (ALERT_FLOOD_WARN)",
    icon: Waves,
    color: "#38bdf8",
    bg: "rgba(56, 189, 248, 0.12)",
    overview: "Flash floods occur within 6 hours of heavy rainfall, dam release, or cloudbursts. Water currents exceeding 0.3 m/s can knock down an adult.",
    sop: [
      "1. Immediate Evacuation: Move personnel and equipment to predetermined high ground (>10m above flood level).",
      "2. Handy Device Transmission: Transmit regular SAFE check-ins every 15 minutes unless assistance is required.",
      "3. Bridge & Causeway Standoff: Do not attempt to cross submerged causeways or rapid culverts.",
      "4. Tower Beacon Alignment: Direct node antennas vertically towards the nearest Communication Tower (866 MHz horizon)."
    ],
    survivalRule: "Never drive or wade through moving water. 15cm of rapid water knocks a human; 30cm floats a rescue vehicle.",
    quiz: [
      {
        q: "What is the standard protocol alert code for a Flash Flood Warning?",
        options: ["0x0001", "0x0002", "0x0005", "0x00FF"],
        correct: 1,
        explanation: "Protocol code 0x0002 is designated for ALERT_FLOOD_WARN in the Step 2 specification."
      },
      {
        q: "How often should field responders send SAFE check-ins during an active flood evacuation?",
        options: ["Every 2 hours", "Every 15-30 minutes", "Only once when dry", "Never"],
        correct: 1,
        explanation: "15-30 minute SAFE check-ins maintain network heartbeat and confirm responder accountability."
      }
    ]
  },
  {
    id: "landslide",
    title: "Landslide & Mudflow Risk",
    code: "0x0003 (ALERT_LANDSLIDE)",
    icon: Mountain,
    color: "#f59e0b",
    bg: "rgba(245, 158, 11, 0.12)",
    overview: "Heavy rainfall destabilizes steep hillsides and road cuts. Soil saturation above 90% triggers rapid mass soil displacement without audible warning.",
    sop: [
      "1. Watch Warning Signs: Listen for rumbling sounds, cracking trees, or rapid changes in stream turbidity (muddy runoff).",
      "2. Ridge Evacuation: Move laterally away from the fall line. Never seek shelter in natural drainage gullies.",
      "3. Handy Device Fall Detection: The Handy Device MPU6050 automatically flags motion state [F] (Fall) upon high-G impact.",
      "4. Relay Positioning: Station Master Jacket on the ridgecrest to bridge LoRa packets across the obstructed slope."
    ],
    survivalRule: "Move perpendicular to the landslide path, not uphill or downhill in the debris path.",
    quiz: [
      {
        q: "If an onboard MPU6050 sensor detects a fall during a landslide, which motion flag is sent?",
        options: ["MOTION_STATIC (0)", "MOTION_MOVING (1)", "MOTION_FALL (2)", "MOTION_ERROR (3)"],
        correct: 2,
        explanation: "MOTION_FALL (value 2) is automatically flagged in the telemetry payload."
      },
      {
        q: "Where should the Master Jacket squad leader station themselves in a blocked valley?",
        options: ["At the base of the slide", "Inside a drainage gully", "On the elevated ridgecrest", "Under a cliff"],
        correct: 2,
        explanation: "The elevated ridgecrest provides line-of-sight to both the squad below and the remote gateway tower."
      }
    ]
  },
  {
    id: "cyclone",
    title: "Cyclone & Gale Winds",
    code: "0x0004 (ALERT_CYCLONE)",
    icon: Wind,
    color: "#38bdf8",
    bg: "rgba(56, 189, 248, 0.12)",
    overview: "Cyclonic depressions produce sustained winds >80 km/h with localized gusts over 110 km/h, flying debris, and tidal surges along coastal belts.",
    sop: [
      "1. Hardened Shelter: Muster in reinforced concrete structures away from unanchored tin roofs and glass windows.",
      "2. LoRa Antenna Protection: Fasten flexible rubber-duck antennas; avoid tall metal poles during lightning squalls.",
      "3. Low Battery Strategy: When battery dips below 20%, device automatically reduces OLED timeout while keeping LoRa RX active.",
      "4. Post-Eye Caution: Do not exit when the eye of the storm arrives; intense reverse winds follow within 30 minutes."
    ],
    survivalRule: "The calm center (eye) is deceptive; winds will resume suddenly from the opposite direction with maximum violence.",
    quiz: [
      {
        q: "What does the Handy Device power manager do when battery drops below 20%?",
        options: ["Shuts down radio completely", "Enters low-battery mode: dims OLED but maintains LoRa reception", "Sends continuous SOS", "Deletes database"],
        correct: 1,
        explanation: "Low-battery mode conserves energy on non-critical peripherals while guaranteeing LoRa distress reception."
      },
      {
        q: "What is the Step 2 alert code for ALERT_CYCLONE?",
        options: ["0x0001", "0x0004", "0x0006", "0x0003"],
        correct: 1,
        explanation: "Protocol code 0x0004 represents ALERT_CYCLONE in the binary specification."
      }
    ]
  },
  {
    id: "earthquake",
    title: "Earthquake & Structural Collapse",
    code: "0x0005 (ALERT_QUAKE)",
    icon: ShieldAlert,
    color: "#ef4444",
    bg: "rgba(239, 68, 68, 0.12)",
    overview: "Seismic shocks cause structural shearing, electrical blackouts, and cellular network severed connections in seconds.",
    sop: [
      "1. Drop, Cover, and Hold On: Take cover under sturdy tables or along interior load-bearing pillars.",
      "2. Post-Quake Evacuation: Evacuate immediately; expect powerful aftershocks within 24 to 72 hours.",
      "3. Trapped Protocol: If trapped, hold the red SOS button for 3 seconds. The Handy Device transmits at maximum +22 dBm power.",
      "4. GPS Fallback: Concrete debris blocks satellites; device transmits 'GPS_UNAVAILABLE' with RSSI so tower can triangulate sector."
    ],
    survivalRule: "Do not use elevators. If outdoors, move to open ground away from electrical wires and masonry facades.",
    quiz: [
      {
        q: "When satellite signals are blocked inside collapsed rubble, what does the device send?",
        options: ["Bogus 0.0, 0.0 coordinates", "GPS_UNAVAILABLE with RSSI signal magnitude", "Aborts transmission", "Reboots"],
        correct: 1,
        explanation: "It sets GPS_UNAVAILABLE (0x00) with last-known RSSI so the tower knows the node is indoor without plotting bogus coordinates."
      },
      {
        q: "How long must a responder hold the SOS button to trigger an emergency alert?",
        options: ["0.1 seconds", "0.5 seconds", "3 seconds (guarded press)", "10 seconds"],
        correct: 2,
        explanation: "A 3-second deliberate long press prevents accidental distress triggers while working in rough terrain."
      }
    ]
  },
  {
    id: "mine_gas",
    title: "Mine Collapse & Toxic Gas",
    code: "0x0006 (ALERT_MINE_GAS)",
    icon: HardHat,
    color: "#a855f7",
    bg: "rgba(168, 85, 247, 0.12)",
    overview: "Subsurface tunnel collapses trap explosive methane or toxic hydrogen sulfide gas, causing immediate asphyxiation hazards.",
    sop: [
      "1. Immediate Respirator Seal: Don self-contained breathing apparatus (SCBA) immediately upon gas alert.",
      "2. Mesh Tunnel Hop: Subsurface RF cannot escape directly; rely on daisy-chained Handy Nodes every 80m to reach shaft entrance.",
      "3. HELP Request: If air supply is limited or path obstructed, press HELP (hold 2s) to request emergency extraction kit.",
      "4. Intrinsically Safe Handling: Avoid mechanical sparks while operating switches in methane-rich corridors."
    ],
    survivalRule: "Methane rises while toxic H2S settles in low pits. Evacuate toward well-ventilated intake airflow corridors.",
    quiz: [
      {
        q: "How does LoRa signal escape deep underground tunnels where direct tower RF cannot penetrate?",
        options: ["Satellite link", "Multi-hop mesh relaying through intermediate nodes", "WiFi hotspot", "Cellular LTE"],
        correct: 1,
        explanation: "QuickRescue uses hop-by-hop mesh relaying (TTL up to 7 hops) to bridge tunnel nodes to the surface tower."
      },
      {
        q: "Which alert code corresponds to Toxic Gas / Mine Hazard?",
        options: ["0x0001", "0x0002", "0x0006", "0x00FF"],
        correct: 2,
        explanation: "0x0006 is the protocol code for ALERT_MINE_GAS."
      }
    ]
  }
];

export default function TrainingMockDrillScreen() {
  const { mockDrills, saveMockDrillRecord, devices, currentTime } = useEmergency();

  const [activeTab, setActiveTab] = useState('MOCK_DRILL');

  const [selectedModuleId, setSelectedModuleId] = useState("flood");
  const [quizAnswers, setQuizAnswers] = useState({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);

  const [drillActive, setDrillActive] = useState(false);
  const [drillScenario, setDrillScenario] = useState('FLASH_FLOOD');
  const [drillElapsedSec, setDrillElapsedSec] = useState(0);
  const [drillStartTime, setDrillStartTime] = useState(null);
  const [currentDrillId, setCurrentDrillId] = useState(null);
  const [liveDrillResponses, setLiveDrillResponses] = useState([]);
  const [drillNotification, setDrillNotification] = useState(null);

  const activeModule = TRAINING_MODULES.find(m => m.id === selectedModuleId) || TRAINING_MODULES[0];

  useEffect(() => {
    let timer = null;
    if (drillActive) {
      timer = setInterval(() => {
        setDrillElapsedSec((s) => Number((s + 0.1).toFixed(1)));
      }, 100);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [drillActive]);

  const handleSelectAnswer = (qIdx, optionIdx) => {
    if (quizSubmitted) return;
    setQuizAnswers(prev => ({ ...prev, [qIdx]: optionIdx }));
  };

  const calculateScore = () => {
    let score = 0;
    activeModule.quiz.forEach((q, idx) => {
      if (quizAnswers[idx] === q.correct) score++;
    });
    return score;
  };

  const handleStartDrill = () => {
    const drillId = `drill_${Date.now()}`;
    setCurrentDrillId(drillId);
    setDrillActive(true);
    setDrillElapsedSec(0);
    setDrillStartTime(Date.now());
    setLiveDrillResponses([]);

    playSosSiren();

    setDrillNotification(`⚡ MOCK DRILL LAUNCHED: ${drillScenario.replace('_', ' ')} — Broadcasting simulated test packets marked as DRILL.`);
    setTimeout(() => setDrillNotification(null), 5000);

    const sampleParticipants = [
      { id: 0x0042, name: "Rescue Team Alpha (Leader)", latency: 2.4, status: "ACK_SAFE", hops: 1 },
      { id: 0x0055, name: "Medic Unit 02", latency: 4.6, status: "ACK_SAFE", hops: 2 },
      { id: 0x008A, name: "Evacuation Scout 03", latency: 5.9, status: "ACK_SAFE", hops: 1 },
      { id: 0x009C, name: "Indoor Recon 04", latency: 7.8, status: "ACK_HELP", hops: 2 }
    ];

    sampleParticipants.forEach((p) => {
      setTimeout(() => {
        setLiveDrillResponses((prev) => {
          if (!prev.some(r => r.device_id === p.id)) {
            playAckChime();
            return [
              ...prev,
              {
                device_id: p.id,
                name: p.name,
                response_time_sec: p.latency,
                status: p.status,
                hop_count: p.hops,
                received_at: Math.floor(Date.now() / 1000),
                is_drill: true
              }
            ];
          }
          return prev;
        });
      }, p.latency * 1000);
    });
  };

  const handleSimulateNodeResponse = (devId, devName) => {
    const latency = Number(drillElapsedSec.toFixed(1));
    const newResp = {
      device_id: devId,
      name: devName,
      response_time_sec: latency,
      status: "ACK_SAFE",
      hop_count: 1,
      received_at: Math.floor(Date.now() / 1000),
      is_drill: true
    };

    setLiveDrillResponses(prev => {
      if (prev.some(r => r.device_id === devId)) return prev;
      return [...prev, newResp];
    });

    playAckChime();
  };

  const handleStopDrill = async () => {
    setDrillActive(false);
    const duration = drillElapsedSec;
    const participants = liveDrillResponses.length;
    const avgLatency = participants > 0
      ? Number((liveDrillResponses.reduce((acc, r) => acc + r.response_time_sec, 0) / participants).toFixed(1))
      : 0;

    const scorePct = Math.max(60, Math.min(100, Math.round(100 - (avgLatency * 4))));
    const grade = scorePct >= 90 ? "Grade A (EXCELLENT)" : scorePct >= 75 ? "Grade B (GOOD)" : "Grade C (PASS)";

    const drillRecord = {
      id: currentDrillId || `drill_${Date.now()}`,
      name: `${drillScenario.replace('_', ' ')} Simulation Exercise`,
      scenario: drillScenario,
      started_at: Math.floor((drillStartTime || Date.now()) / 1000),
      completed_at: Math.floor(Date.now() / 1000),
      duration_sec: duration,
      participant_count: participants,
      target_nodes: 4,
      avg_response_time_sec: avgLatency,
      readiness_score: `${scorePct}% (${grade})`,
      status: "COMPLETED",
      device_responses: liveDrillResponses,
      notes: "Drill ran end-to-end. Stored in isolated mock_drills table. Zero real emergency alerts created."
    };

    await saveMockDrillRecord(drillRecord);

    setDrillNotification(`✅ Mock drill completed! Results recorded separately in mock_drills collection (Audit Score: ${scorePct}%).`);
    setTimeout(() => setDrillNotification(null), 6000);
  };

  return (
    <div className="screen-container">

      <div className="view-header">
        <div className="view-title-group">
          <h2>
            <GraduationCap className="text-cyan-400" size={28} />
            <span>TRAINING &amp; MOCK DRILL OPERATIONS CENTER</span>
          </h2>
          <p>
            Standardized disaster protocols, Handy Device interactive guide, competency quizzes, and isolated simulation drills
          </p>
        </div>

        <div className="view-actions">
          <span className="pill pill-safe">
            ● DRILL ISOLATION ENGINE: ACTIVE
          </span>
        </div>
      </div>

      {drillNotification && (
        <div
          style={{
            background: 'rgba(56, 189, 248, 0.15)',
            border: '1px solid #38bdf8',
            borderRadius: 'var(--radius-md)',
            padding: '12px 18px',
            color: '#e0f2fe',
            fontSize: '0.86rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 20,
            boxShadow: '0 0 15px rgba(56, 189, 248, 0.25)',
            animation: 'fadeIn 0.3s'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <CheckCircle2 size={18} className="text-cyan-400" />
            <span>{drillNotification}</span>
          </div>
          <button
            onClick={() => setDrillNotification(null)}
            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginBottom: 22, borderBottom: '1px solid var(--border-subtle)', paddingBottom: 14 }}>
        <button
          className={`btn-tactical ${activeTab === 'MOCK_DRILL' ? 'btn-tactical-primary' : ''}`}
          style={{ fontSize: '0.82rem', padding: '8px 16px' }}
          onClick={() => setActiveTab('MOCK_DRILL')}
        >
          <Timer size={15} />
          <span>Mock Drill Simulator (Isolated)</span>
        </button>

        <button
          className={`btn-tactical ${activeTab === 'TRAINING' ? 'btn-tactical-primary' : ''}`}
          style={{ fontSize: '0.82rem', padding: '8px 16px' }}
          onClick={() => setActiveTab('TRAINING')}
        >
          <BookOpen size={15} />
          <span>Disaster Training Modules &amp; Quizzes</span>
        </button>

        <button
          className={`btn-tactical ${activeTab === 'DEVICE_GUIDE' ? 'btn-tactical-primary' : ''}`}
          style={{ fontSize: '0.82rem', padding: '8px 16px' }}
          onClick={() => setActiveTab('DEVICE_GUIDE')}
        >
          <Radio size={15} />
          <span>How to Use the Handy Device</span>
        </button>

        <button
          className={`btn-tactical ${activeTab === 'AUDIT_LOGS' ? 'btn-tactical-primary' : ''}`}
          style={{ fontSize: '0.82rem', padding: '8px 16px' }}
          onClick={() => setActiveTab('AUDIT_LOGS')}
        >
          <FileText size={15} />
          <span>Drill Audit History ({mockDrills.length})</span>
        </button>
      </div>

      {activeTab === 'MOCK_DRILL' && (
        <div>

          <div
            style={{
              background: 'rgba(168, 85, 247, 0.12)',
              border: '2px solid #a855f7',
              borderRadius: 'var(--radius-lg)',
              padding: '14px 20px',
              marginBottom: 24,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              boxShadow: '0 0 20px rgba(168, 85, 247, 0.2)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Zap size={22} className="text-purple-400" />
              <div>
                <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#e9d5ff', letterSpacing: '0.04em' }}>
                  🔒 STRICT SIMULATION ISOLATION: DRILL MODE ACTIVE
                </span>
                <p style={{ margin: '3px 0 0 0', fontSize: '0.8rem', color: '#cbd5e1' }}>
                  Drill packets are tagged with <code>is_drill: true</code> and recorded in a dedicated audit collection. <strong>Drill events are strictly blocked from contaminating real emergency SOS queues.</strong>
                </p>
              </div>
            </div>
            <span
              style={{
                background: '#a855f7',
                color: '#fff',
                fontSize: '0.72rem',
                fontWeight: 800,
                padding: '3px 10px',
                borderRadius: 4
              }}
            >
              SEPARATE DATA STORE
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 24, marginBottom: 24 }}>

            <div className="card-tactical">
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: '#fff', marginBottom: 14 }}>
                DISASTER DRILL EXECUTION CONTROLLER
              </h3>

              <div className="form-group">
                <label className="form-label">Select Drill Simulation Scenario</label>
                <select
                  className="form-input"
                  value={drillScenario}
                  onChange={(e) => setDrillScenario(e.target.value)}
                  disabled={drillActive}
                >
                  <option value="FLASH_FLOOD">Rapid Flash Flood Inundation (Water Surge &gt; 1200mm)</option>
                  <option value="LANDSLIDE_OBSTRUCTION">Hillside Slope Cut Landslide &amp; Road Blockage</option>
                  <option value="CYCLONE_SHELTER">Severe Gale Wind Cyclone Muster &amp; Shelter Check</option>
                  <option value="EARTHQUAKE_COLLAPSE">Seismic 6.2 Tremor &amp; Structure Evacuation</option>
                  <option value="MINE_GAS_EXTRACTION">Subsurface Mine Gas Leak &amp; Mesh Hop Extraction</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: 14, margin: '20px 0' }}>
                {!drillActive ? (
                  <button
                    className="btn-tactical btn-tactical-primary"
                    style={{ flex: 1, justifyContent: 'center', padding: '12px', fontSize: '0.9rem' }}
                    onClick={handleStartDrill}
                  >
                    <Play size={16} />
                    <span>LAUNCH MOCK DRILL</span>
                  </button>
                ) : (
                  <button
                    className="btn-tactical btn-tactical-danger"
                    style={{ flex: 1, justifyContent: 'center', padding: '12px', fontSize: '0.9rem' }}
                    onClick={handleStopDrill}
                  >
                    <StopCircle size={16} />
                    <span>COMPLETE &amp; STORE DRILL AUDIT</span>
                  </button>
                )}
              </div>

              <div
                style={{
                  background: 'rgba(9, 13, 22, 0.8)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: '16px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Timer size={24} className={drillActive ? "text-red-400 animate-spin" : "text-slate-400"} />
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>DRILL STOPWATCH</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.6rem', fontWeight: 800, color: drillActive ? '#ef4444' : '#fff' }}>
                      {drillElapsedSec.toFixed(1)}s
                    </div>
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <span className={`pill ${drillActive ? 'pill-sos' : 'pill-online'}`} style={{ fontSize: '0.75rem' }}>
                    {drillActive ? "● EXERCISE IN PROGRESS" : "○ STANDBY"}
                  </span>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>
                    Target Response: &lt; 10.0s
                  </div>
                </div>
              </div>
            </div>

            <div className="card-tactical">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: '#fff', margin: 0 }}>
                  PARTICIPANT RESPONSE LATENCY
                </h3>
                <span style={{ fontSize: '0.75rem', color: '#38bdf8', fontWeight: 700 }}>
                  {liveDrillResponses.length} / 4 Responded
                </span>
              </div>

              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 12 }}>
                Records individual node latency to the drill broadcast over LoRa mesh:
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflowY: 'auto' }}>
                {liveDrillResponses.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '30px 10px', color: '#64748b', fontSize: '0.85rem' }}>
                    {drillActive ? "Waiting for incoming LoRa drill packets..." : "Launch drill to begin latency logging."}
                  </div>
                ) : (
                  liveDrillResponses.map((resp, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: 'rgba(255, 255, 255, 0.03)',
                        padding: '10px 12px',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid rgba(255, 255, 255, 0.05)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#38bdf8', fontSize: '0.85rem' }}>
                          0x{resp.device_id.toString(16).toUpperCase()}
                        </span>
                        <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{resp.name}</span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', fontWeight: 700, color: resp.response_time_sec < 5 ? '#10b981' : '#f59e0b' }}>
                          {resp.response_time_sec}s
                        </span>
                        <span className="pill pill-safe" style={{ fontSize: '0.65rem' }}>
                          {resp.status}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {drillActive && (
                <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 8 }}>
                  <button
                    className="btn-tactical"
                    style={{ flex: 1, fontSize: '0.72rem', padding: '6px' }}
                    onClick={() => handleSimulateNodeResponse(0x00D7, "Perimeter Drone Unit")}
                  >
                    <span>+ Sim Response (Node 0x00D7)</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'TRAINING' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 24 }}>

          <div className="card-tactical">
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: '#fff', marginBottom: 14 }}>
              DISASTER PROTOCOL MODULES
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {TRAINING_MODULES.map((mod) => {
                const Icon = mod.icon;
                const isSelected = mod.id === selectedModuleId;
                return (
                  <button
                    key={mod.id}
                    type="button"
                    className="btn-tactical"
                    style={{
                      justifyContent: 'space-between',
                      padding: '12px 14px',
                      background: isSelected ? mod.bg : 'rgba(255, 255, 255, 0.02)',
                      borderColor: isSelected ? mod.color : 'var(--border-subtle)'
                    }}
                    onClick={() => {
                      setSelectedModuleId(mod.id);
                      setQuizAnswers({});
                      setQuizSubmitted(false);
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Icon size={18} style={{ color: mod.color }} />
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ fontWeight: 700, fontSize: '0.85rem', color: isSelected ? '#fff' : '#cbd5e1' }}>
                          {mod.title}
                        </div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                          {mod.code}
                        </div>
                      </div>
                    </div>
                    <ArrowRight size={14} className="text-slate-500" />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="card-tactical">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, borderBottom: '1px solid var(--border-subtle)', paddingBottom: 12 }}>
              <div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', color: '#fff', margin: 0 }}>
                  {activeModule.title} SOP
                </h3>
                <span style={{ fontSize: '0.74rem', color: activeModule.color, fontFamily: 'monospace' }}>
                  Protocol Code: {activeModule.code}
                </span>
              </div>
            </div>

            <p style={{ fontSize: '0.86rem', color: '#e2e8f0', lineHeight: 1.6, marginBottom: 16 }}>
              {activeModule.overview}
            </p>

            <div style={{ background: 'rgba(9, 13, 22, 0.7)', padding: '14px', borderRadius: 'var(--radius-md)', marginBottom: 16, border: '1px solid var(--border-subtle)' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent-cyan)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Field Operational Checklist (SOP):
              </span>
              <ul style={{ margin: '8px 0 0 0', paddingLeft: 18, fontSize: '0.82rem', color: '#cbd5e1', lineHeight: 1.7 }}>
                {activeModule.sop.map((step, idx) => (
                  <li key={idx}>{step}</li>
                ))}
              </ul>
            </div>

            <div style={{ background: 'rgba(239, 68, 68, 0.08)', borderLeft: '3px solid #ef4444', padding: '10px 14px', borderRadius: 'var(--radius-sm)', marginBottom: 20 }}>
              <span style={{ fontSize: '0.74rem', fontWeight: 800, color: '#ef4444' }}>CRITICAL SURVIVAL RULE: </span>
              <span style={{ fontSize: '0.8rem', color: '#f1f5f9' }}>{activeModule.survivalRule}</span>
            </div>

            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <HelpCircle size={16} className="text-cyan-400" />
                  <span>COMPETENCY KNOWLEDGE CHECK ({activeModule.quiz.length} Questions)</span>
                </span>

                {quizSubmitted && (
                  <span className="pill pill-safe" style={{ fontSize: '0.75rem' }}>
                    Score: {calculateScore()} / {activeModule.quiz.length}
                  </span>
                )}
              </div>

              {activeModule.quiz.map((qItem, qIdx) => (
                <div key={qIdx} style={{ marginBottom: 16, background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#f1f5f9', marginBottom: 8 }}>
                    {qIdx + 1}. {qItem.q}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {qItem.options.map((opt, optIdx) => {
                      const isChosen = quizAnswers[qIdx] === optIdx;
                      const isCorrect = qItem.correct === optIdx;
                      let btnBg = 'rgba(255,255,255,0.03)';
                      let borderColor = 'rgba(255,255,255,0.08)';

                      if (quizSubmitted) {
                        if (isCorrect) {
                          btnBg = 'rgba(16, 185, 129, 0.2)';
                          borderColor = '#10b981';
                        } else if (isChosen && !isCorrect) {
                          btnBg = 'rgba(239, 68, 68, 0.2)';
                          borderColor = '#ef4444';
                        }
                      } else if (isChosen) {
                        btnBg = 'rgba(56, 189, 248, 0.2)';
                        borderColor = '#38bdf8';
                      }

                      return (
                        <button
                          key={optIdx}
                          type="button"
                          className="btn-tactical"
                          style={{
                            justifyContent: 'flex-start',
                            padding: '6px 10px',
                            fontSize: '0.78rem',
                            background: btnBg,
                            borderColor: borderColor
                          }}
                          onClick={() => handleSelectAnswer(qIdx, optIdx)}
                        >
                          <span style={{ width: 20, fontWeight: 700, color: 'var(--text-muted)' }}>
                            {String.fromCharCode(65 + optIdx)}.
                          </span>
                          <span>{opt}</span>
                        </button>
                      );
                    })}
                  </div>

                  {quizSubmitted && (
                    <div style={{ marginTop: 8, fontSize: '0.72rem', color: '#94a3b8', fontStyle: 'italic' }}>
                      💡 {qItem.explanation}
                    </div>
                  )}
                </div>
              ))}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 12 }}>
                {!quizSubmitted ? (
                  <button
                    className="btn-tactical btn-tactical-primary"
                    style={{ fontSize: '0.78rem', padding: '6px 14px' }}
                    onClick={() => {
                      setQuizSubmitted(true);
                      playAckChime();
                    }}
                  >
                    Submit Quiz Answers
                  </button>
                ) : (
                  <button
                    className="btn-tactical"
                    style={{ fontSize: '0.78rem', padding: '6px 14px' }}
                    onClick={() => {
                      setQuizAnswers({});
                      setQuizSubmitted(false);
                    }}
                  >
                    <RotateCcw size={13} />
                    <span>Retake Quiz</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'DEVICE_GUIDE' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 24 }}>

          <div className="card-tactical">
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: '#fff', marginBottom: 16 }}>
              HANDY DEVICE PHYSICAL CONTROLS &amp; BUTTON USAGE
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: 'var(--radius-md)', padding: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="pill pill-safe">SAFE BUTTON (GREEN)</span>
                    <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>Quick Tap (1 second)</span>
                  </div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: '#10b981' }}>MSG_SAFE (0x01)</span>
                </div>
                <p style={{ margin: 0, fontSize: '0.8rem', color: '#cbd5e1', lineHeight: 1.5 }}>
                  Confirms responder or civilian is uninjured and in a secure rally area. Cancels any previously active SOS state, turns off red flashing LED, and updates dashboard to RESOLVED.
                </p>
              </div>

              <div style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: 'var(--radius-md)', padding: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="pill pill-help">HELP BUTTON (YELLOW)</span>
                    <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>Hold for 2 seconds</span>
                  </div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: '#f59e0b' }}>MSG_HELP (0x02)</span>
                </div>
                <p style={{ margin: 0, fontSize: '0.8rem', color: '#cbd5e1', lineHeight: 1.5 }}>
                  Requests non-life-threatening urgent assistance (first-aid kit replenishment, stretcher transport, equipment failure). Retries 2x at 500ms intervals over LoRa mesh until ACK is received.
                </p>
              </div>

              <div style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 'var(--radius-md)', padding: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="pill pill-sos">SOS BUTTON (RED)</span>
                    <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>Guarded Press (3 seconds)</span>
                  </div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: '#ef4444' }}>MSG_SOS (0x03)</span>
                </div>
                <p style={{ margin: 0, fontSize: '0.8rem', color: '#cbd5e1', lineHeight: 1.5 }}>
                  Life-or-death distress call. Preempts all other traffic on the LoRa frequency, triggers maximum +22 dBm power transmission, activates the hardware piezo buzzer, and pulses the high-brightness red LED.
                </p>
              </div>
            </div>
          </div>

          <div className="card-tactical">
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: '#fff', marginBottom: 14 }}>
              READING THE SSD1306 OLED SCREEN
            </h3>

            <div className="oled-chassis" style={{ marginBottom: 16 }}>
              <div className="oled-screen" style={{ minHeight: 130 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#38bdf8' }}>
                  <span>ID:0x0042 B:85%</span>
                  <span>[M]</span>
                </div>
                <div style={{ fontSize: '0.72rem', color: '#38bdf8', marginTop: 4 }}>
                  <span>GPS: VALID 8sat</span>
                </div>
                <div style={{ fontSize: '1rem', fontWeight: 900, textAlign: 'center', margin: '8px 0', color: '#fff' }}>
                  Tx: SOS! RSSI:-74
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#10b981', borderTop: '1px solid rgba(56, 189, 248, 0.3)', paddingTop: 4 }}>
                  <span>ACK: OK (Tower 01)</span>
                  <span>[====..]</span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.78rem', color: '#cbd5e1' }}>
              <div><strong>Row 0:</strong> Device ID and Battery % (Blink !LOW when &le; 20%).</div>
              <div><strong>Row 1:</strong> GPS Fix Status (<code>VALID</code> = Live GPS; <code>LAST KNOWN</code> = Cached; <code>NO GPS</code> = Indoor).</div>
              <div><strong>Row 2:</strong> Last message transmitted (SAFE / HELP / SOS / BCAST).</div>
              <div><strong>Row 3:</strong> Acknowledgment state (<code>ACK: OK</code> = confirmed by tower; <code>ACK: WAITING</code> = in-flight).</div>
              <div><strong>Corner [M]:</strong> Motion status (<code>[M]</code> = Moving, <code>[.]</code> = Static, <code>[F]</code> = Fall Detected).</div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'AUDIT_LOGS' && (
        <div className="card-tactical">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: '#fff', margin: 0 }}>
              HISTORICAL MOCK DRILL AUDIT REPORTS (SEPARATE DATA STORE)
            </h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Collection: <code>mock_drills</code>
            </span>
          </div>

          <div className="table-container" style={{ margin: 0 }}>
            <table className="tactical-table">
              <thead>
                <tr>
                  <th>Drill ID / Date</th>
                  <th>Scenario Name</th>
                  <th>Duration</th>
                  <th>Participants</th>
                  <th>Avg Response Latency</th>
                  <th>Readiness Grade</th>
                  <th>Isolation Audit</th>
                </tr>
              </thead>
              <tbody>
                {mockDrills.map((drill) => (
                  <tr key={drill.id}>
                    <td>
                      <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#38bdf8', fontSize: '0.85rem' }}>
                        {drill.id}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                        {new Date(drill.started_at * 1000).toLocaleDateString()}
                      </div>
                    </td>

                    <td>
                      <div style={{ fontWeight: 600, color: '#f1f5f9' }}>{drill.name}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{drill.notes}</div>
                    </td>

                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)' }}>{drill.duration_sec}s</span>
                    </td>

                    <td>
                      <span className="pill badge-direct">{drill.participant_count} Nodes</span>
                    </td>

                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: drill.avg_response_time_sec < 6 ? '#10b981' : '#f59e0b' }}>
                        {drill.avg_response_time_sec}s
                      </span>
                    </td>

                    <td>
                      <span className="pill pill-safe">{drill.readiness_score}</span>
                    </td>

                    <td>
                      <span className="pill" style={{ background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc', border: '1px solid rgba(168, 85, 247, 0.35)', fontSize: '0.68rem' }}>
                        ISOLATED STORED
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
