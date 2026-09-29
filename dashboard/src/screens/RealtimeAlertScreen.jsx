import React, { useState, useEffect, useRef } from 'react';
import { useEmergency } from '../context/EmergencyContext';
import TacticalMap from '../components/TacticalMap';
import { playSosSiren, playHelpChime, playAckChime } from '../utils/audioAlerts';
import {
  AlertTriangle,
  Radio,
  Battery,
  MapPin,
  Clock,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  Volume2,
  VolumeX,
  Search,
  Filter,
  Eye,
  Crosshair,
  RefreshCw,
  Navigation,
  Compass,
  ArrowRight,
  Zap,
  ExternalLink,
  ChevronDown,
  Layers
} from 'lucide-react';

export default function RealtimeAlertScreen() {
  const {
    events,
    devices,
    currentTime,
    updateEventStatus,
    triggerHandyDeviceSOS,
    triggerHandyDeviceHELP
  } = useEmergency();

  const [filterType, setFilterType] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterTimeRange, setFilterTimeRange] = useState('ALL');
  const [searchText, setSearchText] = useState('');

  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const prevEventCountRef = useRef(events.length);

  const [selectedEvent, setSelectedEvent] = useState(null);
  const [showMapModal, setShowMapModal] = useState(false);

  const [toastMessage, setToastMessage] = useState(null);

  useEffect(() => {
    if (events.length > prevEventCountRef.current) {
      const newest = events[0];
      if (newest && !isAudioMuted) {
        if (newest.type === 'SOS' || newest.priority === 1) {
          playSosSiren();
        } else if (newest.type === 'HELP' || newest.priority === 2) {
          playHelpChime();
        }
      }
    }
    prevEventCountRef.current = events.length;
  }, [events, isAudioMuted]);

  const formatRelativeTime = (epochSeconds) => {
    if (!epochSeconds) return 'Just now';
    const elapsed = Math.max(0, currentTime - epochSeconds);
    if (elapsed < 5) return 'Just now';
    if (elapsed < 60) return `${elapsed}s ago`;
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    if (mins < 60) return `${mins}m ${secs}s ago`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ${mins % 60}m ago`;
  };

  const handleStatusChange = async (eventId, newStatus, eventType = 'Alert') => {
    if (!isAudioMuted) {
      playAckChime();
    }
    await updateEventStatus(eventId, newStatus);
    setToastMessage(`✅ Incident ${eventId} status changed to ${newStatus} and saved to persistent storage.`);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const filteredEvents = events.filter((ev) => {

    const evType = (ev.type || '').toUpperCase();
    let matchesType = true;
    if (filterType !== 'ALL') {
      if (filterType === 'SOS') matchesType = evType === 'SOS';
      else if (filterType === 'HELP') matchesType = evType === 'HELP';
      else if (filterType === 'SAFE') matchesType = evType === 'SAFE';
      else if (filterType === 'sensor') matchesType = evType === 'SENSOR';
      else if (filterType === 'external') matchesType = evType === 'EXTERNAL';
    }

    let matchesStatus = true;
    if (filterStatus === 'UNRESOLVED') {
      matchesStatus = ev.status !== 'RESOLVED';
    } else if (filterStatus !== 'ALL') {
      matchesStatus = (ev.status || 'NEW') === filterStatus;
    }

    let matchesTime = true;
    const evTime = ev.event_time || Math.floor(Date.now() / 1000);
    const elapsedSecs = Math.max(0, currentTime - evTime);
    if (filterTimeRange === '15M') matchesTime = elapsedSecs <= 900;
    else if (filterTimeRange === '1H') matchesTime = elapsedSecs <= 3600;
    else if (filterTimeRange === '6H') matchesTime = elapsedSecs <= 21600;
    else if (filterTimeRange === '24H') matchesTime = elapsedSecs <= 86400;

    let matchesSearch = true;
    if (searchText.trim() !== '') {
      const q = searchText.toLowerCase();
      const hexId = '0x' + (ev.device_id || 0).toString(16).toLowerCase();
      const decId = (ev.device_id || 0).toString();
      const name = (ev.device_name || '').toLowerCase();
      const desc = (ev.description || '').toLowerCase();
      const id = (ev.id || '').toLowerCase();
      matchesSearch = hexId.includes(q) || decId.includes(q) || name.includes(q) || desc.includes(q) || id.includes(q);
    }

    return matchesType && matchesStatus && matchesTime && matchesSearch;
  });

  const sortedEvents = [...filteredEvents].sort((a, b) => {
    const aIsActiveDistress = (a.type === 'SOS' || a.type === 'HELP') && a.status !== 'RESOLVED';
    const bIsActiveDistress = (b.type === 'SOS' || b.type === 'HELP') && b.status !== 'RESOLVED';

    if (aIsActiveDistress && !bIsActiveDistress) return -1;
    if (!aIsActiveDistress && bIsActiveDistress) return 1;

    const pA = a.priority || 99;
    const pB = b.priority || 99;
    if (pA !== pB) return pA - pB;

    return (b.event_time || 0) - (a.event_time || 0);
  });

  const pinnedDistressEvents = events.filter(
    (e) => (e.type === 'SOS' || e.type === 'HELP') && e.status !== 'RESOLVED'
  );

  const handleSimulateSOS = async () => {
    const newEv = await triggerHandyDeviceSOS({
      device_id: 0x00E4,
      name: "Handy Device 0x00E4 (Tactical Team Bravo)",
      description: "Manual SOS Button triggered on Handy Device — Flash flood surge in Sector 4 gorge",
      lat: 28.6145,
      lon: 77.2095,
      battery: 64,
      rssi: -74
    });
    if (!isAudioMuted) {
      playSosSiren();
    }
    setSelectedEvent(newEv);
    setToastMessage(`🚨 New live SOS received from Handy Device 0x00E4! Pinned to top of queue.`);
  };

  const handleSimulateHELP = async () => {
    const newEv = await triggerHandyDeviceHELP();
    if (!isAudioMuted) {
      playHelpChime();
    }
    setSelectedEvent(newEv);
    setToastMessage(`⚠️ Urgent HELP received from Handy Device 0x00B2! Pinned to top of queue.`);
  };

  const handleOpenMap = (ev) => {
    setSelectedEvent(ev);
    setShowMapModal(true);
  };

  return (
    <div className="screen-container">

      <div className="view-header">
        <div className="view-title-group">
          <h2>
            <ShieldAlert className="text-red-500" size={28} />
            <span>REALTIME INCIDENT ALERTS & DISTRESS FEED</span>
          </h2>
          <p>
            Strict priority queue: SOS &gt; HELP &gt; SENSOR &gt; EXTERNAL &gt; SAFE • Persistent lifecycle management
          </p>
        </div>

        <div className="view-actions">

          <button
            className="btn-tactical"
            style={{
              padding: '6px 12px',
              fontSize: '0.78rem',
              background: isAudioMuted ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
              borderColor: isAudioMuted ? 'rgba(239, 68, 68, 0.4)' : 'rgba(16, 185, 129, 0.4)',
              color: isAudioMuted ? '#f87171' : '#34d399'
            }}
            onClick={() => setIsAudioMuted(!isAudioMuted)}
            title="Toggle audible siren for incoming distress alerts"
          >
            {isAudioMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
            <span>{isAudioMuted ? 'AUDIO MUTED' : 'AUDIO ARMED'}</span>
          </button>

          <button
            className="btn-tactical"
            style={{ padding: '6px 12px', fontSize: '0.78rem' }}
            onClick={() => playSosSiren()}
            title="Test tactical alarm sound"
          >
            <span>🔊 Test Siren</span>
          </button>

          <span className="pill pill-sos" style={{ fontSize: '0.8rem', padding: '5px 12px' }}>
            🚨 {events.filter((e) => e.type === 'SOS' && e.status !== 'RESOLVED').length} ACTIVE SOS
          </span>
          <span className="pill pill-help" style={{ fontSize: '0.8rem', padding: '5px 12px' }}>
            ⚠️ {events.filter((e) => e.type === 'HELP' && e.status !== 'RESOLVED').length} ACTIVE HELP
          </span>
        </div>
      </div>

      {toastMessage && (
        <div
          style={{
            background: 'rgba(2, 132, 199, 0.2)',
            border: '1px solid #38bdf8',
            color: '#e0f2fe',
            padding: '10px 16px',
            borderRadius: 'var(--radius-md)',
            marginBottom: 20,
            fontSize: '0.86rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 0 15px rgba(56, 189, 248, 0.25)',
            animation: 'fadeIn 0.3s'
          }}
        >
          <span>{toastMessage}</span>
          <button
            onClick={() => setToastMessage(null)}
            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '0.9rem' }}
          >
            ✕
          </button>
        </div>
      )}

      {pinnedDistressEvents.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#ef4444', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              ⚡ PINNED CRITICAL & URGENT DISTRESS INCIDENTS ({pinnedDistressEvents.length})
            </span>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Auto-pinned to top until marked RESOLVED
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 14 }}>
            {pinnedDistressEvents.map((pe) => {
              const isSos = pe.type === 'SOS';
              const hexId = '0x' + (pe.device_id || 0).toString(16).toUpperCase().padStart(4, '0');
              const isLocUnavail = !pe.lat || !pe.lon || pe.location_state === 'UNAVAILABLE' || (pe.lat === 0 && pe.lon === 0);

              return (
                <div
                  key={`pinned_${pe.id}`}
                  style={{
                    background: isSos ? 'rgba(239, 68, 68, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                    border: isSos ? '2px solid #ef4444' : '2px solid #f59e0b',
                    borderRadius: 'var(--radius-lg)',
                    padding: '16px 18px',
                    boxShadow: isSos ? '0 0 20px rgba(239, 68, 68, 0.3)' : '0 0 16px rgba(245, 158, 11, 0.25)',
                    position: 'relative'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className={`pill ${isSos ? 'pill-sos' : 'pill-help'}`} style={{ fontSize: '0.8rem', fontWeight: 800 }}>
                        {pe.type === 'SOS' ? '🚨 SOS DISTRESS' : '⚠️ HELP URGENT'} (P{pe.priority || 1})
                      </span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.92rem', color: '#fff' }}>
                        Node {hexId}
                      </span>
                    </div>

                    <span className="pill pill-online" style={{ fontSize: '0.72rem' }}>
                      {pe.status || 'NEW'}
                    </span>
                  </div>

                  <p style={{ fontSize: '0.85rem', color: '#f1f5f9', fontWeight: 500, margin: '0 0 10px 0' }}>
                    {pe.description || 'Distress signal received from field personnel via LoRa transmission.'}
                  </p>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 12 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Clock size={12} />
                      <span>{formatRelativeTime(pe.event_time)}</span>
                    </span>

                    {isLocUnavail ? (
                      <span style={{ color: '#f87171', fontWeight: 600 }}>
                        ⚠️ Location unavailable (GPS acquiring/indoor)
                      </span>
                    ) : (
                      <span style={{ color: '#38bdf8', fontFamily: 'monospace' }}>
                        📍 {pe.lat.toFixed(4)}°, {pe.lon.toFixed(4)}°
                      </span>
                    )}

                    <span>Batt: {pe.battery}%</span>
                    <span>RSSI: {pe.rssi} dBm</span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 10 }}>
                    <button
                      className="btn-tactical"
                      style={{ padding: '4px 10px', fontSize: '0.74rem', background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', borderColor: 'rgba(56, 189, 248, 0.4)' }}
                      onClick={() => handleOpenMap(pe)}
                    >
                      <MapPin size={12} />
                      <span>View Map</span>
                    </button>

                    <div style={{ display: 'flex', gap: 6 }}>
                      {pe.status !== 'ACKNOWLEDGED' && pe.status !== 'IN PROGRESS' && (
                        <button
                          className="btn-tactical"
                          style={{ padding: '4px 8px', fontSize: '0.72rem' }}
                          onClick={() => handleStatusChange(pe.id, 'ACKNOWLEDGED', pe.type)}
                        >
                          ACK
                        </button>
                      )}
                      {pe.status !== 'IN PROGRESS' && (
                        <button
                          className="btn-tactical btn-tactical-primary"
                          style={{ padding: '4px 8px', fontSize: '0.72rem' }}
                          onClick={() => handleStatusChange(pe.id, 'IN PROGRESS', pe.type)}
                        >
                          IN PROGRESS
                        </button>
                      )}
                      <button
                        className="btn-tactical"
                        style={{ padding: '4px 8px', fontSize: '0.72rem', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', borderColor: 'rgba(16, 185, 129, 0.4)' }}
                        onClick={() => handleStatusChange(pe.id, 'RESOLVED', pe.type)}
                      >
                        RESOLVE
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div
        className="card-tactical"
        style={{
          padding: '14px 20px',
          marginBottom: 20,
          background: 'rgba(14, 20, 36, 0.85)',
          borderLeft: '4px solid #ef4444',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 14
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Radio className="text-red-400" size={18} />
          <div>
            <span style={{ fontSize: '0.84rem', fontWeight: 700, color: '#fff' }}>
              LORA PACKET INGESTION &amp; LIFECYCLE SIMULATOR
            </span>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
              Inject mock Handy Device packets to test real-time audio siren, priority queueing, and Firestore status updates.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className="btn-tactical btn-tactical-danger"
            style={{ fontSize: '0.78rem', padding: '6px 14px' }}
            onClick={handleSimulateSOS}
            title="Simulate incoming SOS packet from Handy Device 0x00E4"
          >
            <span>🚨 Send Handy Device SOS</span>
          </button>

          <button
            className="btn-tactical"
            style={{
              fontSize: '0.78rem',
              padding: '6px 14px',
              background: 'rgba(245, 158, 11, 0.15)',
              borderColor: 'rgba(245, 158, 11, 0.4)',
              color: '#f59e0b'
            }}
            onClick={handleSimulateHELP}
            title="Simulate incoming HELP packet from Handy Device 0x00B2"
          >
            <span>⚠️ Send Handy Device HELP</span>
          </button>
        </div>
      </div>

      <div
        className="card-tactical"
        style={{
          padding: '16px 20px',
          marginBottom: 20,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 16,
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 240 }}>
          <Search size={16} className="text-slate-400" />
          <input
            type="text"
            className="form-input"
            placeholder="Search by Node ID (e.g. 0x0042 / 66) or incident keywords..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ padding: '6px 12px', fontSize: '0.85rem' }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>TYPE:</span>
            <select
              className="form-input"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              style={{ padding: '5px 10px', fontSize: '0.78rem', width: 'auto' }}
            >
              <option value="ALL">All Types</option>
              <option value="SOS">SOS Only (Critical)</option>
              <option value="HELP">HELP Only (Urgent)</option>
              <option value="sensor">Sensor Alerts</option>
              <option value="external">External Feeds</option>
              <option value="SAFE">SAFE Check-ins</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>STATUS:</span>
            <select
              className="form-input"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              style={{ padding: '5px 10px', fontSize: '0.78rem', width: 'auto' }}
            >
              <option value="ALL">All Statuses</option>
              <option value="UNRESOLVED">Active Only (Unresolved)</option>
              <option value="NEW">NEW</option>
              <option value="ACKNOWLEDGED">ACKNOWLEDGED</option>
              <option value="IN PROGRESS">IN PROGRESS</option>
              <option value="RESOLVED">RESOLVED</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>TIME:</span>
            <select
              className="form-input"
              value={filterTimeRange}
              onChange={(e) => setFilterTimeRange(e.target.value)}
              style={{ padding: '5px 10px', fontSize: '0.78rem', width: 'auto' }}
            >
              <option value="ALL">All Recorded Time</option>
              <option value="15M">Last 15 Minutes</option>
              <option value="1H">Last 1 Hour</option>
              <option value="6H">Last 6 Hours</option>
              <option value="24H">Today (Last 24h)</option>
            </select>
          </div>
        </div>
      </div>

      {selectedEvent && showMapModal && (
        <div
          className="card-tactical"
          style={{
            marginBottom: 24,
            padding: 0,
            overflow: 'hidden',
            border: '2px solid #38bdf8',
            boxShadow: '0 0 25px rgba(56, 189, 248, 0.25)',
            position: 'relative'
          }}
        >

          <div
            style={{
              padding: '12px 18px',
              background: 'rgba(14, 20, 36, 0.95)',
              borderBottom: '1px solid rgba(56, 189, 248, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <MapPin className="text-cyan-400" size={18} />
              <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#fff' }}>
                TACTICAL GEOLOCATION: INCIDENT {selectedEvent.id} (Node 0x{(selectedEvent.device_id || 0).toString(16).toUpperCase()})
              </span>
              <span className={`pill ${selectedEvent.type === 'SOS' ? 'pill-sos' : selectedEvent.type === 'HELP' ? 'pill-help' : 'pill-safe'}`}>
                {selectedEvent.type}
              </span>
            </div>

            <button
              className="btn-tactical"
              style={{ padding: '4px 10px', fontSize: '0.74rem' }}
              onClick={() => setShowMapModal(false)}
            >
              ✕ Close Map View
            </button>
          </div>

          {(!selectedEvent.lat || !selectedEvent.lon || selectedEvent.location_state === 'UNAVAILABLE' || (selectedEvent.lat === 0 && selectedEvent.lon === 0)) ? (
            <div
              style={{
                padding: '30px',
                textAlign: 'center',
                background: 'rgba(9, 13, 22, 0.95)',
                color: '#f87171'
              }}
            >
              <AlertTriangle size={32} style={{ margin: '0 auto 10px auto', display: 'block' }} />
              <h4 style={{ margin: '0 0 6px 0', fontSize: '1.1rem', color: '#f87171' }}>
                LOCATION UNAVAILABLE FOR THIS INCIDENT
              </h4>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)', maxWidth: 500, marginInline: 'auto' }}>
                Handy Device transmitted packet without a GPS fix (subsurface basement, dense indoor shelter, or satellite lock acquiring). Centering to nearest gateway tower reception cone.
              </p>
            </div>
          ) : (
            <div style={{ height: 380, width: '100%', position: 'relative' }}>
              <TacticalMap
                events={[selectedEvent, ...events]}
                devices={devices}
                focusEvent={selectedEvent}
              />
            </div>
          )}
        </div>
      )}

      <div className="table-container">
        <table className="tactical-table">
          <thead>
            <tr>
              <th>Priority</th>
              <th>Type</th>
              <th>Time</th>
              <th>Source Device / Origin</th>
              <th>Location &amp; Fix State</th>
              <th>Battery / Signal</th>
              <th>Incident Status</th>
              <th style={{ textAlign: 'right' }}>Operator Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedEvents.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', color: '#64748b', padding: '36px' }}>
                  No incident events match the applied filter criteria.
                </td>
              </tr>
            ) : (
              sortedEvents.map((ev) => {
                const isSos = ev.type === 'SOS';
                const isHelp = ev.type === 'HELP';
                const isSafe = ev.type === 'SAFE';
                const isSensor = (ev.type || '').toLowerCase() === 'sensor';
                const isExternal = (ev.type || '').toLowerCase() === 'external';

                const hexId = '0x' + (ev.device_id || 0).toString(16).toUpperCase().padStart(4, '0');
                const isLocUnavail = !ev.lat || !ev.lon || ev.location_state === 'UNAVAILABLE' || (ev.lat === 0 && ev.lon === 0);
                const isLastKnown = ev.location_state === 'LAST_KNOWN';

                const isPinned = (isSos || isHelp) && ev.status !== 'RESOLVED';

                return (
                  <tr
                    key={ev.id}
                    style={{
                      background: isPinned
                        ? isSos
                          ? 'rgba(239, 68, 68, 0.08)'
                          : 'rgba(245, 158, 11, 0.08)'
                        : undefined,
                      borderLeft: isPinned ? (isSos ? '4px solid #ef4444' : '4px solid #f59e0b') : undefined
                    }}
                  >

                    <td>
                      <span
                        style={{
                          fontWeight: 700,
                          fontSize: '0.8rem',
                          fontFamily: 'var(--font-mono)',
                          color: ev.priority === 1 ? '#ef4444' : ev.priority === 2 ? '#f59e0b' : '#38bdf8'
                        }}
                      >
                        P{ev.priority || (isSos ? 1 : isHelp ? 2 : 3)}
                      </span>
                    </td>

                    <td>
                      <span
                        className={`pill ${
                          isSos ? 'pill-sos' : isHelp ? 'pill-help' : isSafe ? 'pill-safe' : 'badge-direct'
                        }`}
                        style={{ fontSize: '0.75rem', fontWeight: 800 }}
                      >
                        {isSos ? '🚨 SOS' : isHelp ? '⚠️ HELP' : isSafe ? '🛡️ SAFE' : isSensor ? '🌊 SENSOR' : '🌐 EXTERNAL'}
                      </span>
                    </td>

                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Clock size={12} className="text-slate-500" />
                        <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                          {formatRelativeTime(ev.event_time)}
                        </span>
                      </div>
                      <span style={{ fontSize: '0.7rem', color: '#64748b', fontFamily: 'monospace' }}>
                        {ev.event_time ? new Date(ev.event_time * 1000).toLocaleTimeString() : 'N/A'}
                      </span>
                    </td>

                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#38bdf8', fontSize: '0.88rem' }}>
                            {hexId}
                          </span>
                          <span style={{ fontSize: '0.72rem', color: '#64748b' }}>#{ev.device_id}</span>
                        </div>
                        <span style={{ fontSize: '0.78rem', color: '#cbd5e1', fontWeight: 500 }}>
                          {ev.device_name || `Handy Device ${hexId}`}
                        </span>
                        {ev.description && (
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2, maxWidth: 260 }}>
                            {ev.description}
                          </span>
                        )}
                      </div>
                    </td>

                    <td>
                      {isLocUnavail ? (
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span className="badge-loc-unavail pill" style={{ width: 'fit-content' }}>
                            <AlertTriangle size={11} />
                            <span>Location unavailable</span>
                          </span>
                          <span style={{ fontSize: '0.68rem', color: '#f87171', marginTop: 3 }}>
                            No GPS fix (Indoor/Basement)
                          </span>
                        </div>
                      ) : isLastKnown ? (
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span className="badge-loc-lastknown pill" style={{ width: 'fit-content' }}>
                            <Clock size={11} />
                            <span>LAST KNOWN</span>
                          </span>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: '#f59e0b', marginTop: 3 }}>
                            {ev.lat.toFixed(4)}°, {ev.lon.toFixed(4)}°
                          </span>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span className="badge-loc-live pill" style={{ width: 'fit-content' }}>
                            <Navigation size={11} />
                            <span>LIVE FIX</span>
                          </span>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: '#10b981', marginTop: 3 }}>
                            {ev.lat?.toFixed(4)}°, {ev.lon?.toFixed(4)}°
                          </span>
                        </div>
                      )}
                    </td>

                    <td>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                        <span style={{ fontWeight: 600, color: (ev.battery || 0) <= 20 ? '#ef4444' : '#10b981' }}>
                          {ev.battery ?? 100}% Batt
                        </span>
                        <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontFamily: 'monospace' }}>
                          {ev.rssi ? `${ev.rssi} dBm` : 'Direct link'}
                        </div>
                      </div>
                    </td>

                    <td>
                      <div>
                        <span
                          className={`pill ${
                            ev.status === 'RESOLVED'
                              ? 'pill-safe'
                              : ev.status === 'IN PROGRESS'
                              ? 'pill-help'
                              : ev.status === 'ACKNOWLEDGED'
                              ? 'badge-direct'
                              : 'pill-online'
                          }`}
                          style={{ fontSize: '0.72rem' }}
                        >
                          {ev.status || 'NEW'}
                        </span>
                        {ev.updated_at && (
                          <div style={{ fontSize: '0.65rem', color: '#64748b', marginTop: 3 }}>
                            Upd: {formatRelativeTime(ev.updated_at)}
                          </div>
                        )}
                      </div>
                    </td>

                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>

                        <button
                          className="btn-tactical"
                          title="Open tactical map centered on incident coordinates"
                          style={{
                            padding: '4px 8px',
                            fontSize: '0.72rem',
                            background: 'rgba(56, 189, 248, 0.12)',
                            color: '#38bdf8',
                            borderColor: 'rgba(56, 189, 248, 0.35)'
                          }}
                          onClick={() => handleOpenMap(ev)}
                        >
                          <MapPin size={12} />
                          <span>Map</span>
                        </button>

                        {ev.status === 'NEW' && (
                          <button
                            className="btn-tactical"
                            style={{ padding: '4px 8px', fontSize: '0.72rem', background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', borderColor: 'rgba(245, 158, 11, 0.35)' }}
                            onClick={() => handleStatusChange(ev.id, 'ACKNOWLEDGED', ev.type)}
                          >
                            ACK
                          </button>
                        )}

                        {ev.status !== 'IN PROGRESS' && ev.status !== 'RESOLVED' && (
                          <button
                            className="btn-tactical btn-tactical-primary"
                            style={{ padding: '4px 8px', fontSize: '0.72rem' }}
                            onClick={() => handleStatusChange(ev.id, 'IN PROGRESS', ev.type)}
                          >
                            DISPATCH
                          </button>
                        )}

                        {ev.status !== 'RESOLVED' && (
                          <button
                            className="btn-tactical"
                            style={{ padding: '4px 8px', fontSize: '0.72rem', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', borderColor: 'rgba(16, 185, 129, 0.35)' }}
                            onClick={() => handleStatusChange(ev.id, 'RESOLVED', ev.type)}
                          >
                            RESOLVE
                          </button>
                        )}

                        {ev.status === 'RESOLVED' && (
                          <button
                            className="btn-tactical"
                            style={{ padding: '4px 8px', fontSize: '0.72rem', opacity: 0.6 }}
                            onClick={() => handleStatusChange(ev.id, 'NEW', ev.type)}
                            title="Re-open this incident"
                          >
                            Re-open
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
