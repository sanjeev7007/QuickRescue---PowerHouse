import React from 'react';
import { useEmergency } from '../context/EmergencyContext';
import TacticalMap from '../components/TacticalMap';
import {
  AlertTriangle,
  Radio,
  RadioTower,
  Sun,
  BatteryCharging,
  Droplets,
  CloudRain,
  Thermometer,
  ShieldAlert,
  ShieldCheck,
  Wind,
  Clock,
  Activity,
  ArrowUpRight,
  Sparkles,
  RefreshCw
} from 'lucide-react';

export default function DashboardScreen({ onNavigate }) {
  const {
    events,
    devices,
    towerTelemetry,
    sensorTemp,
    sensorWater,
    sensorRain,
    sensorBattV,
    sensorBattPct,
    sensorBattCurr,
    weatherData,
    activeSosCount,
    activeHelpCount,
    activeDevicesCount,
    totalDevicesCount,
    isTowerOnline,
    triggerSimulatedLiveSOS,
    triggerSimulatedSensorUpdate
  } = useEmergency();

  const power = towerTelemetry?.power || {
    battery_voltage: sensorBattV.value,
    battery_pct: sensorBattPct.value,
    battery_current: sensorBattCurr.value,
    solar_state: "CHARGING",
    is_low_battery_mode: false
  };

  const towerLocation = {
    lat: towerTelemetry?.lat || 28.6139,
    lon: towerTelemetry?.lon || 77.2090,
    name: towerTelemetry?.name || "Sector 4 Central Gateway (Tower 01)"
  };

  return (
    <div className="screen-container">

      <div className="view-header">
        <div className="view-title-group">
          <h2>EMERGENCY OPERATIONS COMMAND DASHBOARD</h2>
          <p>
            Real-time disaster ground control • Gateway Station 0x0001 (Sector 4 Gorge) •
            <span style={{ color: '#10b981', marginLeft: 6 }}>● Live Firestore Feed Active</span>
          </p>
        </div>

        <div className="view-actions">

          <button
            className="btn-tactical btn-tactical-danger"
            onClick={triggerSimulatedLiveSOS}
            title="Simulate incoming SOS packet to verify instant live update"
            style={{ fontSize: '0.78rem', padding: '6px 12px' }}
          >
            <ShieldAlert size={14} />
            <span>Simulate Live SOS</span>
          </button>

          <button
            className="btn-tactical"
            onClick={() => triggerSimulatedSensorUpdate("WATER_LEVEL_MM", 50)}
            title="Increase flood level reading by 50mm"
            style={{ fontSize: '0.78rem', padding: '6px 12px' }}
          >
            <Droplets size={14} className="text-cyan-400" />
            <span>Water +50mm</span>
          </button>

          <button
            className="btn-tactical btn-tactical-primary"
            onClick={() => onNavigate('admin_broadcast')}
            style={{ fontSize: '0.78rem', padding: '6px 12px' }}
          >
            <Radio size={14} />
            <span>Broadcast</span>
          </button>
        </div>
      </div>

      <div className="grid-metrics">

        <div className="card-tactical" style={{ borderColor: activeSosCount > 0 ? 'rgba(239, 68, 68, 0.45)' : undefined }}>
          <div className="metric-header">
            <span className="metric-label">ACTIVE SOS ALERTS</span>
            <div className="metric-icon-wrap" style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' }}>
              <ShieldAlert size={18} />
            </div>
          </div>
          <div className="metric-val" style={{ color: activeSosCount > 0 ? '#ef4444' : '#10b981' }}>
            {activeSosCount}
          </div>
          <div className="metric-sub" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className={`pill ${activeSosCount > 0 ? 'pill-sos' : 'pill-safe'}`} style={{ fontSize: '0.68rem', padding: '1px 6px' }}>
              {activeSosCount > 0 ? "CRITICAL LIFE THREAT" : "NORMAL"}
            </span>
            <span>{activeSosCount > 0 ? "Dispatch team deployed" : "Zero open SOS"}</span>
          </div>
        </div>

        <div className="card-tactical" style={{ borderColor: activeHelpCount > 0 ? 'rgba(245, 158, 11, 0.45)' : undefined }}>
          <div className="metric-header">
            <span className="metric-label">ACTIVE HELP DISTRESS</span>
            <div className="metric-icon-wrap" style={{ background: 'rgba(245, 158, 11, 0.2)', color: '#f59e0b' }}>
              <AlertTriangle size={18} />
            </div>
          </div>
          <div className="metric-val" style={{ color: activeHelpCount > 0 ? '#f59e0b' : '#fff' }}>
            {activeHelpCount}
          </div>
          <div className="metric-sub" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className={`pill ${activeHelpCount > 0 ? 'pill-help' : 'pill-safe'}`} style={{ fontSize: '0.68rem', padding: '1px 6px' }}>
              {activeHelpCount > 0 ? "URGENT DISTRESS" : "CLEAR"}
            </span>
            <span>Non-life-threat assistance</span>
          </div>
        </div>

        <div className="card-tactical">
          <div className="metric-header">
            <span className="metric-label">ACTIVE SQUAD FLEET</span>
            <div className="metric-icon-wrap" style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8' }}>
              <Radio size={18} />
            </div>
          </div>
          <div className="metric-val">
            {activeDevicesCount} <span style={{ fontSize: '1rem', color: '#64748b' }}>/ {totalDevicesCount}</span>
          </div>
          <div className="metric-sub">
            <span className="pill pill-safe" style={{ fontSize: '0.68rem', padding: '1px 6px' }}>
              ● {Math.round((activeDevicesCount / Math.max(1, totalDevicesCount)) * 100)}% ONLINE
            </span>
            <span style={{ marginLeft: 6 }}>LoRa Mesh Linked</span>
          </div>
        </div>

        <div className="card-tactical">
          <div className="metric-header">
            <span className="metric-label">GATEWAY TOWER 01</span>
            <div className="metric-icon-wrap" style={{ background: isTowerOnline ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)', color: isTowerOnline ? '#10b981' : '#ef4444' }}>
              <RadioTower size={18} />
            </div>
          </div>
          <div className="metric-val" style={{ color: isTowerOnline ? '#10b981' : '#ef4444', fontSize: '1.6rem' }}>
            {isTowerOnline ? "ONLINE" : "OFFLINE"}
          </div>
          <div className="metric-sub">
            866 MHz SX1276 • Gateway Station
          </div>
        </div>

        <div className="card-tactical">
          <div className="metric-header">
            <span className="metric-label">TOWER LiFePO4 POWER</span>
            <div className="metric-icon-wrap" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b' }}>
              <Sun size={18} />
            </div>
          </div>
          <div className="metric-val" style={{ color: power.is_low_battery_mode ? '#ef4444' : '#fff' }}>
            {power.battery_voltage?.toFixed(2)}V <span style={{ fontSize: '1rem', color: '#f59e0b' }}>({power.battery_pct?.toFixed(0)}%)</span>
          </div>
          <div className="metric-sub" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className={`pill ${power.is_low_battery_mode ? 'pill-sos' : 'pill-safe'}`} style={{ fontSize: '0.68rem', padding: '1px 6px' }}>
              {power.is_low_battery_mode ? "LOW BATT MODE" : (power.solar_state || 'CHARGING')}
            </span>
            <span>20W Solar Array</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.8fr', gap: 20, marginBottom: 24 }}>

        <div className="card-tactical" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CloudRain size={18} className="text-cyan-400" />
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: '#fff' }}>
                  CURRENT TOWER WEATHER
                </h3>
              </div>
              <span className="pill pill-safe" style={{ fontSize: '0.68rem' }}>
                SYNCED LIVE
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 8 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '2.4rem', fontWeight: 700, color: '#fff' }}>
                {weatherData.temp_c?.toFixed(1)}°C
              </span>
              <span style={{ fontSize: '0.95rem', fontWeight: 600, color: weatherData.rain_mm > 25 ? '#ef4444' : '#38bdf8' }}>
                {weatherData.condition}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, background: 'rgba(0,0,0,0.25)', padding: '10px 14px', borderRadius: 'var(--radius-md)' }}>
              <div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>RAINFALL</div>
                <div style={{ fontWeight: 600, color: weatherData.rain_mm > 20 ? '#ef4444' : '#fff' }}>
                  {weatherData.rain_mm?.toFixed(1)} mm
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>WIND GUSTS</div>
                <div style={{ fontWeight: 600 }}>{weatherData.gusts_kmh} km/h</div>
              </div>
              <div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>HUMIDITY</div>
                <div style={{ fontWeight: 600 }}>{weatherData.humidity}%</div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            <span>Source: {weatherData.synced_source}</span>
            <span>Last sync: Just now</span>
          </div>
        </div>

        <div className="card-tactical">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Activity size={18} className="text-cyan-400" />
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: '#fff' }}>
                LATEST LOCAL SENSOR READINGS (TOWER SENSORS)
              </h3>
            </div>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              COLLECTION: SENSOR_READINGS
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>

            <div style={{ background: 'rgba(0,0,0,0.3)', padding: '14px', borderRadius: 'var(--radius-md)', border: sensorWater.value > 1000 ? '1px solid #ef4444' : '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#38bdf8', marginBottom: 6 }}>
                <Droplets size={16} />
                <span style={{ fontSize: '0.72rem', fontWeight: 600 }}>WATER LEVEL</span>
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 700, color: sensorWater.value > 1000 ? '#ef4444' : '#fff' }}>
                {sensorWater.value?.toFixed(0)} <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>mm</span>
              </div>
              <div style={{ fontSize: '0.7rem', color: sensorWater.value > 1000 ? '#ef4444' : '#10b981', marginTop: 4 }}>
                {sensorWater.value > 1000 ? "⚠️ High Flood Risk" : "● Normal Limits"}
              </div>
            </div>

            <div style={{ background: 'rgba(0,0,0,0.3)', padding: '14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#38bdf8', marginBottom: 6 }}>
                <CloudRain size={16} />
                <span style={{ fontSize: '0.72rem', fontWeight: 600 }}>PRECIPITATION</span>
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 700, color: '#fff' }}>
                {sensorRain.value?.toFixed(1)} <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>mm</span>
              </div>
              <div style={{ fontSize: '0.7rem', color: '#10b981', marginTop: 4 }}>
                Tipping bucket sensor
              </div>
            </div>

            <div style={{ background: 'rgba(0,0,0,0.3)', padding: '14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#38bdf8', marginBottom: 6 }}>
                <Thermometer size={16} />
                <span style={{ fontSize: '0.72rem', fontWeight: 600 }}>TEMPERATURE</span>
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 700, color: '#fff' }}>
                {sensorTemp.value?.toFixed(1)} <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>°C</span>
              </div>
              <div style={{ fontSize: '0.7rem', color: '#10b981', marginTop: 4 }}>
                DS18B20 digital probe
              </div>
            </div>

            <div style={{ background: 'rgba(0,0,0,0.3)', padding: '14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#f59e0b', marginBottom: 6 }}>
                <BatteryCharging size={16} />
                <span style={{ fontSize: '0.72rem', fontWeight: 600 }}>BATT VOLTAGE</span>
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 700, color: '#fff' }}>
                {sensorBattV.value?.toFixed(2)} <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>V</span>
              </div>
              <div style={{ fontSize: '0.7rem', color: '#f59e0b', marginTop: 4 }}>
                INA219 I2C monitor
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card-tactical" style={{ padding: '20px', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', color: '#fff', display: 'flex', alignItems: 'center', gap: 10 }}>
              <RadioTower size={20} className="text-cyan-400" />
              <span>GEOSPATIAL SITUATION MAP • TOWER 01 &amp; LATEST INCIDENT MARKERS</span>
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Interactive Leaflet tactical map with 5km LoRa coverage radius and real-time distress markers
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="pill pill-safe">
              Tower: {towerLocation.lat.toFixed(4)}, {towerLocation.lon.toFixed(4)}
            </span>
            <span className="pill pill-sos">
              {events.filter(e => e.type === 'SOS').length} SOS Markers
            </span>
          </div>
        </div>

        <div style={{ height: 420, width: '100%', position: 'relative' }}>
          <TacticalMap
            towerLocation={towerLocation}
            events={events}
            devices={devices}
            onSelectEvent={() => onNavigate('realtime_alert')}
          />
        </div>
      </div>
    </div>
  );
}
