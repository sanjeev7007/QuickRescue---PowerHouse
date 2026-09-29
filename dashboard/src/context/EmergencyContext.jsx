import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { db } from '../firebase/config';
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  doc,
  setDoc
} from 'firebase/firestore';

const EmergencyContext = createContext(null);

const INITIAL_CRITICAL_ALERT = {
  id: "alert_initial_101",
  type: "SOS",
  title: "EMERGENCY SOS: SECTOR 4 GORGE DISPATCH",
  device_id: 0x0042,
  lat: 28.6140,
  lon: 77.2090,
  battery: 75,
  status: "NEW",
  timestamp: Date.now() - 120000,
  level: "CRITICAL"
};

const SAMPLE_DEVICES = [
  {
    device_id: 0x0042,
    name: "Rescue Team Alpha (Leader)",
    is_master_jacket: true,
    is_active: true,
    is_sos_active: true,
    battery: 75,
    motion: 1,
    last_rssi: -72,
    hop_count: 1,
    last_seen_epoch: Math.floor(Date.now() / 1000) - 25,
    lat: 28.6140,
    lon: 77.2090,
    gps_status: "VALID"
  },
  {
    device_id: 0x0055,
    name: "Medic Unit 02",
    is_master_jacket: false,
    is_active: true,
    is_sos_active: false,
    battery: 88,
    motion: 0,
    last_rssi: -84,
    hop_count: 2,
    last_seen_epoch: Math.floor(Date.now() / 1000) - 50,
    lat: 28.6155,
    lon: 77.2110,
    gps_status: "VALID"
  },
  {
    device_id: 0x008A,
    name: "Evacuation Scout 03 (Tunnel Entrance)",
    is_master_jacket: false,
    is_active: true,
    is_sos_active: false,
    battery: 92,
    motion: 1,
    last_rssi: -68,
    hop_count: 1,
    last_seen_epoch: Math.floor(Date.now() / 1000) - 15,
    lat: 28.6120,
    lon: 77.2050,
    gps_status: "LAST_KNOWN"
  },
  {
    device_id: 0x009C,
    name: "Indoor Recon 04 (Basement Shelter)",
    is_master_jacket: false,
    is_active: true,
    is_sos_active: false,
    battery: 45,
    motion: 0,
    last_rssi: -92,
    hop_count: 2,
    last_seen_epoch: Math.floor(Date.now() / 1000) - 80,
    lat: 0,
    lon: 0,
    gps_status: "UNAVAILABLE"
  },
  {
    device_id: 0x00D7,
    name: "Perimeter Drone Unit",
    is_master_jacket: false,
    is_active: false,
    is_sos_active: false,
    battery: 14,
    motion: 0,
    last_rssi: -108,
    hop_count: 3,
    last_seen_epoch: Math.floor(Date.now() / 1000) - 360,
    lat: 28.6080,
    lon: 77.1990,
    gps_status: "LAST_KNOWN"
  }
];

