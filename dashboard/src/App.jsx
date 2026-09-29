import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { EmergencyProvider } from './context/EmergencyContext';
import TopBanner from './components/TopBanner';
import Sidebar from './components/Sidebar';
import LoginScreen from './components/LoginScreen';

import DashboardScreen from './screens/DashboardScreen';
import AdminBroadcastScreen from './screens/AdminBroadcastScreen';
import ActiveDeviceListScreen from './screens/ActiveDeviceListScreen';
import RealtimeAlertScreen from './screens/RealtimeAlertScreen';
import LocationNewsScreen from './screens/LocationNewsScreen';
import TrainingMockDrillScreen from './screens/TrainingMockDrillScreen';

function MainLayout() {
  const { currentUser } = useAuth();

  const getInitialScreen = () => {
    const hash = window.location.hash.replace('#', '').trim();
    const valid = ['dashboard', 'admin_broadcast', 'active_devices', 'realtime_alert', 'location_news', 'mock_drill'];
    return valid.includes(hash) ? hash : 'dashboard';
  };

  const [activeScreen, setActiveScreen] = useState(getInitialScreen);

  const handleSelectScreen = (screenId) => {
    setActiveScreen(screenId);
    window.location.hash = screenId;
  };

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '').trim();
      const valid = ['dashboard', 'admin_broadcast', 'active_devices', 'realtime_alert', 'location_news', 'mock_drill'];
      if (valid.includes(hash)) {
        setActiveScreen(hash);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  if (!currentUser) {
    return <LoginScreen />;
  }

  const renderScreen = () => {
    switch (activeScreen) {
      case 'dashboard':
        return <DashboardScreen onNavigate={handleSelectScreen} />;
      case 'admin_broadcast':
        return <AdminBroadcastScreen />;
      case 'active_devices':
        return <ActiveDeviceListScreen />;
      case 'realtime_alert':
        return <RealtimeAlertScreen />;
      case 'location_news':
        return <LocationNewsScreen />;
      case 'mock_drill':
        return <TrainingMockDrillScreen />;
      default:
        return <DashboardScreen onNavigate={handleSelectScreen} />;
    }
  };

  return (
    <div className="app-shell">

      <TopBanner onNavigate={handleSelectScreen} />

      <Sidebar activeScreen={activeScreen} onSelectScreen={handleSelectScreen} />

      <main className="app-main" id="main-content" tabIndex={-1}>
        {renderScreen()}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <EmergencyProvider>
        <MainLayout />
      </EmergencyProvider>
    </AuthProvider>
  );
}
