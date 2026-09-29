import React, { useState } from 'react';
import { useEmergency } from '../context/EmergencyContext';
import TacticalMap from '../components/TacticalMap';
import {
  Newspaper,
  Globe,
  CloudRain,
  AlertTriangle,
  ExternalLink,
  ShieldCheck,
  MapPin,
  Clock,
  Wifi,
  WifiOff,
  Radio,
  Search,
  Filter,
  Eye,
  RefreshCw,
  Compass,
  ArrowRight,
  Database,
  Layers,
  Waves,
  Wind,
  Zap,
  Info
} from 'lucide-react';

export default function LocationNewsScreen() {
  const {
    externalAlerts,
    devices,
    events,
    currentTime,
    isTowerOnline,
    toggleTowerOnline
  } = useEmergency();

  const [selectedSource, setSelectedSource] = useState('ALL');
  const [selectedSeverity, setSelectedSeverity] = useState('ALL');
  const [focusedAlert, setFocusedAlert] = useState(null);

  const towerLocation = { lat: 28.6139, lon: 77.2090, name: "Tower 01 — Sector 4 Gateway" };

  const formatTimeAgo = (epoch) => {
    if (!epoch) return 'Just now';
    const elapsed = Math.max(0, currentTime - epoch);
    if (elapsed < 60) return `${elapsed}s ago`;
    const mins = Math.floor(elapsed / 60);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ${mins % 60}m ago`;
  };

  const filteredAlerts = (externalAlerts || []).filter((item) => {
    const matchesSource =
      selectedSource === 'ALL' ||
      item.source_type === selectedSource ||
      (item.tags && item.tags.includes(selectedSource));

    const matchesSeverity =
      selectedSeverity === 'ALL' || item.severity === selectedSeverity;

    return matchesSource && matchesSeverity;
  });

  const criticalCount = (externalAlerts || []).filter(
    (a) => a.severity === 'CRITICAL' || a.severity === 'EXTREME'
  ).length;

  return (
    <div className="screen-container">

      <div className="view-header">
        <div className="view-title-group">
          <h2>
            <Globe className="text-cyan-400" size={28} />
            <span>LOCATION NEWS &amp; EXTERNAL DISASTER FEEDS</span>
          </h2>
          <p>
            Automated weather radar, hydrological flood warnings, and satellite hazard monitoring • OpenMeteo, GDACS &amp; IMD/IITM
          </p>
        </div>

        <div className="view-actions">

          <button
            className="btn-tactical"
            style={{
              padding: '6px 14px',
              fontSize: '0.78rem',
              background: isTowerOnline ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              borderColor: isTowerOnline ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)',
              color: isTowerOnline ? '#10b981' : '#f87171'
            }}
            onClick={toggleTowerOnline}
            title="Click to toggle Tower online/offline state to verify offline cached label behavior"
          >
            {isTowerOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
            <span>{isTowerOnline ? "SIMULATE TOWER OFFLINE" : "SIMULATE TOWER ONLINE"}</span>
          </button>

          <span
            className={`pill ${isTowerOnline ? 'pill-online' : 'pill-sos'}`}
            style={{ fontSize: '0.8rem', padding: '5px 12px' }}
          >
            {isTowerOnline ? "● TOWER ONLINE (LIVE API SYNC)" : "⚠️ TOWER OFFLINE (CACHED MODE)"}
          </span>
        </div>
      </div>

      {!isTowerOnline ? (
        <div
          style={{
            background: 'rgba(239, 68, 68, 0.12)',
            border: '2px solid #ef4444',
            borderRadius: 'var(--radius-lg)',
            padding: '16px 20px',
            marginBottom: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 16,
            boxShadow: '0 0 20px rgba(239, 68, 68, 0.2)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                background: 'rgba(239, 68, 68, 0.2)',
                color: '#ef4444',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.2rem'
              }}
            >
              <Database size={22} />
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: '0.92rem', fontWeight: 800, color: '#f87171', letterSpacing: '0.04em' }}>
                  ⚠️ TOWER OFFLINE — SHOWING LOCAL CACHED DISASTER ADVISORIES
                </span>
                <span
                  style={{
                    background: '#ef4444',
                    color: '#fff',
                    padding: '2px 8px',
                    borderRadius: 4,
                    fontSize: '0.72rem',
                    fontWeight: 800
                  }}
                >
                  OFFLINE / LAST UPDATED
                </span>
              </div>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: '#cbd5e1' }}>
                Upstream satellite/broadband disconnected. Bulletins from <strong>OpenMeteo, GDACS &amp; IMD/IITM</strong> were cached in local SQLite storage before connection loss and remain active for responder safety.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: '0.78rem', color: '#fca5a5', fontFamily: 'var(--font-mono)' }}>
              Cached snapshot: {formatTimeAgo(currentTime - 1800)}
            </span>
          </div>
        </div>
      ) : (
        <div
          style={{
            background: 'rgba(14, 20, 36, 0.7)',
            border: '1px solid rgba(56, 189, 248, 0.25)',
            borderRadius: 'var(--radius-lg)',
            padding: '12px 18px',
            marginBottom: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Wifi size={16} className="text-emerald-400" />
            <span style={{ fontSize: '0.84rem', color: '#e2e8f0', fontWeight: 600 }}>
              Live Telemetry &amp; External Feeds Active: Polling IMD Doppler Radar, OpenMeteo 15-min nowcast, and GDACS event streams.
            </span>
          </div>
          <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
            Next polling cycle in 180s • Tower 01 coordinates: 28.6139°N, 77.2090°E
          </span>
        </div>
      )}

      <div className="grid-metrics" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginBottom: 20 }}>

        <div className="card-tactical">
          <div className="metric-header">
            <span className="metric-label">IMD / IITM Radar</span>
            <div className="metric-icon-wrap" style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' }}>
              <Waves size={18} />
            </div>
          </div>
          <div className="metric-val" style={{ color: '#ef4444' }}>ORANGE</div>
          <div className="metric-sub">
            {!isTowerOnline ? "OFFLINE / LAST UPDATED: 18m ago (CACHED)" : "Flash Flood Surge (+850mm)"}
          </div>
        </div>

        <div className="card-tactical">
          <div className="metric-header">
            <span className="metric-label">OpenMeteo Extreme</span>
            <div className="metric-icon-wrap" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b' }}>
              <Wind size={18} />
            </div>
          </div>
          <div className="metric-val" style={{ color: '#f59e0b' }}>82 km/h</div>
          <div className="metric-sub">
            {!isTowerOnline ? "OFFLINE / LAST UPDATED: 32m ago (CACHED)" : "Gale gusts North Ridge"}
          </div>
        </div>

        <div className="card-tactical">
          <div className="metric-header">
            <span className="metric-label">GDACS Hazard Satellite</span>
            <div className="metric-icon-wrap" style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8' }}>
              <Globe size={18} />
            </div>
          </div>
          <div className="metric-val" style={{ color: '#38bdf8' }}>LS-2026</div>
          <div className="metric-sub">
            {!isTowerOnline ? "OFFLINE / LAST UPDATED: 48m ago (CACHED)" : "InSAR slope cut soil 94%"}
          </div>
        </div>

        <div className="card-tactical">
          <div className="metric-header">
            <span className="metric-label">Active Hazard Zones</span>
            <div className="metric-icon-wrap" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981' }}>
              <Layers size={18} />
            </div>
          </div>
          <div className="metric-val" style={{ color: '#10b981' }}>
            {filteredAlerts.length} <span style={{ fontSize: '0.9rem', color: '#94a3b8' }}>zones</span>
          </div>
          <div className="metric-sub">
            {criticalCount} Critical • All mapped within 5km radius
          </div>
        </div>
      </div>

      <div
        className="card-tactical"
        style={{
          padding: 0,
          overflow: 'hidden',
          height: 440,
          marginBottom: 24,
          position: 'relative'
        }}
      >
        <TacticalMap
          towerLocation={towerLocation}
          devices={devices}
          events={events}
          hazardAlerts={filteredAlerts}
          focusEvent={focusedAlert}
        />

        {!isTowerOnline && (
          <div
            style={{
              position: 'absolute',
              top: 14,
              left: 14,
              zIndex: 500,
              background: 'rgba(14, 20, 36, 0.94)',
              backdropFilter: 'blur(8px)',
              border: '1.5px solid #ef4444',
              borderRadius: 'var(--radius-md)',
              padding: '8px 14px',
              color: '#f87171',
              boxShadow: '0 4px 15px rgba(0,0,0,0.6)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: '0.78rem',
              fontWeight: 700
            }}
          >
            <Database size={15} />
            <span>OFFLINE / LAST UPDATED: Affected zones displayed from local cached snapshot</span>
          </div>
        )}
      </div>

      <div
        className="card-tactical"
        style={{
          padding: '14px 20px',
          marginBottom: 20,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 16,
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Filter size={16} className="text-cyan-400" />
          <span style={{ fontSize: '0.84rem', fontWeight: 700, color: '#fff' }}>
            FILTER DISASTER FEEDS:
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>

          <div style={{ display: 'flex', background: 'rgba(9, 13, 22, 0.8)', padding: 3, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
            {['ALL', 'IMD', 'OPENMETEO', 'GDACS', 'IITM'].map((src) => (
              <button
                key={src}
                className="btn-tactical"
                style={{
                  padding: '4px 10px',
                  fontSize: '0.74rem',
                  border: 'none',
                  background: selectedSource === src ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                  color: selectedSource === src ? '#38bdf8' : 'var(--text-secondary)'
                }}
                onClick={() => setSelectedSource(src)}
              >
                {src}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', background: 'rgba(9, 13, 22, 0.8)', padding: 3, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
            {['ALL', 'CRITICAL', 'SEVERE', 'WARNING'].map((sev) => (
              <button
                key={sev}
                className="btn-tactical"
                style={{
                  padding: '4px 10px',
                  fontSize: '0.74rem',
                  border: 'none',
                  background: selectedSeverity === sev ? 'rgba(239, 68, 68, 0.2)' : 'transparent',
                  color: selectedSeverity === sev ? '#ef4444' : 'var(--text-secondary)'
                }}
                onClick={() => setSelectedSeverity(sev)}
              >
                {sev}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {filteredAlerts.length === 0 ? (
          <div className="card-tactical" style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
            No disaster advisories match the specified filter criteria.
          </div>
        ) : (
          filteredAlerts.map((item) => {
            const isCrit = item.severity === 'CRITICAL' || item.severity === 'EXTREME';
            const isSevere = item.severity === 'SEVERE';
            const color = isCrit ? '#ef4444' : isSevere ? '#f59e0b' : '#38bdf8';

            return (
              <div
                key={item.id}
                className="card-tactical"
                style={{
                  borderLeft: `4px solid ${color}`,
                  background: isCrit ? 'rgba(239, 68, 68, 0.05)' : undefined,
                  boxShadow: isCrit ? '0 0 16px rgba(239, 68, 68, 0.15)' : undefined
                }}
              >

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 800,
                        color: color,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em'
                      }}
                    >
                      {item.source}
                    </span>

                    <span
                      className={`pill ${isCrit ? 'pill-sos' : isSevere ? 'pill-help' : 'badge-direct'}`}
                      style={{ fontSize: '0.7rem', fontWeight: 800 }}
                    >
                      {item.severity} (LEVEL {item.alert_level || 2})
                    </span>

                    {!isTowerOnline && (
                      <span
                        style={{
                          background: 'rgba(239, 68, 68, 0.2)',
                          color: '#f87171',
                          border: '1px solid rgba(239, 68, 68, 0.4)',
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          padding: '1px 8px',
                          borderRadius: 4,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4
                        }}
                      >
                        <Database size={10} />
                        <span>CACHED DATA</span>
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem' }}>
                    <Clock size={13} className="text-slate-400" />
                    {!isTowerOnline ? (
                      <span style={{ color: '#f87171', fontWeight: 700, fontFamily: 'monospace' }}>
                        OFFLINE / LAST UPDATED: {formatTimeAgo(item.last_updated_epoch)} (CACHED)
                      </span>
                    ) : (
                      <span style={{ color: '#94a3b8' }}>
                        Updated {formatTimeAgo(item.last_updated_epoch)} (Live Sync)
                      </span>
                    )}
                  </div>
                </div>

                <h3
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '1.15rem',
                    color: '#fff',
                    marginBottom: 10,
                    lineHeight: 1.35
                  }}
                >
                  {item.headline}
                </h3>

                <p style={{ fontSize: '0.88rem', color: '#cbd5e1', marginBottom: 16, lineHeight: 1.6 }}>
                  {item.content}
                </p>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderTop: '1px solid var(--border-subtle)',
                    paddingTop: 12,
                    fontSize: '0.78rem',
                    color: 'var(--text-muted)',
                    flexWrap: 'wrap',
                    gap: 12
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#e2e8f0', fontWeight: 500 }}>
                      <MapPin size={14} className="text-cyan-400" />
                      <span>{item.affected_sector}</span>
                    </span>

                    <span style={{ color: '#38bdf8' }}>
                      📍 {item.distance_from_tower}
                    </span>

                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>
                      Perimeter: {item.impact_radius_m}m radius
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      className="btn-tactical"
                      style={{
                        padding: '4px 10px',
                        fontSize: '0.74rem',
                        background: 'rgba(56, 189, 248, 0.15)',
                        color: '#38bdf8',
                        borderColor: 'rgba(56, 189, 248, 0.4)'
                      }}
                      onClick={() => setFocusedAlert(item)}
                    >
                      <MapPin size={12} />
                      <span>Locate on Map</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
