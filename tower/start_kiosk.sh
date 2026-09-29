#!/bin/bash
# =========================================================================
# QuickRescue Communication Tower — Touchscreen Kiosk Auto-Launcher
# =========================================================================
# Launches Chromium in true full-screen kiosk mode on the Pi 7" display.
# Disables screen blanking, sleep timers, and hides mouse pointer.

# Wait for local REST API & Web UI to be ready
echo "[KIOSK] Waiting for QuickRescue local server on http://localhost:8000..."
while ! curl -s http://localhost:8000/api/health > /dev/null; do
    sleep 1
done
echo "[KIOSK] Local API is ONLINE. Launching Kiosk UI..."

# Disable screen saver and power-saving blanking
xset s noblank
xset s off
xset -dpms

# Hide mouse cursor when idle using unclutter
unclutter -idle 0.5 -root &

# Launch Chromium in dedicated kiosk mode
chromium-browser \
  --noerrdialogs \
  --disable-infobars \
  --kiosk \
  --check-for-update-interval=31536000 \
  --disable-pinch \
  --overscroll-history-navigation=0 \
  http://localhost:8000/
