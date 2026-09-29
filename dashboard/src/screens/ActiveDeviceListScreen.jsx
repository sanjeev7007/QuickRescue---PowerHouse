import React, { useState } from 'react';
import { useEmergency } from '../context/EmergencyContext';
import TacticalMap from '../components/TacticalMap';
import {
  RadioTower,
  Wifi,
  Battery,
  Navigation,
  Shield,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Search,
  Activity,
  Signal,
  Cpu,
  Zap,
  RefreshCw,
  Compass,
  ArrowRight,
  Filter
} from 'lucide-react';

export default function ActiveDeviceListScreen() {
  const {
    devices,
    events,
    currentTime,
    HEARTBEAT_ACTIVE_TIMEOUT_SEC,
    sendDeviceHeartbeat,
    simulateDeviceTimeout
  } = useEmergency();

  const [filterText, setFilterText] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [simFeedback, setSimFeedback] = useState(null);

  const formatLastSeen = (epoch) => {
    if (!epoch) return 'Never';
    const elapsed = Math.max(0, currentTime - epoch);
    if (elapsed < 3) return 'Just now';
    if (elapsed < 60) return `${elapsed}s ago`;
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    if (mins < 60) return `${mins}m ${secs}s ago`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ${mins % 60}m ago`;
  };

  const getSignalMeta = (rssi) => {
    if (!rssi) return { label: 'Unknown', color: '#64748b', bars: 0 };
    if (rssi >= -75) return { label: 'Excellent', color: '#10b981', bars: 4 };
    if (rssi >= -85) return { label: 'Good', color: '#38bdf8', bars: 3 };
    if (rssi >= -95) return { label: 'Fair', color: '#f59e0b', bars: 2 };
    return { label: 'Poor / Edge', color: '#ef4444', bars: 1 };
  };

  const filteredDevices = devices.filter((d) => {
    const hexId = '0x' + d.device_id.toString(16).toLowerCase();
    const decId = d.device_id.toString();
    const nameMatch = (d.name || '').toLowerCase().includes(filterText.toLowerCase());
    const idMatch = hexId.includes(filterText.toLowerCase()) || decId.includes(filterText);
    const matchesSearch = nameMatch || idMatch;

    const matchesRole =
      roleFilter === 'ALL' ||
      (roleFilter === 'MASTER' && d.is_master_jacket) ||
      (roleFilter === 'FIELD' && !d.is_master_jacket);

    const matchesStatus =
      statusFilter === 'ALL' ||
      (statusFilter === 'ACTIVE' && d.is_active) ||
      (statusFilter === 'INACTIVE' && !d.is_active);

    return matchesSearch && matchesRole && matchesStatus;
  });

  const totalCount = devices.length;
  const activeCount = devices.filter((d) => d.is_active).length;
  const inactiveCount = totalCount - activeCount;
  const masterJacketCount = devices.filter((d) => d.is_master_jacket).length;
  const directNodes = devices.filter((d) => d.hop_count === 1);
  const relayedNodes = devices.filter((d) => d.hop_count > 1);
  const unavailLocationCount = devices.filter(
    (d) => !d.lat || !d.lon || d.gps_status === 'UNAVAILABLE' || (d.lat === 0 && d.lon === 0)
  ).length;

  const avgDirectRssi = directNodes.length
    ? Math.round(directNodes.reduce((acc, d) => acc + (d.last_rssi || -90), 0) / directNodes.length)
    : -80;

  const avgRelayRssi = relayedNodes.length
    ? Math.round(relayedNodes.reduce((acc, d) => acc + (d.last_rssi || -95), 0) / relayedNodes.length)
    : -90;

  const handlePing = (deviceId, name) => {
    sendDeviceHeartbeat(deviceId);
    setSimFeedback(`✅ Heartbeat received from ${name || 'Node'} (0x${deviceId.toString(16).toUpperCase()}) — Node set to ACTIVE.`);
    setTimeout(() => setSimFeedback(null), 4000);
  };

  const handleForceTimeout = (deviceId, name) => {
    simulateDeviceTimeout(deviceId);
    setSimFeedback(`⏱️ Simulated 3 missed heartbeats (>180s elapsed) for 0x${deviceId.toString(16).toUpperCase()} — Node automatically turned INACTIVE.`);
    setTimeout(() => setSimFeedback(null), 5000);
  };

  return (
    <div className="screen-container">

      <div className="view-header">
        <div className="view-title-group">
          <h2>
            <Cpu className="text-cyan-400" size={28} />
            <span>ACTIVE DEVICE & SQUAD FLEET LIST</span>
          </h2>
          <p>
            Real-time LoRa mesh node registry, Master Jacket squad hubs, and responder vitals • Auto-inactivity after 180s without Heartbeat
          </p>
        </div>

        <div className="view-actions">
          <span className="pill pill-online" style={{ fontSize: '0.8rem', padding: '4px 12px' }}>
            ● {activeCount} / {totalCount} ACTIVE NODES
          </span>
          <span className="pill" style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
            ★ {masterJacketCount} MASTER JACKETS
          </span>
        </div>
      </div>

      {simFeedback && (
        <div
          style={{
            background: 'rgba(2, 132, 199, 0.18)',
            border: '1px solid #38bdf8',
            color: '#e0f2fe',
            padding: '10px 16px',
            borderRadius: 'var(--radius-md)',
            marginBottom: 20,
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 0 15px rgba(56, 189, 248, 0.25)',
            animation: 'fadeIn 0.3s'
          }}
        >
          <span>{simFeedback}</span>
          <button
            onClick={() => setSimFeedback(null)}
            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '0.9rem' }}
          >
            ✕
          </button>
        </div>
      )}

      <div className="grid-metrics" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', marginBottom: 20 }}>

        <div className="card-tactical">
          <div className="metric-header">
            <span className="metric-label">Registered Nodes</span>
            <div className="metric-icon-wrap" style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8' }}>
              <RadioTower size={18} />
            </div>
          </div>
          <div className="metric-val">{totalCount}</div>
          <div className="metric-sub">{masterJacketCount} Master Jackets • {totalCount - masterJacketCount} Field Nodes</div>
        </div>

        <div className="card-tactical">
          <div className="metric-header">
            <span className="metric-label">Active / Idle State</span>
            <div className="metric-icon-wrap" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981' }}>
              <Activity size={18} />
            </div>
          </div>
          <div className="metric-val" style={{ color: activeCount > 0 ? '#10b981' : '#f59e0b' }}>
            {activeCount} <span style={{ fontSize: '1rem', color: '#94a3b8' }}>/ {totalCount}</span>
          </div>
          <div className="metric-sub" style={{ color: inactiveCount > 0 ? '#f59e0b' : '#10b981' }}>
            {inactiveCount > 0 ? `⚠️ ${inactiveCount} Inactive (>180s missed)` : 'All nodes transmitting normally'}
          </div>
        </div>

        <div className="card-tactical">
          <div className="metric-header">
            <span className="metric-label">Direct Gateway Links</span>
            <div className="metric-icon-wrap" style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8' }}>
              <Wifi size={18} />
            </div>
          </div>
          <div className="metric-val" style={{ color: '#38bdf8' }}>
            {directNodes.length} <span style={{ fontSize: '0.9rem', color: '#94a3b8' }}>nodes</span>
          </div>
          <div className="metric-sub">1 Hop to Tower • Avg RSSI: {avgDirectRssi} dBm</div>
        </div>

        <div className="card-tactical">
          <div className="metric-header">
            <span className="metric-label">Relayed Mesh Links</span>
            <div className="metric-icon-wrap" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b' }}>
              <Zap size={18} />
            </div>
          </div>
          <div className="metric-val" style={{ color: '#f59e0b' }}>
            {relayedNodes.length} <span style={{ fontSize: '0.9rem', color: '#94a3b8' }}>nodes</span>
          </div>
          <div className="metric-sub">2+ Hops (via Master Jacket) • Avg RSSI: {avgRelayRssi} dBm</div>
        </div>

        <div className="card-tactical">
          <div className="metric-header">
            <span className="metric-label">GPS Fix Condition</span>
            <div className="metric-icon-wrap" style={{ background: unavailLocationCount > 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)', color: unavailLocationCount > 0 ? '#f87171' : '#10b981' }}>
              <Compass size={18} />
            </div>
          </div>
          <div className="metric-val" style={{ color: unavailLocationCount > 0 ? '#f87171' : '#10b981' }}>
            {totalCount - unavailLocationCount} <span style={{ fontSize: '0.9rem', color: '#94a3b8' }}>/ {totalCount}</span>
          </div>
          <div className="metric-sub" style={{ color: unavailLocationCount > 0 ? '#f87171' : '#94a3b8' }}>
            {unavailLocationCount > 0 ? `⚠️ ${unavailLocationCount} Location Unavailable` : '100% Geospatial Tracking'}
          </div>
        </div>
      </div>

      <div className="card-tactical" style={{ padding: '20px', marginBottom: 24, borderLeft: '4px solid #38bdf8' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Activity className="text-cyan-400" size={20} />
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fff', margin: 0 }}>
              NETWORK TOPOLOGY & HEALTH VIEW
            </h3>
          </div>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            Dynamic LoRa mesh routing breakdown: Direct 1-hop vs Multi-hop relays
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 18 }}>

          <div
            style={{
              background: 'rgba(9, 13, 22, 0.65)',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              borderRadius: 'var(--radius-md)',
              padding: '16px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="badge-direct pill">DIRECT LINKS (1 HOP)</span>
                <span style={{ fontSize: '0.8rem', color: '#38bdf8', fontWeight: 700 }}>
                  {directNodes.length} Nodes
                </span>
              </div>
              <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Path: Node ➔ Tower</span>
            </div>

            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 14 }}>
              Nodes reaching the central gateway directly over 866 MHz LoRa within the 4km direct radio horizon.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {directNodes.map((dn) => {
                const hexId = '0x' + dn.device_id.toString(16).toUpperCase().padStart(4, '0');
                const sig = getSignalMeta(dn.last_rssi);
                return (
                  <div
                    key={dn.device_id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'rgba(255, 255, 255, 0.03)',
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid rgba(255, 255, 255, 0.05)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#38bdf8', fontSize: '0.85rem' }}>
                        {hexId}
                      </span>
                      <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>{dn.name}</span>
                      {dn.is_master_jacket && (
                        <span style={{ fontSize: '0.65rem', background: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8', padding: '1px 5px', borderRadius: 3 }}>
                          LEADER
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: '0.75rem', color: sig.color, fontWeight: 600 }}>
                        {dn.last_rssi} dBm
                      </span>
                      <span className={`pill ${dn.is_active ? 'pill-online' : 'pill-offline'}`} style={{ fontSize: '0.68rem', padding: '2px 6px' }}>
                        {dn.is_active ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div
            style={{
              background: 'rgba(9, 13, 22, 0.65)',
              border: '1px solid rgba(245, 158, 11, 0.25)',
              borderRadius: 'var(--radius-md)',
              padding: '16px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="badge-relayed pill">RELAYED MESH LINKS (2+ HOPS)</span>
                <span style={{ fontSize: '0.8rem', color: '#f59e0b', fontWeight: 700 }}>
                  {relayedNodes.length} Nodes
                </span>
              </div>
              <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Path: Node ➔ Relay/MJ ➔ Tower</span>
            </div>

            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 14 }}>
              Nodes beyond direct gateway LOS routed dynamically through Master Jacket or intermediate relay hops.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {relayedNodes.map((rn) => {
                const hexId = '0x' + rn.device_id.toString(16).toUpperCase().padStart(4, '0');
                const sig = getSignalMeta(rn.last_rssi);
                return (
                  <div
                    key={rn.device_id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'rgba(255, 255, 255, 0.03)',
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid rgba(255, 255, 255, 0.05)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#f59e0b', fontSize: '0.85rem' }}>
                        {hexId}
                      </span>
                      <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>{rn.name}</span>
                      <span style={{ fontSize: '0.68rem', background: 'rgba(245, 158, 11, 0.2)', color: '#f59e0b', padding: '1px 6px', borderRadius: 3 }}>
                        {rn.hop_count} Hops
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: '0.75rem', color: sig.color, fontWeight: 600 }}>
                        {rn.last_rssi} dBm
                      </span>
                      <span className={`pill ${rn.is_active ? 'pill-online' : 'pill-offline'}`} style={{ fontSize: '0.68rem', padding: '2px 6px' }}>
                        {rn.is_active ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="card-tactical" style={{ padding: 0, overflow: 'hidden', height: 440, marginBottom: 24, position: 'relative' }}>
        <TacticalMap devices={devices} events={events} />
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

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 260 }}>
          <Search size={16} className="text-slate-400" />
          <input
            type="text"
            className="form-input"
            placeholder="Search by Node ID (e.g. 0x0042 / 66) or squad name..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            style={{ padding: '7px 12px', fontSize: '0.85rem' }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>

          <div style={{ display: 'flex', background: 'rgba(9, 13, 22, 0.8)', padding: 3, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
            <button
              className="btn-tactical"
              style={{
                padding: '4px 10px',
                fontSize: '0.74rem',
                border: 'none',
                background: statusFilter === 'ALL' ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                color: statusFilter === 'ALL' ? '#38bdf8' : 'var(--text-secondary)'
              }}
              onClick={() => setStatusFilter('ALL')}
            >
              All Status
            </button>
            <button
              className="btn-tactical"
              style={{
                padding: '4px 10px',
                fontSize: '0.74rem',
                border: 'none',
                background: statusFilter === 'ACTIVE' ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
                color: statusFilter === 'ACTIVE' ? '#10b981' : 'var(--text-secondary)'
              }}
              onClick={() => setStatusFilter('ACTIVE')}
            >
              Active Only
            </button>
            <button
              className="btn-tactical"
              style={{
                padding: '4px 10px',
                fontSize: '0.74rem',
                border: 'none',
                background: statusFilter === 'INACTIVE' ? 'rgba(239, 68, 68, 0.2)' : 'transparent',
                color: statusFilter === 'INACTIVE' ? '#ef4444' : 'var(--text-secondary)'
              }}
              onClick={() => setStatusFilter('INACTIVE')}
            >
              Inactive Only
            </button>
          </div>

          <div style={{ display: 'flex', background: 'rgba(9, 13, 22, 0.8)', padding: 3, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
            <button
              className="btn-tactical"
              style={{
                padding: '4px 10px',
                fontSize: '0.74rem',
                border: 'none',
                background: roleFilter === 'ALL' ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                color: roleFilter === 'ALL' ? '#38bdf8' : 'var(--text-secondary)'
              }}
              onClick={() => setRoleFilter('ALL')}
            >
              All Roles
            </button>
            <button
              className="btn-tactical"
              style={{
                padding: '4px 10px',
                fontSize: '0.74rem',
                border: 'none',
                background: roleFilter === 'MASTER' ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                color: roleFilter === 'MASTER' ? '#38bdf8' : 'var(--text-secondary)'
              }}
              onClick={() => setRoleFilter('MASTER')}
            >
              Master Jackets
            </button>
            <button
              className="btn-tactical"
              style={{
                padding: '4px 10px',
                fontSize: '0.74rem',
                border: 'none',
                background: roleFilter === 'FIELD' ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                color: roleFilter === 'FIELD' ? '#fff' : 'var(--text-secondary)'
              }}
              onClick={() => setRoleFilter('FIELD')}
            >
              Field Nodes
            </button>
          </div>
        </div>
      </div>

      <div className="table-container">
        <table className="tactical-table">
          <thead>
            <tr>
              <th>Node ID</th>
              <th>Squad Unit Designation</th>
              <th>Role</th>
              <th>Status (Auto 180s)</th>
              <th>Last Seen</th>
              <th>Battery %</th>
              <th>Location & Fix State</th>
              <th>LoRa Signal</th>
              <th>Mesh Hops</th>
              <th style={{ textAlign: 'center' }}>Heartbeat Test Controls</th>
            </tr>
          </thead>
          <tbody>
            {filteredDevices.length === 0 ? (
              <tr>
                <td colSpan={10} style={{ textAlign: 'center', color: '#64748b', padding: '36px' }}>
                  No devices match the specified search or filter criteria.
                </td>
              </tr>
            ) : (
              filteredDevices.map((d) => {
                const hexId = '0x' + d.device_id.toString(16).toUpperCase().padStart(4, '0');
                const decId = d.device_id;
                const isSos = d.is_sos_active;
                const sig = getSignalMeta(d.last_rssi);
                const isLocUnavail =
                  !d.lat || !d.lon || d.gps_status === 'UNAVAILABLE' || (d.lat === 0 && d.lon === 0);
                const isLastKnown = d.gps_status === 'LAST_KNOWN';

                const elapsed = d.seconds_since_last_seen ?? Math.max(0, currentTime - (d.last_seen_epoch || 0));
                const remainingToTimeout = Math.max(0, HEARTBEAT_ACTIVE_TIMEOUT_SEC - elapsed);

                return (
                  <tr
                    key={d.device_id}
                    style={{
                      background: isSos
                        ? 'rgba(239, 68, 68, 0.08)'
                        : !d.is_active
                        ? 'rgba(255, 255, 255, 0.01)'
                        : undefined
                    }}
                  >

                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 700,
                            color: isSos ? '#ef4444' : '#38bdf8',
                            fontSize: '0.92rem'
                          }}
                        >
                          {hexId}
                        </span>
                        <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Dec: #{decId}</span>
                      </div>
                    </td>

                    <td>
                      <div style={{ fontWeight: 600, color: '#f1f5f9' }}>{d.name || `Field Node ${hexId}`}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        {d.motion === 2 ? '⚠️ Fall Detected' : d.motion === 1 ? '🏃 In Motion' : '🧘 Static Station'}
                      </div>
                    </td>

                    <td>
                      {d.is_master_jacket ? (
                        <span
                          className="pill"
                          style={{
                            background: 'rgba(56, 189, 248, 0.15)',
                            color: '#38bdf8',
                            border: '1px solid rgba(56, 189, 248, 0.4)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5
                          }}
                        >
                          <Shield size={12} />
                          <span>MASTER JACKET</span>
                        </span>
                      ) : (
                        <span
                          className="pill"
                          style={{
                            background: 'rgba(148, 163, 184, 0.1)',
                            color: '#cbd5e1',
                            border: '1px solid rgba(148, 163, 184, 0.25)'
                          }}
                        >
                          FIELD NODE
                        </span>
                      )}
                    </td>

                    <td>
                      {d.is_active ? (
                        <div>
                          <span className="pill pill-online">
                            ● ACTIVE
                          </span>
                          <div style={{ fontSize: '0.68rem', color: '#34d399', marginTop: 3 }}>
                            Timeout in {remainingToTimeout}s
                          </div>
                        </div>
                      ) : (
                        <div>
                          <span className="pill pill-offline">
                            ○ INACTIVE
                          </span>
                          <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: 3 }}>
                            Missed heartbeats
                          </div>
                        </div>
                      )}
                    </td>

                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Clock size={13} className="text-slate-500" />
                        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: d.is_active ? '#e2e8f0' : '#94a3b8' }}>
                          {formatLastSeen(d.last_seen_epoch)}
                        </span>
                      </div>
                      <span style={{ fontSize: '0.7rem', color: '#64748b', fontFamily: 'monospace' }}>
                        {d.last_seen_epoch ? new Date(d.last_seen_epoch * 1000).toLocaleTimeString() : 'N/A'}
                      </span>
                    </td>

                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Battery
                          size={16}
                          style={{
                            color: d.battery <= 20 ? '#ef4444' : d.battery <= 40 ? '#f59e0b' : '#10b981'
                          }}
                        />
                        <div>
                          <span
                            style={{
                              fontWeight: 700,
                              color: d.battery <= 20 ? '#ef4444' : d.battery <= 40 ? '#f59e0b' : '#10b981'
                            }}
                          >
                            {d.battery}%
                          </span>
                          <div
                            style={{
                              width: 50,
                              height: 4,
                              background: 'rgba(255,255,255,0.1)',
                              borderRadius: 2,
                              overflow: 'hidden',
                              marginTop: 2
                            }}
                          >
                            <div
                              style={{
                                width: `${Math.min(100, Math.max(0, d.battery))}%`,
                                height: '100%',
                                background: d.battery <= 20 ? '#ef4444' : d.battery <= 40 ? '#f59e0b' : '#10b981'
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </td>

                    <td>
                      {isLocUnavail ? (
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span
                            className="badge-loc-unavail pill"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, width: 'fit-content' }}
                          >
                            <AlertTriangle size={12} />
                            <span>Location unavailable</span>
                          </span>
                          <span style={{ fontSize: '0.7rem', color: '#f87171', marginTop: 3 }}>
                            No GPS fix (Indoor / Shelter)
                          </span>
                        </div>
                      ) : isLastKnown ? (
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span
                            className="badge-loc-lastknown pill"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, width: 'fit-content' }}
                          >
                            <Clock size={12} />
                            <span>LAST KNOWN</span>
                          </span>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', color: '#f59e0b', marginTop: 3 }}>
                            {d.lat.toFixed(4)}°, {d.lon.toFixed(4)}°
                          </span>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span
                            className="badge-loc-live pill"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, width: 'fit-content' }}
                          >
                            <Navigation size={12} />
                            <span>LIVE FIX</span>
                          </span>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', color: '#10b981', marginTop: 3 }}>
                            {d.lat.toFixed(4)}°, {d.lon.toFixed(4)}°
                          </span>
                        </div>
                      )}
                    </td>

                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: sig.color }}>
                          {d.last_rssi} dBm
                        </span>
                        <span style={{ fontSize: '0.72rem', color: sig.color }}>
                          {sig.label}
                        </span>
                      </div>
                    </td>

                    <td>
                      {d.hop_count === 1 ? (
                        <span
                          className="pill badge-direct"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        >
                          <Wifi size={12} />
                          <span>1 Hop (Direct)</span>
                        </span>
                      ) : (
                        <span
                          className="pill badge-relayed"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        >
                          <Zap size={12} />
                          <span>{d.hop_count} Hops (Relay)</span>
                        </span>
                      )}
                    </td>

                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        <button
                          className="btn-tactical"
                          title="Simulate receiving a fresh LoRa Heartbeat packet (turns node ACTIVE)"
                          style={{
                            padding: '4px 8px',
                            fontSize: '0.72rem',
                            background: 'rgba(16, 185, 129, 0.15)',
                            borderColor: 'rgba(16, 185, 129, 0.4)',
                            color: '#10b981'
                          }}
                          onClick={() => handlePing(d.device_id, d.name)}
                        >
                          <RefreshCw size={12} />
                          <span>Ping HB</span>
                        </button>

                        <button
                          className="btn-tactical"
                          title="Simulate 3 missed heartbeats (>180s without contact) to verify node turns INACTIVE automatically"
                          style={{
                            padding: '4px 8px',
                            fontSize: '0.72rem',
                            background: 'rgba(239, 68, 68, 0.12)',
                            borderColor: 'rgba(239, 68, 68, 0.35)',
                            color: '#f87171'
                          }}
                          onClick={() => handleForceTimeout(d.device_id, d.name)}
                        >
                          <XCircle size={12} />
                          <span>Age &gt;180s</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div
        className="card-tactical"
        style={{
          background: 'rgba(14, 20, 36, 0.7)',
          border: '1px solid rgba(56, 189, 248, 0.25)',
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 16
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: 'rgba(16, 185, 129, 0.15)',
              color: '#10b981',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <CheckCircle2 size={18} />
          </div>
          <div>
            <div style={{ fontSize: '0.86rem', fontWeight: 700, color: '#fff' }}>
              AUTOMATIC HEARTBEAT INACTIVITY CRITERIA (180s TIMEOUT)
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Standard operational protocol: Nodes transmit HEARTBEAT every 60s. After 3 consecutive missed packets (180s), nodes automatically transition to INACTIVE. Use the "Age &gt;180s" action to verify live automatic deactivation.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className="btn-tactical btn-tactical-primary"
            style={{ fontSize: '0.78rem', padding: '6px 14px' }}
            onClick={() => {
              devices.forEach((d) => sendDeviceHeartbeat(d.device_id));
              setSimFeedback('✅ All fleet nodes received fresh Heartbeats — 100% active state restored.');
              setTimeout(() => setSimFeedback(null), 4000);
            }}
          >
            <RefreshCw size={13} />
            <span>Ping All Nodes</span>
          </button>
        </div>
      </div>
    </div>
  );
}