const SAMPLE_EVENTS = [
  {
    id: "event_sos_001",
    type: "SOS",
    priority: 1,
    device_id: 0x0042,
    device_name: "Handy Device 0x0042 (Rescue Alpha Lead)",
    source: "HANDY_DEVICE",
    lat: 28.6140,
    lon: 77.2090,
    location_state: "VALID",
    battery: 75,
    rssi: -72,
    status: "NEW",
    event_time: Math.floor(Date.now() / 1000) - 120,
    description: "Manual SOS Button Pressed — Gorge extraction requested"
  },
  {
    id: "event_help_002",
    type: "HELP",
    priority: 2,
    device_id: 0x0055,
    device_name: "Handy Device 0x0055 (Medic Unit 02)",
    source: "HANDY_DEVICE",
    lat: 28.6155,
    lon: 77.2110,
    location_state: "VALID",
    battery: 88,
    rssi: -84,
    status: "ACKNOWLEDGED",
    event_time: Math.floor(Date.now() / 1000) - 340,
    description: "Urgent Medical Assistance — Stretcher & burn dressings needed"
  },
  {
    id: "event_sensor_003",
    type: "sensor",
    priority: 3,
    device_id: 1,
    device_name: "Tower 01 Ultrasonic River Gauge",
    source: "TOWER_TELEMETRY",
    lat: 28.6139,
    lon: 77.2090,
    location_state: "VALID",
    battery: 100,
    rssi: -50,
    status: "NEW",
    event_time: Math.floor(Date.now() / 1000) - 480,
    description: "Water level surge warning: River reached 650mm threshold"
  },
  {
    id: "event_ext_004",
    type: "external",
    priority: 3,
    device_id: 0,
    device_name: "IMD Doppler Radar & GDACS Warning",
    source: "EXTERNAL_API",
    lat: 28.6139,
    lon: 77.2090,
    location_state: "VALID",
    battery: 100,
    rssi: 0,
    status: "IN PROGRESS",
    event_time: Math.floor(Date.now() / 1000) - 900,
    description: "Severe Flash Flood & Cloudburst Alert issued for Sector 4 Catchment"
  },
  {
    id: "event_safe_005",
    type: "SAFE",
    priority: 4,
    device_id: 0x008A,
    device_name: "Handy Device 0x008A (Scout 03)",
    source: "HANDY_DEVICE",
    lat: 28.6120,
    lon: 77.2050,
    location_state: "LAST_KNOWN",
    battery: 92,
    rssi: -68,
    status: "RESOLVED",
    event_time: Math.floor(Date.now() / 1000) - 1800,
    description: "Squad checkpoint check-in: Evacuation route verified clear"
  },
  {
    id: "event_sos_006",
    type: "SOS",
    priority: 1,
    device_id: 0x009C,
    device_name: "Handy Device 0x009C (Indoor Recon)",
    source: "HANDY_DEVICE",
    lat: 0,
    lon: 0,
    location_state: "UNAVAILABLE",
    battery: 45,
    rssi: -92,
    status: "NEW",
    event_time: Math.floor(Date.now() / 1000) - 60,
    description: "Subsurface basement distress — GPS blocked by concrete rubble"
  }
];

const SAMPLE_BROADCASTS = [
  {
    id: "bcast_init_001",
    alert_title: "CIVIL EVACUATION ORDER",
    alert_level: 3,
    alert_code: 0x0001,
    message: "Sector 4 gorge flash flood. Evacuate to High Ridge Shelter now.",
    target_tower_id: 0,
    created_by: "COMMANDER_NDRF",
    created_at: Math.floor(Date.now() / 1000) - 720,
    dispatched_to_lora: true,
    dispatched_at: Math.floor(Date.now() / 1000) - 715,
    acked_devices: [
      { device_id: 0x0042, name: "Rescue Team Alpha (Leader)", acked_at: Math.floor(Date.now() / 1000) - 705, hop_count: 1 },
      { device_id: 0x0055, name: "Medic Unit 02", acked_at: Math.floor(Date.now() / 1000) - 690, hop_count: 2 },
      { device_id: 0x008A, name: "Evacuation Scout 03", acked_at: Math.floor(Date.now() / 1000) - 680, hop_count: 1 },
      { device_id: 0x00D7, name: "Perimeter Drone Unit", acked_at: Math.floor(Date.now() / 1000) - 660, hop_count: 3 }
    ]
  },
  {
    id: "bcast_init_002",
    alert_title: "RISING RIVER LEVEL ADVISORY",
    alert_level: 2,
    alert_code: 0x0002,
    message: "River upstream surge 650mm. All units maintain safe standoff.",
    target_tower_id: 1,
    created_by: "DISTRICT_MAGISTRATE",
    created_at: Math.floor(Date.now() / 1000) - 1800,
    dispatched_to_lora: true,
    dispatched_at: Math.floor(Date.now() / 1000) - 1795,
    acked_devices: [
      { device_id: 0x0042, name: "Rescue Team Alpha (Leader)", acked_at: Math.floor(Date.now() / 1000) - 1780, hop_count: 1 },
      { device_id: 0x008A, name: "Evacuation Scout 03", acked_at: Math.floor(Date.now() / 1000) - 1770, hop_count: 1 }
    ]
  }
];

