import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useEmergency } from '../context/EmergencyContext';
import {
  LayoutDashboard,
  Radio,
  RadioTower,
  AlertTriangle,
  Newspaper,
  Crosshair,
  LogOut,
  Shield,
  Activity
} from 'lucide-react';

export const SCREENS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'admin_broadcast', label: 'Admin Broadcast', icon: Radio },
  { id: 'active_devices', label: 'Active Device List', icon: RadioTower },
  { id: 'realtime_alert', label: 'Realtime Alert', icon: AlertTriangle },
  { id: 'location_news', label: 'Location News', icon: Newspaper },
  { id: 'mock_drill', label: 'Training & Mock Drill', icon: Crosshair },
];

export default function Sidebar({ activeScreen, onSelectScreen }) {
  const { currentUser, logout } = useAuth();
  const { latestCriticalAlert, devices, isCloudConnected } = useEmergency();

  const activeSosCount = devices.filter(d => d.is_sos_active).length;
  const onlineCount = devices.filter(d => d.is_active).length;

  return (
    <aside className="app-sidebar" aria-label="Command Center Navigation">

      <div className="sidebar-header">
        <div className="brand-badge">
          <div className="brand-icon">
            <Activity size={20} />
          </div>
          <div className="brand-info">
            <h1>QUICKRESCUE</h1>
            <p>Disaster Ground Control</p>
          </div>
        </div>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section-title">Operations Screens</div>

        {SCREENS.map((item) => {
          const Icon = item.icon;
          const isActive = activeScreen === item.id;

          let badge = null;
          if (item.id === 'realtime_alert' && activeSosCount > 0) {
            badge = <span className="badge badge-emergency">{activeSosCount} SOS</span>;
          } else if (item.id === 'active_devices') {
            badge = <span className="badge badge-live">{onlineCount} ON</span>;
          }

          return (
            <button
              key={item.id}
              className={`nav-item ${isActive ? 'active' : ''}`}
              onClick={() => onSelectScreen(item.id)}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon className="icon" />
              <span>{item.label}</span>
              {badge}
            </button>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.72rem', color: '#64748b' }}>
          <span>NETWORK LINK</span>
          <span style={{ color: isCloudConnected ? '#10b981' : '#f59e0b', fontWeight: 600 }}>
            {isCloudConnected ? "ONLINE (SYNC)" : "OFFLINE CACHE"}
          </span>
        </div>

        <div className="operator-card">
          <div className="op-avatar">
            <Shield size={16} />
          </div>
          <div className="op-details">
            <div className="op-name">{currentUser?.displayName || "Duty Officer"}</div>
            <div className="op-role">
              {currentUser?.role === 'INCIDENT_COMMANDER' ? 'Incident Commander' : 'Station Operator'}
            </div>
          </div>
          <button
            className="btn-icon-logout"
            onClick={logout}
            title="Sign out of command center"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}
