import React from 'react';
import { useEmergency } from '../context/EmergencyContext';
import { AlertTriangle, ShieldCheck, CheckCircle2, Radio, BellRing } from 'lucide-react';

export default function TopBanner({ onNavigate }) {
  const { latestCriticalAlert, acknowledgeAlert, isCloudConnected } = useEmergency();

  const isEmergency = latestCriticalAlert && latestCriticalAlert.status !== 'RESOLVED';

  if (!isEmergency) {
    return (
      <header className="top-critical-banner alert-normal" role="banner" aria-label="System Status">
        <div className="banner-left">
          <ShieldCheck size={16} className="text-emerald-400" />
          <span>STATION STATUS: ALL SECTORS NORMAL • LORAMESH NETWORK STABLE</span>
        </div>
        <div className="banner-right">
          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
            {isCloudConnected ? "🟢 CLOUD SYNC ACTIVE" : "🟡 OFFLINE PERSISTENCE"}
          </span>
        </div>
      </header>
    );
  }

  const isAcknowledged = latestCriticalAlert.status === 'ACKNOWLEDGED';
  const bannerClass = isAcknowledged ? 'top-critical-banner alert-warning' : 'top-critical-banner alert-emergency';

  return (
    <header className={bannerClass} role="alert" aria-live="assertive">
      <div className="banner-left">
        <div className="banner-pulse-dot"></div>
        <BellRing size={16} className="animate-pulse" />
        <span style={{ letterSpacing: '0.05em' }}>
          <strong>{latestCriticalAlert.title || "CRITICAL EMERGENCY ALERT"}</strong>
          {latestCriticalAlert.lat && (
            <span style={{ marginLeft: 10, opacity: 0.9, fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
              [{latestCriticalAlert.lat.toFixed(4)}, {latestCriticalAlert.lon.toFixed(4)}] • Bat: {latestCriticalAlert.battery}%
            </span>
          )}
        </span>
      </div>

      <div className="banner-right">
        <span className="pill pill-sos" style={{ background: 'rgba(0,0,0,0.3)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)' }}>
          {latestCriticalAlert.status || 'NEW'}
        </span>

        {!isAcknowledged && (
          <button
            className="banner-btn-action"
            onClick={() => acknowledgeAlert(latestCriticalAlert.id)}
            title="Acknowledge critical distress alert"
          >
            ACKNOWLEDGE
          </button>
        )}

        <button
          className="banner-btn-action"
          onClick={() => onNavigate && onNavigate('realtime_alert')}
          style={{ background: 'rgba(255, 255, 255, 0.9)', color: '#090d16' }}
        >
          VIEW DISPATCH &rarr;
        </button>
      </div>
    </header>
  );
}