const SAMPLE_EXTERNAL_ALERTS = [
  {
    id: "ext_alert_01",
    source: "IMD (India Meteorological Dept)",
    source_type: "IMD",
    hazard_type: "FLOOD",
    headline: "Orange Alert: Severe Flash Flood Warning in Sector 4 Catchment",
    severity: "CRITICAL",
    alert_level: 3,
    alert_code: 0x0002,
    time: "18 mins ago",
    last_updated_epoch: Math.floor(Date.now() / 1000) - 1080,
    content: "Monsoonal cloudburst intensity exceeding 55mm/hr detected over Northern Watershed. River surge estimated +850mm above danger mark. Immediate evacuation along low-lying river bank paths.",
    affected_sector: "Sector 4 River Gorge & Low Basin",
    distance_from_tower: "1.4 km North-East",
    lat: 28.6185,
    lon: 77.2135,
    impact_radius_m: 1200,
    tags: ["IMD", "FLOOD", "CRITICAL"]
  },
  {
    id: "ext_alert_02",
    source: "OpenMeteo Extreme Weather Nowcast",
    source_type: "OPENMETEO",
    hazard_type: "WEATHER",
    headline: "Gale Wind Gusts 82 km/h & Torrential Downpour Projected",
    severity: "SEVERE",
    alert_level: 2,
    alert_code: 0x0004,
    time: "32 mins ago",
    last_updated_epoch: Math.floor(Date.now() / 1000) - 1920,
    content: "Atmospheric pressure drop to 988 hPa. Sustained gale winds 65 km/h with localized gusts reaching 82 km/h. High risk of tree falls, power mast collapse, and antenna misalignment.",
    affected_sector: "North Ridge & Tower 01 Line-of-Sight",
    distance_from_tower: "2.8 km North-West",
    lat: 28.6220,
    lon: 77.2020,
    impact_radius_m: 2000,
    tags: ["OPENMETEO", "WEATHER", "SEVERE"]
  },
  {
    id: "ext_alert_03",
    source: "GDACS International Disaster Network",
    source_type: "GDACS",
    hazard_type: "LANDSLIDE",
    headline: "Satellite Multi-Sensor Landslide Risk Alert ID: LS-2026-008",
    severity: "WARNING",
    alert_level: 2,
    alert_code: 0x0003,
    time: "48 mins ago",
    last_updated_epoch: Math.floor(Date.now() / 1000) - 2880,
    content: "Sentinel-1 InSAR soil moisture saturation exceeds 94% on South Escarpment cut. High vulnerability of localized mudslides along Highway 102 bypass corridor.",
    affected_sector: "South Escarpment & Highway 102 Cut",
    distance_from_tower: "3.2 km South-West",
    lat: 28.6050,
    lon: 77.2010,
    impact_radius_m: 900,
    tags: ["GDACS", "LANDSLIDE", "WARNING"]
  },
  {
    id: "ext_alert_04",
    source: "IITM Air Quality & Thunderstorm Tracker",
    source_type: "IITM",
    hazard_type: "WEATHER",
    headline: "Severe Lightning & Convective Storm Cell Tracking Towards Sector 4",
    severity: "ADVISORY",
    alert_level: 1,
    alert_code: 0x0001,
    time: "1 hour ago",
    last_updated_epoch: Math.floor(Date.now() / 1000) - 3600,
    content: "Doppler radar shows dense convective cumulonimbus cell with frequent cloud-to-ground lightning discharge (38 strikes/min). Responders advised to seek indoor/grounded shelter.",
    affected_sector: "Regional Sector 4 & 5 Perimeter",
    distance_from_tower: "4.1 km West",
    lat: 28.6110,
    lon: 77.1950,
    impact_radius_m: 2500,
    tags: ["IITM", "LIGHTNING", "ADVISORY"]
  }
];

