import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { RadioTower, AlertTriangle, Navigation, Shield, Compass, Crosshair } from 'lucide-react';

export default function TacticalMap({
  towerLocation = { lat: 28.6139, lon: 77.2090, name: "Tower 01 — Sector 4 Gateway" },
  events = [],
  devices = [],
  hazardAlerts = [],
  onSelectEvent,
  focusEvent = null
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const layersGroupRef = useRef(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [towerLocation.lat, towerLocation.lon],
        zoom: 13,
        zoomControl: false,
        attributionControl: false
      });

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        subdomains: 'abcd',
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
      }).addTo(map);

      L.control.zoom({ position: 'bottomright' }).addTo(map);

      layersGroupRef.current = L.layerGroup().addTo(map);
      mapInstanceRef.current = map;
    }

    const map = mapInstanceRef.current;
    const layers = layersGroupRef.current;
    layers.clearLayers();

    const towerIcon = L.divIcon({
      className: 'custom-tower-marker',
      html: `
        <div style="
          width: 38px;
          height: 38px;
          background: radial-gradient(circle, #0284c7 40%, rgba(2, 132, 199, 0.2) 100%);
          border: 2px solid #38bdf8;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 0 16px #38bdf8, 0 0 30px rgba(56, 189, 248, 0.4);
          color: #fff;
          font-size: 16px;
          cursor: pointer;
        ">
          📡
        </div>
      `,
      iconSize: [38, 38],
      iconAnchor: [19, 19]
    });

    const towerMarker = L.marker([towerLocation.lat, towerLocation.lon], { icon: towerIcon })
      .bindPopup(`
        <div style="background:#0e1424; color:#fff; padding:6px; font-family:'Inter',sans-serif; min-width:200px;">
          <div style="font-weight:700; color:#38bdf8; font-size:13px; margin-bottom:4px;">${towerLocation.name}</div>
          <div style="font-size:11px; color:#94a3b8; font-family:monospace;">Lat: ${towerLocation.lat.toFixed(5)}, Lon: ${towerLocation.lon.toFixed(5)}</div>
          <div style="font-size:11px; color:#10b981; margin-top:4px;">● LORAMESH GATEWAY ACTIVE (866 MHz)</div>
          <div style="font-size:11px; color:#f59e0b;">Coverage: 5,000m Tactical Radius</div>
        </div>
      `);
    layers.addLayer(towerMarker);

    const coverageCircle = L.circle([towerLocation.lat, towerLocation.lon], {
      radius: 4000,
      color: '#38bdf8',
      weight: 1.5,
      opacity: 0.6,
      fillColor: '#0284c7',
      fillOpacity: 0.05,
      dashArray: '6, 8'
    });
    layers.addLayer(coverageCircle);

    events.forEach((ev) => {
      if (!ev.lat || !ev.lon) return;

      const isSos = ev.type === 'SOS';
      const isHelp = ev.type === 'HELP';
      const color = isSos ? '#ef4444' : isHelp ? '#f59e0b' : '#10b981';
      const iconSymbol = isSos ? '🚨' : isHelp ? '⚠️' : '🛡️';
      const pulseClass = isSos ? 'marker-pulse-sos' : '';

      const eventIcon = L.divIcon({
        className: 'custom-event-marker',
        html: `
          <div class="${pulseClass}" style="
            width: 32px;
            height: 32px;
            background: rgba(14, 20, 36, 0.95);
            border: 2px solid ${color};
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 0 14px ${color};
            color: #fff;
            font-size: 14px;
            cursor: pointer;
          ">
            ${iconSymbol}
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      const hexId = "0x" + (ev.device_id || 0).toString(16).toUpperCase().padStart(4, "0");
      const eventMarker = L.marker([ev.lat, ev.lon], { icon: eventIcon })
        .bindPopup(`
          <div style="background:#0e1424; color:#fff; padding:6px; font-family:'Inter',sans-serif; min-width:210px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
              <span style="font-weight:700; color:${color}; font-size:13px;">${ev.type} EMERGENCY</span>
              <span style="background:rgba(255,255,255,0.1); padding:1px 6px; border-radius:4px; font-size:10px;">${ev.status || 'NEW'}</span>
            </div>
            <div style="font-size:12px; font-weight:600; margin-bottom:4px;">Node: ${hexId} (Dec: ${ev.device_id})</div>
            <div style="font-size:11px; color:#94a3b8; font-family:monospace; margin-bottom:4px;">GPS: ${ev.lat.toFixed(5)}, ${ev.lon.toFixed(5)}</div>
            <div style="font-size:11px; color:#94a3b8;">Battery: ${ev.battery}% • RSSI: ${ev.rssi} dBm</div>
          </div>
        `);

      if (onSelectEvent) {
        eventMarker.on('click', () => onSelectEvent(ev));
      }

      layers.addLayer(eventMarker);
    });

    const masterJacketNode = devices.find(d => d.is_master_jacket && d.lat && d.lon && d.gps_status !== 'UNAVAILABLE');

    devices.forEach((d) => {

      if (!d.lat || !d.lon || d.gps_status === 'UNAVAILABLE' || (d.lat === 0 && d.lon === 0)) {
        return;
      }

      const isLastKnown = d.gps_status === 'LAST_KNOWN';
      const isMaster = d.is_master_jacket;
      const isSos = d.is_sos_active;

      let borderColor = isSos ? '#ef4444' : isMaster ? '#38bdf8' : (isLastKnown ? '#f59e0b' : '#10b981');
      let bgColor = isLastKnown ? 'rgba(245, 158, 11, 0.25)' : (isSos ? 'rgba(239, 68, 68, 0.3)' : 'rgba(14, 20, 36, 0.95)');
      let borderStyle = isLastKnown ? '2px dashed #f59e0b' : `2px solid ${borderColor}`;
      let symbol = isSos ? '🚨' : (isMaster ? '★' : (isLastKnown ? '⏳' : '●'));
      let pulseAnim = isLastKnown ? 'marker-pulse-lastknown' : (isMaster ? 'marker-pulse-master' : '');

      const devIcon = L.divIcon({
        className: 'custom-dev-marker',
        html: `
          <div class="${pulseAnim}" style="
            width: 26px;
            height: 26px;
            background: ${bgColor};
            border: ${borderStyle};
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: ${borderColor};
            font-size: 11px;
            font-weight: 700;
            cursor: pointer;
            box-shadow: ${isLastKnown ? '0 0 10px rgba(245, 158, 11, 0.6)' : `0 0 8px ${borderColor}`};
          ">
            ${symbol}
          </div>
        `,
        iconSize: [26, 26],
        iconAnchor: [13, 13]
      });

      const hexId = "0x" + d.device_id.toString(16).toUpperCase().padStart(4, "0");
      const devMarker = L.marker([d.lat, d.lon], { icon: devIcon })
        .bindPopup(`
          <div style="background:#0e1424; color:#fff; padding:6px; font-family:'Inter',sans-serif; min-width:200px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
              <span style="font-weight:700; color:${borderColor}; font-size:12px;">${d.name || hexId}</span>
              ${isLastKnown ? (
                '<span style="background:rgba(245,158,11,0.25); color:#f59e0b; border:1px solid #f59e0b; padding:1px 5px; border-radius:3px; font-size:9px; font-weight:700;">LAST KNOWN</span>'
              ) : (
                '<span style="background:rgba(16,185,129,0.25); color:#10b981; border:1px solid #10b981; padding:1px 5px; border-radius:3px; font-size:9px; font-weight:700;">LIVE FIX</span>'
              )}
            </div>
            <div style="font-size:11px; color:#cbd5e1; margin-bottom:4px;">Role: ${isMaster ? 'Master Jacket (Squad Lead)' : 'Field Responder Node'}</div>
            <div style="font-size:10px; color:#94a3b8; font-family:monospace; margin-bottom:4px;">
              Coords: ${d.lat.toFixed(5)}, ${d.lon.toFixed(5)}
            </div>
            <div style="font-size:11px; color:#94a3b8;">
              Battery: <strong style="color:${d.battery <= 20 ? '#ef4444' : '#10b981'}">${d.battery}%</strong> • RSSI: ${d.last_rssi} dBm
            </div>
            <div style="font-size:10px; color:${d.hop_count === 1 ? '#38bdf8' : '#f59e0b'}; margin-top:4px;">
              ${d.hop_count === 1 ? "🔗 Direct Link to Tower (1 hop)" : `📡 Relayed Mesh Node (${d.hop_count} hops)`}
            </div>
          </div>
        `);
      layers.addLayer(devMarker);

      if (d.hop_count === 1) {

        const line = L.polyline([[d.lat, d.lon], [towerLocation.lat, towerLocation.lon]], {
          color: '#38bdf8',
          weight: 1.5,
          opacity: 0.45,
          dashArray: '4, 4'
        });
        layers.addLayer(line);
      } else if (d.hop_count > 1 && masterJacketNode) {

        const relayLine = L.polyline([[d.lat, d.lon], [masterJacketNode.lat, masterJacketNode.lon]], {
          color: '#f59e0b',
          weight: 1.5,
          opacity: 0.5,
          dashArray: '2, 6'
        });
        layers.addLayer(relayLine);
      }
    });

    hazardAlerts.forEach((ha) => {
      if (!ha.lat || !ha.lon) return;

      const isCritical = ha.severity === 'CRITICAL' || ha.severity === 'EXTREME';
      const color = isCritical ? '#ef4444' : (ha.severity === 'SEVERE' || ha.severity === 'WARNING' ? '#f59e0b' : '#38bdf8');
      const iconSymbol = ha.hazard_type === 'FLOOD' ? '🌊' : ha.hazard_type === 'LANDSLIDE' ? '⛰️' : ha.hazard_type === 'WEATHER' ? '💨' : '⚠️';

      const hazardIcon = L.divIcon({
        className: 'custom-hazard-marker',
        html: `
          <div style="
            width: 32px;
            height: 32px;
            background: rgba(14, 20, 36, 0.92);
            border: 2px solid ${color};
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 0 14px ${color};
            font-size: 15px;
            cursor: pointer;
          ">
            ${iconSymbol}
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      const hazardMarker = L.marker([ha.lat, ha.lon], { icon: hazardIcon })
        .bindPopup(`
          <div style="background:#0e1424; color:#fff; padding:6px; font-family:'Inter',sans-serif; min-width:230px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
              <span style="font-weight:700; color:${color}; font-size:12px;">${ha.source || 'EXTERNAL FEED'}</span>
              <span style="background:${color}22; color:${color}; border:1px solid ${color}66; padding:1px 5px; border-radius:3px; font-size:9px; font-weight:700;">${ha.severity}</span>
            </div>
            <div style="font-size:11px; font-weight:600; margin-bottom:4px; color:#f1f5f9;">${ha.headline}</div>
            <div style="font-size:10px; color:#cbd5e1; margin-bottom:4px;">Sector: ${ha.affected_sector || 'Regional'}</div>
            <div style="font-size:10px; color:#94a3b8; font-family:monospace; margin-bottom:4px;">Coords: ${ha.lat.toFixed(4)}, ${ha.lon.toFixed(4)}</div>
            <div style="font-size:10px; color:#38bdf8;">Distance: ${ha.distance_from_tower || 'Near Tower'}</div>
          </div>
        `);
      layers.addLayer(hazardMarker);

      if (ha.impact_radius_m) {
        const impactCircle = L.circle([ha.lat, ha.lon], {
          radius: ha.impact_radius_m,
          color: color,
          weight: 1.5,
          opacity: 0.65,
          fillColor: color,
          fillOpacity: 0.08,
          dashArray: '5, 6'
        });
        layers.addLayer(impactCircle);
      }
    });
  }, [towerLocation, events, devices, hazardAlerts]);

  useEffect(() => {
    if (focusEvent && focusEvent.lat && focusEvent.lon && !(focusEvent.lat === 0 && focusEvent.lon === 0)) {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.flyTo([focusEvent.lat, focusEvent.lon], 15, { duration: 1.2 });
      }
    }
  }, [focusEvent]);

  const recenterTower = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([towerLocation.lat, towerLocation.lon], 13, { duration: 1.2 });
    }
  };

  const focusLatestSOS = () => {
    const activeSos = events.find(e => e.type === 'SOS' && e.lat && e.lon);
    if (activeSos && mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([activeSos.lat, activeSos.lon], 15, { duration: 1.2 });
    } else {
      recenterTower();
    }
  };

  const unavailCount = devices.filter(d => !d.lat || !d.lon || d.gps_status === 'UNAVAILABLE' || (d.lat === 0 && d.lon === 0)).length;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>

      <div ref={mapContainerRef} style={{ width: '100%', height: '100%', background: '#090d16' }} />

      {unavailCount > 0 && (
        <div style={{
          position: 'absolute',
          top: 14,
          left: 14,
          zIndex: 500,
          background: 'rgba(14, 20, 36, 0.92)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(245, 158, 11, 0.35)',
          borderRadius: 'var(--radius-md)',
          padding: '6px 12px',
          fontSize: '0.74rem',
          fontWeight: 600,
          color: '#f59e0b',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          boxShadow: '0 2px 10px rgba(0,0,0,0.5)'
        }}>
          <span>⚠️ {unavailCount} {unavailCount === 1 ? 'Node' : 'Nodes'}: Location Unavailable (GPS Acquiring)</span>
        </div>
      )}

      <div style={{
        position: 'absolute',
        top: 14,
        right: 14,
        zIndex: 500,
        display: 'flex',
        flexDirection: 'column',
        gap: 8
      }}>
        <button
          className="btn-tactical"
          style={{ background: 'rgba(14, 20, 36, 0.9)', backdropFilter: 'blur(8px)', fontSize: '0.75rem', padding: '6px 12px' }}
          onClick={recenterTower}
          title="Center map on Gateway Tower"
        >
          <Crosshair size={14} className="text-cyan-400" />
          <span>Center Tower</span>
        </button>

        <button
          className="btn-tactical btn-tactical-danger"
          style={{ fontSize: '0.75rem', padding: '6px 12px' }}
          onClick={focusLatestSOS}
          title="Zoom to latest active SOS distress event"
        >
          <AlertTriangle size={14} />
          <span>Zoom to SOS</span>
        </button>
      </div>

      <div style={{
        position: 'absolute',
        bottom: 14,
        left: 14,
        zIndex: 500,
        background: 'rgba(10, 15, 30, 0.88)',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 'var(--radius-md)',
        padding: '8px 12px',
        fontSize: '0.72rem',
        color: 'var(--text-secondary)',
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 12
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: '#38bdf8' }}>📡</span>
          <span>Gateway Tower</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', display: 'inline-block' }}></span>
          <span>SOS (Active)</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }}></span>
          <span>HELP</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#38bdf8', display: 'inline-block' }}></span>
          <span>Live Squad Node</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'rgba(245, 158, 11, 0.25)', border: '1.5px dashed #f59e0b', display: 'inline-block' }}></span>
          <span style={{ color: '#f59e0b' }}>Last Known Location</span>
        </span>
      </div>
    </div>
  );
}
