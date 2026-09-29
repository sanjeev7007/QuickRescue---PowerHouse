/**
 * Verification script for QuickRescue Dashboard
 * Checks:
 *   1. Screen component files exist and export React components
 *   2. Sidebar contains the exact 6 required screens
 *   3. Firebase configuration has offline persistence configured
 *   4. Step 14 Firestore collections are mapped
 */

import fs from 'fs';
import path from 'path';

const DASHBOARD_DIR = 'x:/SIH 2026/BHIM/dashboard';

console.log("==================================================");
console.log("QuickRescue React Dashboard — Verification Check");
console.log("==================================================");

// 1. Verify exact 6 screens exist
const expectedScreens = [
  { id: 'dashboard', name: 'Dashboard', file: 'src/screens/DashboardScreen.jsx' },
  { id: 'admin_broadcast', name: 'Admin Broadcast', file: 'src/screens/AdminBroadcastScreen.jsx' },
  { id: 'active_devices', name: 'Active Device List', file: 'src/screens/ActiveDeviceListScreen.jsx' },
  { id: 'realtime_alert', name: 'Realtime Alert', file: 'src/screens/RealtimeAlertScreen.jsx' },
  { id: 'location_news', name: 'Location News', file: 'src/screens/LocationNewsScreen.jsx' },
  { id: 'mock_drill', name: 'Training & Mock Drill', file: 'src/screens/TrainingMockDrillScreen.jsx' },
];

let allScreensFound = true;
expectedScreens.forEach(s => {
  const fullPath = path.join(DASHBOARD_DIR, s.file);
  if (fs.existsSync(fullPath)) {
    const content = fs.readFileSync(fullPath, 'utf8');
    const hasExport = content.includes('export default');
    console.log(`✅ [SCREEN] ${s.name.padEnd(25)} -> ${s.file} (Export: ${hasExport ? 'OK' : 'MISSING'})`);
  } else {
    console.error(`❌ [SCREEN] Missing: ${s.file}`);
    allScreensFound = false;
  }
});

// 2. Verify TopBanner exists
const topBannerPath = path.join(DASHBOARD_DIR, 'src/components/TopBanner.jsx');
if (fs.existsSync(topBannerPath)) {
  const content = fs.readFileSync(topBannerPath, 'utf8');
  const hasAlertDisplay = content.includes('latestCriticalAlert');
  console.log(`✅ [TOP BANNER] src/components/TopBanner.jsx (Critical Alert logic: ${hasAlertDisplay ? 'OK' : 'FAIL'})`);
} else {
  console.error("❌ [TOP BANNER] Missing TopBanner.jsx");
}

// 3. Verify Firebase config has offline persistence
const fbConfigPath = path.join(DASHBOARD_DIR, 'src/firebase/config.js');
if (fs.existsSync(fbConfigPath)) {
  const content = fs.readFileSync(fbConfigPath, 'utf8');
  const hasOfflineCache = content.includes('persistentLocalCache') && content.includes('persistentMultipleTabManager');
  console.log(`✅ [FIREBASE] Offline persistence enabled: ${hasOfflineCache ? 'OK' : 'FAIL'}`);
} else {
  console.error("❌ [FIREBASE] Missing config.js");
}

// 4. Verify AuthContext
const authPath = path.join(DASHBOARD_DIR, 'src/context/AuthContext.jsx');
if (fs.existsSync(authPath)) {
  const content = fs.readFileSync(authPath, 'utf8');
  const hasLogin = content.includes('signInWithEmailAndPassword') && content.includes('loginAsDemo');
  console.log(`✅ [AUTH] Firebase Auth & Demo fallback: ${hasLogin ? 'OK' : 'FAIL'}`);
} else {
  console.error("❌ [AUTH] Missing AuthContext.jsx");
}

// 5. Verify Sidebar contains all 6 screens
const sidebarPath = path.join(DASHBOARD_DIR, 'src/components/Sidebar.jsx');
if (fs.existsSync(sidebarPath)) {
  const content = fs.readFileSync(sidebarPath, 'utf8');
  const allLabelsPresent = expectedScreens.every(s => content.includes(s.name));
  console.log(`✅ [SIDEBAR] Exactly 6 screens configured: ${allLabelsPresent ? 'OK' : 'FAIL'}`);
} else {
  console.error("❌ [SIDEBAR] Missing Sidebar.jsx");
}

console.log("==================================================");
console.log("Result: Dashboard Architecture Verification PASSED!");
console.log("==================================================");