export function EmergencyProvider({ children }) {
  const HEARTBEAT_ACTIVE_TIMEOUT_SEC = 180;
  const [currentTime, setCurrentTime] = useState(Math.floor(Date.now() / 1000));
  const [events, setEvents] = useState(SAMPLE_EVENTS);
  const [devices, setDevices] = useState(SAMPLE_DEVICES);
  const [externalAlerts, setExternalAlerts] = useState(SAMPLE_EXTERNAL_ALERTS);
  const [towerTelemetry, setTowerTelemetry] = useState({
    tower_id: 1,
    name: "Sector 4 Central Gateway",
    status: "ONLINE",
    power: {
      battery_voltage: 13.25,
      battery_pct: 75.0,
      battery_current: 0.85,
      solar_state: "CHARGING",
      is_low_battery_mode: false
    },
    environment: {
      temperature_c: 28.5,
      water_level_mm: 450,
      rain_level_mm: 2.5
    }
  });
  const [sensorReadings, setSensorReadings] = useState([]);
  const [broadcasts, setBroadcasts] = useState(SAMPLE_BROADCASTS);
  const [latestCriticalAlert, setLatestCriticalAlert] = useState(INITIAL_CRITICAL_ALERT);
  const [isCloudConnected, setIsCloudConnected] = useState(navigator.onLine);
  const [mockDrills, setMockDrills] = useState([
    {
      id: "drill_2026_09_28_01",
      name: "Monsoon Flash Flood Muster & Evacuation Drill",
      scenario: "FLOOD",
      started_at: Math.floor(Date.now() / 1000) - 86400,
      completed_at: Math.floor(Date.now() / 1000) - 86400 + 42,
      duration_sec: 42,
      participant_count: 4,
      target_nodes: 4,
      avg_response_time_sec: 4.8,
      readiness_score: "95% (EXCELLENT)",
      status: "COMPLETED",
      device_responses: [
        { device_id: 0x0042, name: "Rescue Team Alpha (Leader)", response_time_sec: 2.3, status: "ACK_SAFE", hop_count: 1 },
        { device_id: 0x0055, name: "Medic Unit 02", response_time_sec: 4.1, status: "ACK_SAFE", hop_count: 2 },
        { device_id: 0x008A, name: "Evacuation Scout 03", response_time_sec: 5.2, status: "ACK_SAFE", hop_count: 1 },
        { device_id: 0x009C, name: "Indoor Recon 04", response_time_sec: 7.6, status: "ACK_HELP", hop_count: 2 }
      ],
      notes: "Field personnel recognized simulated flood alert code 0x0002 within 8s benchmark. Zero packet collisions."
    }
  ]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsCloudConnected(true);
    const handleOffline = () => setIsCloudConnected(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    try {

      const eventsRef = collection(db, 'events');
      const qEvents = query(eventsRef, orderBy('priority', 'asc'), limit(50));
      const unsubEvents = onSnapshot(qEvents, (snapshot) => {
        if (!snapshot.empty) {
          const fetchedEvents = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setEvents(fetchedEvents);

          const activeCritical = fetchedEvents.find(e => (e.type === 'SOS' || e.priority === 1) && e.status !== 'RESOLVED');
          if (activeCritical) {
            setLatestCriticalAlert({
              id: activeCritical.id,
              type: activeCritical.type,
              title: `ACTIVE SOS: DEVICE 0x${(activeCritical.device_id || 0).toString(16).toUpperCase().padStart(4, '0')} IN SECTOR 4`,
              device_id: activeCritical.device_id,
              lat: activeCritical.lat,
              lon: activeCritical.lon,
              battery: activeCritical.battery,
              status: activeCritical.status || 'NEW',
              timestamp: activeCritical.event_time * 1000 || Date.now(),
              level: 'CRITICAL'
            });
          }
        }
      }, (err) => {
        console.warn("Using offline cached events:", err.message);
      });

      const devicesRef = collection(db, 'devices');
      const unsubDevices = onSnapshot(devicesRef, (snapshot) => {
        if (!snapshot.empty) {
          setDevices(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        }
      }, (err) => {
        console.warn("Using offline cached devices:", err.message);
      });

      const towerDocRef = doc(db, 'towers', 'tower_1');
      const unsubTower = onSnapshot(towerDocRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setTowerTelemetry(prev => ({
            ...prev,
            ...data,
            power: data.power || prev.power,
            environment: data.environment || prev.environment
          }));
        }
      }, (err) => {
        console.warn("Using offline cached tower telemetry:", err.message);
      });

      const bcastRef = collection(db, 'admin_broadcasts');
      const unsubBcast = onSnapshot(bcastRef, (snapshot) => {
        if (!snapshot.empty) {
          setBroadcasts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        }
      }, (err) => {
        console.warn("Using offline cached broadcasts:", err.message);
      });

      const sensorsRef = collection(db, 'sensor_readings');
      const qSensors = query(sensorsRef, orderBy('recorded_epoch', 'desc'), limit(30));
      const unsubSensors = onSnapshot(qSensors, (snapshot) => {
        if (!snapshot.empty) {
          setSensorReadings(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        }
      }, (err) => {
        console.warn("Using offline cached sensor readings:", err.message);
      });

      return () => {
        unsubEvents();
        unsubDevices();
        unsubTower();
        unsubBcast();
        unsubSensors();
      };
    } catch (e) {
      console.warn("Firestore listener initialization in offline mode:", e);
    }
  }, []);

  const getLatestSensor = (type, defaultVal, defaultUnit) => {

    const fromStream = sensorReadings.find(s => s.sensor_type === type);
    if (fromStream) {
      return { value: fromStream.value, unit: fromStream.unit, status: fromStream.status || 'NORMAL', time: fromStream.recorded_epoch };
    }

    if (towerTelemetry?.sensors?.[type]) {
      const s = towerTelemetry.sensors[type];
      return { value: s.value, unit: s.unit, status: s.status || 'NORMAL', time: s.recorded_epoch };
    }
    return { value: defaultVal, unit: defaultUnit, status: 'NORMAL', time: Date.now() / 1000 };
  };

  const sensorTemp = getLatestSensor("TEMPERATURE_C", 28.5, "°C");
  const sensorWater = getLatestSensor("WATER_LEVEL_MM", 450, "mm");
  const sensorRain = getLatestSensor("RAIN_LEVEL", 4.2, "mm");
  const sensorBattV = getLatestSensor("BATTERY_VOLTAGE", 13.25, "V");
  const sensorBattPct = getLatestSensor("BATTERY_PCT", 75.0, "%");
  const sensorBattCurr = getLatestSensor("BATTERY_CURRENT", 0.85, "A");

  const weatherData = {
    temp_c: sensorTemp.value,
    rain_mm: sensorRain.value,
    water_mm: sensorWater.value,
    condition: sensorRain.value > 25.0 ? "Heavy Torrential Rain" : sensorRain.value > 5.0 ? "Scattered Showers" : "Clear & Stable",
    gusts_kmh: 18.5,
    humidity: 78,
    synced_source: "IMD Nowcast & OpenMeteo Sync",
    synced_at: Date.now()
  };

  const liveDevices = useMemo(() => {
    return devices.map(d => {
      const lastSeen = d.last_seen_epoch || 0;
      const elapsed = Math.max(0, currentTime - lastSeen);
      const isActive = elapsed <= HEARTBEAT_ACTIVE_TIMEOUT_SEC;
      return {
        ...d,
        is_active: isActive,
        seconds_since_last_seen: elapsed
      };
    });
  }, [devices, currentTime]);

  const activeSosCount = events.filter(e => e.type === 'SOS' && e.status !== 'RESOLVED').length || liveDevices.filter(d => d.is_sos_active).length;
  const activeHelpCount = events.filter(e => e.type === 'HELP' && e.status !== 'RESOLVED').length;
  const activeDevicesCount = liveDevices.filter(d => d.is_active).length;
  const totalDevicesCount = liveDevices.length;
  const isTowerOnline = towerTelemetry?.status === 'ONLINE';

  const sendDeviceHeartbeat = async (deviceId) => {
    const nowEpoch = Math.floor(Date.now() / 1000);
    setDevices(prev => prev.map(d => {
      if (d.device_id === deviceId) {
        return {
          ...d,
          last_seen_epoch: nowEpoch,
          is_active: true
        };
      }
      return d;
    }));

    try {
      await setDoc(doc(db, 'devices', `dev_${deviceId}`), {
        last_seen_epoch: nowEpoch,
        is_active: true
      }, { merge: true });
    } catch (e) {
      console.warn("Heartbeat update stored in offline persistence:", e.message);
    }
  };

  const simulateDeviceTimeout = async (deviceId) => {
    const timedOutEpoch = Math.floor(Date.now() / 1000) - (HEARTBEAT_ACTIVE_TIMEOUT_SEC + 10);
    setDevices(prev => prev.map(d => {
      if (d.device_id === deviceId) {
        return {
          ...d,
          last_seen_epoch: timedOutEpoch,
          is_active: false
        };
      }
      return d;
    }));

    try {
      await setDoc(doc(db, 'devices', `dev_${deviceId}`), {
        last_seen_epoch: timedOutEpoch,
        is_active: false
      }, { merge: true });
    } catch (e) {
      console.warn("Simulated timeout stored in offline persistence:", e.message);
    }
  };

  const triggerSimulatedLiveSOS = async () => {
    const newId = `event_sim_${Date.now()}`;
    const newEvent = {
      id: newId,
      type: "SOS",
      priority: 1,
      device_id: 0x0099,
      lat: 28.6180 + (Math.random() - 0.5) * 0.01,
      lon: 77.2050 + (Math.random() - 0.5) * 0.01,
      location_state: "VALID",
      battery: Math.floor(Math.random() * 40) + 20,
      rssi: -75,
      status: "NEW",
      event_time: Math.floor(Date.now() / 1000)
    };

    setEvents(prev => [newEvent, ...prev]);
    setLatestCriticalAlert({
      id: newId,
      type: "SOS",
      title: `ACTIVE SOS: DEVICE 0x0099 SIMULATED DISTRESS`,
      device_id: 0x0099,
      lat: newEvent.lat,
      lon: newEvent.lon,
      battery: newEvent.battery,
      status: "NEW",
      timestamp: Date.now(),
      level: "CRITICAL"
    });

    try {
      await setDoc(doc(db, 'events', newId), newEvent, { merge: true });
    } catch (e) {
      console.warn("Simulated event queued in offline cache:", e.message);
    }
  };

  const triggerSimulatedSensorUpdate = async (type, delta) => {
    const current = type === "WATER_LEVEL_MM" ? sensorWater.value : sensorRain.value;
    const newVal = Math.max(0, current + delta);
    const readingId = `sensor_sim_${Date.now()}`;
    const newReading = {
      id: Date.now(),
      tower_id: 1,
      sensor_type: type,
      value: newVal,
      unit: type === "WATER_LEVEL_MM" ? "mm" : "mm",
      status: newVal > 1000 ? "CRITICAL" : newVal > 600 ? "WARNING" : "NORMAL",
      recorded_epoch: Math.floor(Date.now() / 1000)
    };

    setSensorReadings(prev => [newReading, ...prev]);
    try {
      await setDoc(doc(db, 'sensor_readings', readingId), newReading, { merge: true });
    } catch (e) {
      console.warn("Sensor reading queued in offline cache:", e.message);
    }
  };

  const acknowledgeAlert = (alertId) => {
    if (latestCriticalAlert && latestCriticalAlert.id === alertId) {
      setLatestCriticalAlert(prev => prev ? { ...prev, status: "ACKNOWLEDGED", level: "WARNING" } : null);
    }
  };

  const updateEventStatus = async (eventId, newStatus) => {
    const updatedEpoch = Math.floor(Date.now() / 1000);
    setEvents(prev => prev.map(ev => {
      if (ev.id === eventId) {
        return {
          ...ev,
          status: newStatus,
          updated_at: updatedEpoch
        };
      }
      return ev;
    }));

    if (latestCriticalAlert && latestCriticalAlert.id === eventId) {
      if (newStatus === 'RESOLVED') {
        const nextActive = events.find(e => e.id !== eventId && (e.type === 'SOS' || e.priority === 1) && e.status !== 'RESOLVED');
        setLatestCriticalAlert(nextActive ? {
          id: nextActive.id,
          type: nextActive.type,
          title: `ACTIVE SOS: DEVICE 0x${(nextActive.device_id || 0).toString(16).toUpperCase().padStart(4, '0')}`,
          device_id: nextActive.device_id,
          lat: nextActive.lat,
          lon: nextActive.lon,
          battery: nextActive.battery,
          status: nextActive.status,
          timestamp: nextActive.event_time * 1000 || Date.now(),
          level: 'CRITICAL'
        } : null);
      } else {
        setLatestCriticalAlert(prev => prev ? { ...prev, status: newStatus } : null);
      }
    }

    try {
      await setDoc(doc(db, 'events', eventId), {
        status: newStatus,
        updated_at: updatedEpoch
      }, { merge: true });
    } catch (err) {
      console.warn("Event status saved to offline cache:", err.message);
    }
  };

  const triggerHandyDeviceSOS = async (customPayload = {}) => {
    const newId = `event_sos_${Date.now()}`;
    const deviceId = customPayload.device_id || 0x00E4;
    const nowEpoch = Math.floor(Date.now() / 1000);
    const newEvent = {
      id: newId,
      type: "SOS",
      priority: 1,
      device_id: deviceId,
      device_name: customPayload.name || `Handy Device 0x${deviceId.toString(16).toUpperCase().padStart(4, '0')} (QuickRescue Field Unit)`,
      source: "HANDY_DEVICE",
      lat: customPayload.lat ?? (28.6148 + (Math.random() - 0.5) * 0.008),
      lon: customPayload.lon ?? (77.2085 + (Math.random() - 0.5) * 0.008),
      location_state: customPayload.location_state || "VALID",
      battery: customPayload.battery || 68,
      rssi: customPayload.rssi || -76,
      status: "NEW",
      event_time: nowEpoch,
      description: customPayload.description || "Emergency SOS Button Pressed on Handy Device — Rapid extraction required"
    };

    setEvents(prev => [newEvent, ...prev]);

    setLatestCriticalAlert({
      id: newId,
      type: "SOS",
      title: `ACTIVE SOS: DEVICE 0x${deviceId.toString(16).toUpperCase().padStart(4, '0')} DISTRESS SIGNAL`,
      device_id: deviceId,
      lat: newEvent.lat,
      lon: newEvent.lon,
      battery: newEvent.battery,
      status: "NEW",
      timestamp: Date.now(),
      level: "CRITICAL"
    });

    try {
      await setDoc(doc(db, 'events', newId), newEvent, { merge: true });
    } catch (err) {
      console.warn("Simulated Handy Device SOS saved to offline persistence:", err.message);
    }
    return newEvent;
  };

  const triggerHandyDeviceHELP = async () => {
    const newId = `event_help_${Date.now()}`;
    const deviceId = 0x00B2;
    const nowEpoch = Math.floor(Date.now() / 1000);
    const newEvent = {
      id: newId,
      type: "HELP",
      priority: 2,
      device_id: deviceId,
      device_name: "Handy Device 0x00B2 (Logistics Team)",
      source: "HANDY_DEVICE",
      lat: 28.6160 + (Math.random() - 0.5) * 0.006,
      lon: 77.2100 + (Math.random() - 0.5) * 0.006,
      location_state: "VALID",
      battery: 82,
      rssi: -80,
      status: "NEW",
      event_time: nowEpoch,
      description: "Urgent assistance requested — Stretcher & medical replenishment needed"
    };

    setEvents(prev => [newEvent, ...prev]);
    try {
      await setDoc(doc(db, 'events', newId), newEvent, { merge: true });
    } catch (err) {
      console.warn("Simulated Handy Device HELP saved to offline persistence:", err.message);
    }
    return newEvent;
  };

  const dispatchAdminBroadcast = async (broadcastData) => {
    const newDocId = `bcast_${Date.now()}`;
    const nowEpoch = Math.floor(Date.now() / 1000);

    const cleanMessage = (broadcastData.message || "").slice(0, 64);
    const cleanTitle = (broadcastData.title || "").slice(0, 32);

    const fullPayload = {
      id: newDocId,
      alert_title: cleanTitle,
      alert_level: broadcastData.level || 2,
      alert_code: broadcastData.code || 0x0001,
      message: cleanMessage,
      target_tower_id: broadcastData.towerId || 0,
      created_by: broadcastData.createdBy || "COMMANDER_NDRF",
      created_at: nowEpoch,
      dispatched_to_lora: true,
      dispatched_at: nowEpoch + 1,
      acked_devices: [
        { device_id: 0x0042, name: "Rescue Team Alpha (Leader)", acked_at: nowEpoch + 2, hop_count: 1 },
        { device_id: 0x0055, name: "Medic Unit 02", acked_at: nowEpoch + 3, hop_count: 2 },
        { device_id: 0x008A, name: "Evacuation Scout 03", acked_at: nowEpoch + 4, hop_count: 1 }
      ]
    };

    setBroadcasts(prev => [fullPayload, ...prev]);

    try {
      await setDoc(doc(db, 'admin_broadcasts', newDocId), fullPayload, { merge: true });
    } catch (err) {
      console.warn("Broadcast queued in offline persistence cache:", err.message);
    }
    return fullPayload;
  };

  const simulateDeviceAck = async (broadcastId, deviceId, deviceName) => {
    const nowEpoch = Math.floor(Date.now() / 1000);
    setBroadcasts(prev => prev.map(b => {
      if (b.id === broadcastId) {
        const existingAcks = b.acked_devices || [];
        if (!existingAcks.some(a => a.device_id === deviceId)) {
          return {
            ...b,
            acked_devices: [
              ...existingAcks,
              { device_id: deviceId, name: deviceName, acked_at: nowEpoch, hop_count: 1 }
            ]
          };
        }
      }
      return b;
    }));
  };

  const toggleTowerOnline = () => {
    setTowerTelemetry(prev => ({
      ...prev,
      status: prev.status === 'ONLINE' ? 'OFFLINE' : 'ONLINE'
    }));
  };

  const saveMockDrillRecord = async (drillRecord) => {
    setMockDrills(prev => [drillRecord, ...prev]);
    try {
      await setDoc(doc(db, 'mock_drills', drillRecord.id), drillRecord, { merge: true });
    } catch (e) {
      console.warn("Mock drill saved to offline storage cache:", e.message);
    }
  };

  return (
    <EmergencyContext.Provider value={{
      events,
      devices: liveDevices,
      rawDevices: devices,
      externalAlerts,
      mockDrills,
      saveMockDrillRecord,
      towerTelemetry,
      sensorReadings,
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
      toggleTowerOnline,
      broadcasts,
      latestCriticalAlert,
      isCloudConnected,
      currentTime,
      HEARTBEAT_ACTIVE_TIMEOUT_SEC,
      sendDeviceHeartbeat,
      simulateDeviceTimeout,
      updateEventStatus,
      triggerHandyDeviceSOS,
      triggerHandyDeviceHELP,
      acknowledgeAlert,
      dispatchAdminBroadcast,
      simulateDeviceAck,
      triggerSimulatedLiveSOS,
      triggerSimulatedSensorUpdate
    }}>
      {children}
    </EmergencyContext.Provider>
  );
}

export function useEmergency() {
  const context = useContext(EmergencyContext);
  if (!context) {
    throw new Error('useEmergency must be used within an EmergencyProvider');
  }
  return context;
}
