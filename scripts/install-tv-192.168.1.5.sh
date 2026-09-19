#!/usr/bin/env bash
# Install Command Center TV receiver on 192.168.1.5 (channel PS3_93)
# Usage: jalankan dari workstation Owner (Linux/macOS/WSL).
set -euo pipefail

TV_IP="192.168.1.5"
ADB_PORT="5555"
APK="$(dirname "$0")/../android-tv-receiver/app/build/outputs/apk/debug/app-debug.apk"
PKG="com.cmdcenter.tvreceiver"
CHANNEL="PS3_93"
SERVER="192.168.1.2:3000"

echo "==> adb connect $TV_IP:$ADB_PORT"
adb connect "$TV_IP:$ADB_PORT"
adb devices

echo "==> Install / update APK"
adb -s "$TV_IP:$ADB_PORT" install -r -t -g "$APK"

echo "==> Set channel + server URL via SharedPreferences"
PREF_XML=$(cat <<EOF
<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
<map>
    <string name="tv_channel_name">$CHANNEL</string>
    <string name="server_url">ws://$SERVER</string>
    <boolean name="kiosk_mode_enabled" value="true" />
    <boolean name="keep_alive_enabled" value="true" />
    <boolean name="auto_reconnect_enabled" value="true" />
</map>
EOF
)
adb -s "$TV_IP:$ADB_PORT" shell "run-as $PKG sh -c \"mkdir -p shared_prefs\""
adb -s "$TV_IP:$ADB_PORT" shell "run-as $PKG sh -c \"cat > shared_prefs/tv_receiver.xml\" <<'PREF_EOF'
$PREF_XML
PREF_EOF"

echo "==> Launch app"
adb -s "$TV_IP:$ADB_PORT" shell am force-stop "$PKG"
adb -s "$TV_IP:$ADB_PORT" shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null

echo "==> logcat (Ctrl+C to exit)"
adb -s "$TV_IP:$ADB_PORT" logcat -v time TVReceiver:V '*:S'