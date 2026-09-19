# Install Command Center TV receiver on 192.168.1.5 (channel PS3_93)
# Usage: dari workstation Owner, jalankan PowerShell sebagai user biasa.
$ErrorActionPreference = 'Stop'

$TV_IP    = '192.168.1.5'
$ADB_PORT = 5555
$APK      = "d:\project web\command-center\android-tv-receiver\app\build\outputs\apk\debug\app-debug.apk"
$PKG      = 'com.cmdcenter.tvreceiver'
$CHANNEL  = 'PS3_93'
$SERVER   = '192.168.1.2:3000'

Write-Host "==> Connecting adb to $TV_IP`:$ADB_PORT" -ForegroundColor Cyan
adb connect "$TV_IP`:$ADB_PORT"
if ($LASTEXITCODE -ne 0) { throw "adb connect gagal" }

# Pastikan TV menyala & paket terinstal (overwrite dengan -r supaya update tetap bersih)
$devices = adb devices
Write-Host "Devices:" $devices

Write-Host "==> Installing / updating $PKG" -ForegroundColor Cyan
adb -s "$TV_IP`:$ADB_PORT" install -r -t -g $APK
if ($LASTEXITCODE -ne 0) { throw "install gagal" }

Write-Host "==> Setting TV channel & server URL via SharedPreferences" -ForegroundColor Cyan
adb -s "$TV_IP`:$ADB_PORT" shell run-as $PKG sh -c "mkdir -p shared_prefs"
adb -s "$TV_IP`:$ADB_PORT" shell "run-as $PKG sh -c \"cat > shared_prefs/tv_receiver.xml\" <<EOF
<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
<map>
    <string name=\"tv_channel_name\">$CHANNEL</string>
    <string name=\"server_url\">ws://$SERVER</string>
    <boolean name=\"kiosk_mode_enabled\" value=\"true\" />
    <boolean name=\"keep_alive_enabled\" value=\"true\" />
    <boolean name=\"auto_reconnect_enabled\" value=\"true\" />
</map>
EOF"

Write-Host "==> Force-stop & launch app so prefs take effect" -ForegroundColor Cyan
adb -s "$TV_IP`:$ADB_PORT" shell am force-stop $PKG
Start-Sleep -Seconds 1
adb -s "$TV_IP`:$ADB_PORT" shell monkey -p $PKG -c android.intent.category.LAUNCHER 1 | Out-Null

Write-Host "==> Streaming logcat (Ctrl+C to exit)" -ForegroundColor Cyan
adb -s "$TV_IP`:$ADB_PORT" logcat -v time TVReceiver:V '*:S'