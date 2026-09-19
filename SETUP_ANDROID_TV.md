# 📺 Setup Android TV sebagai Receiver Perintah (Channel-Based WebSocket)

> **🆕 Auto-Discovery via mDNS** — Sekarang TV **tidak perlu** setting server IP manual. Server advertise dirinya sendiri, TV auto-discover dalam <2 detik. Cocok untuk Owner rental yang tidak paham config jaringan.

Dokumen ini menjelaskan cara menyambungkan Android TV ke sistem **Command Center** sehingga operator bisa kontrol TV (nyala/mati, volume, mute, branding overlay) langsung dari aplikasi kasir via WebSocket — **tanpa perlu setting IP per TV**.

---

## 📑 Daftar Isi

| Bagian | Untuk Siapa? |
|--------|--------------|
| 🎯 [Alur Zero-Setup](#-alur-zero-setup-untuk-user-awam) | **Owner rental, staff** — penjelasan simpel, bahasa sehari-hari |
| 🏗️ [Arsitektur Channel-Based](#️-arsitektur-channel-based) | Technical overview |
| 🪄 [Detail Teknis mDNS](#️-auto-discovery-via-mdns-detail-teknis) | Developer / teknisi |
| 🚀 [Build APK](#-langkah-1-build-android-tv-receiver-apk) | Developer |
| 📲 [Install APK](#-langkah-2-install-apk-ke-tv) | Teknisi |
| 🎬 [Setup Channel Name](#-langkah-3-jalankan-app--auto-register) | Owner (opsional) |
| 🔒 [Fitur Kiosk](#-fitur-kiosk--auto-launch-production-ready) | Owner |
| 🔧 [Troubleshooting](#-troubleshooting) | Semua |

---

## 🎯 Alur Zero-Setup untuk User Awam

Bayangkan TV dan komputer Owner seperti **2 orang di satu ruangan** yang saling panggil nama — tidak perlu hafal alamat rumah masing-masing.

### 📺 Dari Mata TV (Yang Paling Penting)

```
╔══════════════════════════════════════════════════════════════╗
║  LANGKAH 1: Sambungkan TV dengan Wifi                        ║
║  • Samakan ssid WiFi dengan komputer Owner                   ║
╚══════════════════════════════════════════════════════════════╝
                          ↓
╔══════════════════════════════════════════════════════════════╗
║  LANGKAH 2: Install APK (sekali seumur hidup TV)             ║
║  • Via USB stick / ADB wireless                              ║
║  • Seperti install aplikasi biasa di HP                      ║
║  • SELESAI. Tidak perlu set IP. Tidak perlu config apapun.   ║
╚══════════════════════════════════════════════════════════════╝
                          ↓
╔══════════════════════════════════════════════════════════════╗
║  LANGKAH 3: Buka aplikasi "Command Center TV Receiver"       ║
║  • Dari launcher TV (akan muncul otomatis)                   ║
║  • Tunggu 2-5 detik, app cari server di jaringan             ║
║  • Layar TV akan muncul tulisan:                             ║
║                                                              ║
║    📺 Channel: tv:A1B2C3                                    ║
║    Status: 🟢 Connected & Subscribed                        ║
║    🪄 Auto-Discovery: ✅ ON (192.168.1.5:3000)              ║
║                                                              ║
║  • Kalau muncul Connected → SELESAI! TV siap dipakai.       ║
╚══════════════════════════════════════════════════════════════╝
```

**Itu saja. 3 langkah. Total waktu ~5 menit per TV.**

### 🖥️ Dari Mata Owner (Operator)

```
╔══════════════════════════════════════════════════════════════╗
║  LANGKAH 1: Nyalakan komputer, jalankan `npm run dev`        ║
║  • Lihat di terminal: "[mdns] ✅ Advertising server..."      ║
║  • Server otomatis advertise dirinya ke semua TV di WiFi     ║
║  • TIDAK perlu copy-paste IP, TIDAK perlu kasih tau TV      ║
╚══════════════════════════════════════════════════════════════╝
                          ↓
╔══════════════════════════════════════════════════════════════╗
║  LANGKAH 2: Buka Command Center di browser                   ║
║  • http://localhost:3000                                     ║
║  • Login sebagai Owner                                       ║
╚══════════════════════════════════════════════════════════════╝
                          ↓
╔══════════════════════════════════════════════════════════════╗
║  LANGKAH 3: Tab "Units" → klik ikon 📺 di station manapun   ║
║  • Muncul daftar TV yang online                              ║
║  • Klik tombol: Nyalakan TV / Matikan TV / Volume dll       ║
║  • Selesai. TV merespons dalam <1 detik.                    ║
╚══════════════════════════════════════════════════════════════╝
```

### 🆘 Kalau TV Mati / Listrik Padam?

```
   TV mati ──→ listrik nyala lagi ──→ TV boot otomatis
                                          │
                                          ↓
                              APK auto-launch (BootReceiver)
                                          │
                                          ↓
                              Hubungi server di LAN (mDNS)
                                          │
                                          ↓
                              Server jawab: "Ini saya, IP 192.168.1.5"
                                          │
                                          ↓
                              TV connect & subscribe → siap dipakai
                                          │
                                          ↓
                                  TOTAL: < 10 detik
```

**Tidak perlu remote. Tidak perlu buka app manual. Tidak perlu kasih tahu TV alamat server baru.**

### 🔄 Kalau Owner Pindah Komputer / PC?

```
   Owner pindah ke PC baru dengan IP berbeda (mis. 192.168.1.99)
                          │
                          ↓
              nyalakan `npm run dev` di PC baru
                          │
                          ↓
              Server advertise IP baru ke LAN
                          │
                          ↓
              Semua TV auto-detect server baru (<2 detik)
                          │
                          ↓
                  TOTAL: < 5 detik untuk semua TV
```

**Tidak perlu setting ulang 12 TV satu-satu. Tidak perlu update IP manual di tiap TV.**

### 🧠 Analogi Sederhana

| Konsep Teknis | Analogi Dunia Nyata |
|---------------|---------------------|
| mDNS auto-discovery | TV berteriak "Hallo, ada server Command Center di sini?" setiap beberapa detik. Server mana saja di WiFi yang mendengar akan balas "Saya di sini!". |
| Channel `tv:PS5_01` | Seperti nama channel TV: tiap TV punya channel sendiri, tidak bentrok. |
| WebSocket persistent | Seperti telepon yang selalu terhubung — tinggal ngomong, langsung dengar. |
| Kiosk mode | Seperti booking app di iPad restoran — customer tidak bisa close / keluar app. |
| BootReceiver | Seperti set TV auto-on jam 8 pagi — TV langsung hidup ke app, tanpa pencet tombol. |

### ❓ Pertanyaan Yang Sering Ditanya User Awam

**Q: Kalau saya tidak tahu apa itu IP address, bisa pakai sistem ini?**
> ✅ Bisa. Anda tidak akan pernah melihat atau mengetik IP address sama sekali. Sistem yang bekerja untuk Anda.

**Q: Apakah harus install APK di tiap TV satu-satu?**
> ✅ Iya, tapi sekali seumur hidup TV. Setelah terinstall, TV otomatis nyala → otomatis connect → otomatis siap dipakai. Tidak perlu config lagi.

**Q: Kalau TV saya banyak (12 unit), berapa lama setup?**
> ✅ ~5 menit per TV untuk install APK. Total 1 jam untuk 12 TV. Setelah itu, **tidak perlu maintenance**.

**Q: Kalau ganti WiFi / pindah lokasi?**
> ✅ TV otomatis cari server baru di WiFi baru. Owner cukup jalankan server di WiFi baru, semua TV ikut pindah otomatis.

**Q: Apakah data lewat internet / cloud?**
> ❌ TIDAK. Semua komunikasi lokal di WiFi rental Anda. Tidak ada data ke server luar. Cepat, aman, dan gratis.

**Q: Kalau listrik padam tengah sesi?**
> ✅ TV auto-restart saat listrik nyala → APK auto-launch → reconnect ke server dalam <10 detik. Sesi tetap tersimpan di database. Owner tinggal lanjut seperti biasa.

### ✨ Keuntungan vs HTTP-based (versi lama)

| Aspek | HTTP per-TV | Channel WebSocket |
|-------|------------|-------------------|
| **Setting IP per TV** | ❌ Wajib edit `stationUrlMap` | ✅ **TIDAK perlu** — auto-register |
| **Latency command** | ~500-1000ms | **<100ms** (persistent WS) |
| **TV restart/putus** | HTTP request timeout | **Auto-reconnect** 3 detik |
| **Multi-operator** | Setiap operator perlu tahu IP | **Semua publish ke channel yang sama** |
| **Setup skala 12+ TV** | Edit config besar | **Zero config** — TV daftarkan diri |

---

## 🏗️ Arsitektur: Channel-Based (Ringkasan Teknis)

```
┌──────────────────────┐     WebSocket       ┌────────────────────────┐     WebSocket     ┌──────────────────┐
│ Command Center       │ ◄─────────────────►│      server.ts          │ ◄───────────────►│ Android TV Box   │
│ (Operator App)       │  PUBLISH/CHANNEL   │  Channel Registry      │  IDENTIFY+       │ (Receiver App)   │
│ [TVControlPanel]     │                    │  - tv:PS5_01 → [A]     │  SUBSCRIBE       │                  │
│                      │                    │  - tv:PS5_02 → [B]     │                  │  🪄 mDNS auto    │
└──────────────────────┘                    └────────────────────────┘                  │     -discover    │
                                                                                       └──────────────────┘
```

3 layer komunikasi:
1. **Operator → Server**: WebSocket `PUBLISH` ke channel tertentu (mis. `tv:PS5_01`)
2. **Server → TV**: WebSocket `CHANNEL_MESSAGE` routing berdasarkan channel
3. **TV → Hardware**: Android API (`PowerManager`, `AudioManager`, `WindowManager`)

Plus 1 layer discovery (mDNS):
4. **Server ↔ TV**: Auto-discovery via `_commandcenter._tcp.local` & `_tvreceiver._tcp.local` multicast

---

## 📋 Persiapan

### Hardware:
- **Android TV** atau **Android TV Box** (Mi Box, Nvidia Shield, generic TV Box) — minimal Android 5.0 (API 21)
- **Jaringan lokal yang sama** antara server.ts PC dan TV Box (WiFi/LAN)
- **PC/iPad** untuk operator (sudah ada)

### Software:
- **Android Studio** untuk build APK — https://developer.android.com/studio
- **Java 17+** & **Gradle** (otomatis dari Android Studio)
- **ADB** untuk install APK ke TV (opsional — bisa sideload via USB stick)

---

## 🪄 Auto-Discovery via mDNS (Detail Teknis)

> ℹ️ **Untuk Owner / user awam**, penjelasan di atas sudah cukup. Section ini menjelaskan **cara kerja teknis** di balik mDNS — baca hanya kalau Anda developer atau penasaran.

Sejak versi 1.1.0, APK dan Server saling menemukan via **mDNS / DNS-SD** — protokol standar yang dipakai AirPlay, Chromecast, Spotify Connect, dll.

### Cara kerjanya:

```
┌──────────────────────┐                          ┌──────────────────────┐
│ Server.ts (PC Owner) │                          │ Android TV (APK)     │
│                      │                          │                      │
│ 📡 Advertise:        │   ◄─── mDNS multicast ──►│ 🔍 Discover:         │
│   _commandcenter     │                          │   _commandcenter     │
│   ._tcp.local:3000   │                          │   ._tcp.local        │
│                      │                          │                      │
│ 🔍 Browse:           │   ◄─── mDNS multicast ──►│ 📡 Advertise:        │
│   _tvreceiver        │                          │   _tvreceiver        │
│   ._tcp.local        │                          │   ._tcp.local:8765   │
│                      │                          │   TXT: channel=PS5_01│
└──────────────────────┘                          └──────────────────────┘
```

### Yang **tidak perlu** lagi:

| Dulu | Sekarang |
|------|----------|
| ❌ Edit `WS_SERVER_URL` di MainActivity.kt | ✅ Server auto-terdeteksi |
| ❌ Set `server_url` di Settings TV (wajib) | ✅ Opsional, fallback saja |
| ❌ Ketik ulang IP kalau pindah WiFi/PC | ✅ Auto-reconnect ke server baru |
| ❌ Pasang TV tanpa internet/static IP | ✅ Colok WiFi → langsung jalan |

### Yang tetap perlu:

- ✅ TV dan PC harus **satu WiFi / LAN** (sama seperti sebelumnya)
- ✅ Channel name (opsional, default = device ID)

### Verifikasi mDNS bekerja

**Dari PC Owner (PowerShell):**
```powershell
# Lihat semua server yang advertise dirinya
Invoke-RestMethod http://localhost:3000/api/mdns/tvs

# Atau cek dari Windows sendiri
Resolve-DnsName -Name "CommandCenter-win32-3000._commandcenter._tcp.local" -Type ANY
```

**Dari Android TV (logcat):**
```bash
adb logcat -s TVNsdDiscovery:D TVReceiver:D
```
Harusnya muncul:
```
🪄 mDNS auto-discovered server: ws://192.168.1.5:3000/ws
📺 Advertising TV channel='PS5_01' on port 8765
```

### Endpoint monitoring baru

- **`GET /api/mdns/tvs`** — list semua TV yang terdeteksi via mDNS, dengan channel, model, IP, last-seen.

### Troubleshooting mDNS

| Gejala | Solusi |
|--------|--------|
| TV tidak auto-discover server | Pastikan router tidak block multicast. Buka port UDP 5353 + 1900. |
| Server log "[mdns] Failed to advertise" | bonjour-service mungkin tidak support OS ini. TV tetap pakai fallback URL manual. |
| TV show "⏳ searching" terus | Cek WiFi — beda VLAN / AP isolation = multicast tidak lewat |

---

## 🚀 Langkah 1: Build Android TV Receiver APK

### Opsi A: Build dari Android Studio (recommended)
1. Buka Android Studio
2. Pilih **Open** → arahkan ke folder `android-tv-receiver/` di project ini
3. Tunggu Gradle sync selesai (~3 menit pertama kali)
4. Menu **Build → Build Bundle(s) / APK(s) → Build APK(s)**
5. APK akan tersimpan di `app/build/outputs/apk/debug/app-debug.apk`

### Opsi B: Build dari command line
```bash
cd android-tv-receiver
./gradlew assembleDebug
# APK di: app/build/outputs/apk/debug/app-debug.apk
```

---

## 📲 Langkah 2: Install APK ke TV

### Cara 1: ADB (developer-friendly)
1. Di TV Box: **Settings → About → Build Number**, klik 7× untuk enable Developer Mode
2. **Settings → Developer Options**: enable **USB Debugging** dan **Network Debugging**
3. Catat IP TV (Settings → Network → WiFi)
4. Dari PC:
   ```bash
   adb connect <TV-IP>:5555
   adb install -r android-tv-receiver/app/build/outputs/apk/debug/app-debug.apk
   ```

### Cara 2: USB Stick (no ADB needed)
1. Copy APK ke USB flashdisk
2. Colok ke TV Box
3. Buka **File Manager** → navigasi ke USB → klik APK → Install

---

## 🎬 Langkah 3: Jalankan App & Auto-Register

### Yang Terjadi Saat App Dibuka (Otomatis)

1. App resolve **channel name** dari SharedPreferences `tv_channel_name` atau auto-derive dari device ID
2. Buka **WebSocket persistent** ke `ws://<SERVER-IP>:3000`
3. Kirim `IDENTIFY` (clientType: "tv")
4. Subscribe ke channel (mis. `tv:PS5_01`)
5. **Selesai** — TV sekarang terdaftar di server.ts channel registry

### Setup Channel Name (Opsional tapi Direkomendasikan)

Secara default, channel auto-derived dari device ID (mis. `tv:A1B2C3`). **Dengan mDNS auto-discovery, Owner tidak perlu lagi set server URL** — cukup set channel name (kalau mau), atau biarkan default.

Untuk nama yang mudah dibaca, Anda punya **3 cara** (pilih salah satu):

#### 🏆 Cara A — Lewat UI di TV (Paling Mudah, Tanpa ADB)

Cukup buka app **Command Center TV Receiver** di TV. Ada **2 skenario**:

**First launch** (baru install):
- App akan otomatis membuka layar **Settings** — tinggal ketik nama channel pakai remote TV
- Pakai navigasi remote (panah + OK) untuk input text
- Klik **💾 SIMPAN** — selesai!

**Sudah pernah pakai tapi mau ganti nama:**
- Dari MainActivity, klik tombol **"⚙️ Settings (Ubah Channel Name)"**
- Edit nama → klik **💾 SIMPAN** — restart otomatis & reconnect

Layar Settings punya:
- Input **Channel Name** — mis. `TV1-PS3`, `PS5_01`, `SWITCH_03`
- Input **Server URL** — mis. `ws://192.168.1.5:3000` (kalau pindah server)
- **3 tombol**: 💾 Simpan | ❌ Batal | 🔄 Reset
- Validasi otomatis (alfanumerik + dash/underscore saja, server URL harus `ws://`)

#### Cara B — Via ADB (untuk bulk setup sekaligus):
```bash
adb shell run-as com.cmdcenter.tvreceiver \
  sh -c 'mkdir -p shared_prefs && cat > shared_prefs/tv_receiver.xml << EOF
<?xml version="1.0" encoding="utf-8" standalone="yes" ?>
<map>
  <string name="tv_channel_name">PS5_01</string>
  <string name="server_url">ws://192.168.1.5:3000</string>
</map>
EOF'
```

Ganti `PS5_01` dengan nama station Anda (`PS5_02`, `SWITCH_03`, `VIPSIM_05`, dll).

#### Cara C — Edit konstan di MainActivity.kt sebelum compile:
```kotlin
private fun resolveChannelName(): String {
    val prefs = getSharedPreferences("tv_receiver", Context.MODE_PRIVATE)
    val custom = prefs.getString("tv_channel_name", null)
    if (!custom.isNullOrBlank()) return CHANNEL_PREFIX + custom

    // Edit baris ini untuk hardcode nama channel per build TV:
    return CHANNEL_PREFIX + "PS5_01"  // ← GANTI per TV yang berbeda
}
```

### Buka App di TV

1. Buka **Command Center TV Receiver** dari launcher TV
2. **First launch**: layar Settings otomatis muncul → input channel name → SIMPAN
3. App restart, kembali ke MainActivity, langsung connect & subscribe
4. Layar MainActivity sekarang menampilkan:
   ```
   📺 Command Center TV Receiver
   
   📺 Channel: tv:TV1-PS3
   Status: 🟢 Connected & Subscribed
   
   Listening on HTTP port 8765 + WebSocket
   
   [⚙️ Settings (Ubah Channel Name)]
   ```
5. Biarkan app tetap jalan (foreground atau minimize — service WS tetap aktif)

> ✅ **Tidak perlu setting IP TV di server.ts** — server otomatis mendeteksi channel dari IDENTIFY message.

### Buka Settings dari Mana Saja

Anda bisa buka layar Settings dari 3 cara:
1. **Tombol di MainActivity** — klik "⚙️ Settings"
2. **First launch** — otomatis terbuka
3. **ADB langsung**:
   ```bash
   adb shell am start -n com.cmdcenter.tvreceiver/.SettingsActivity
   ```
4. **Dari launcher TV** — kalau terinstall sebagai app kedua (perlu launcher support)

---

## 🔍 Verifikasi Channel Aktif

Cek dari PC apakah TV sudah terdaftar:

### PowerShell / Terminal:
```powershell
# Lihat semua channel aktif (TV yang sedang online)
Invoke-RestMethod http://localhost:3000/api/channels

# Atau via health endpoint (juga return channels)
Invoke-RestMethod http://localhost:3000/api/health
```

**Output yang diharapkan** kalau 1 TV online:
```json
{
  "channels": [
    { "channel": "tv:PS5_01", "subscribers": ["tv"] }
  ],
  "count": 1
}
```

### Test Kirim Command ke Channel:
```powershell
# Publish command via REST (simulasi operator)
$body = @{
  channel = "tv:PS5_01"
  data = @{ command = "power_on" }
} | ConvertTo-Json

Invoke-RestMethod -Method Post `
  -Uri "http://localhost:3000/api/channel/publish" `
  -ContentType 'application/json' `
  -Body $body
```

**Response**:
```json
{
  "ok": true,
  "channel": "tv:PS5_01",
  "recipients": 1,
  "timestamp": 1786290831501
}
```

Kalau `recipients: 0` artinya tidak ada TV yang subscribe ke channel tersebut — cek:
1. App TV sudah jalan
2. WebSocket connected (lihat log `cat /tmp/tv-receiver.log` di TV)
3. Channel name cocok (case-sensitive)

---

## 🎮 Langkah 4: Test dari Operator App

1. Buka browser ke `http://localhost:3000`
2. Login sebagai Owner (PIN: `1234`)
3. Tab **Units** → klik ikon **📺 TV** di header card Station manapun
4. Modal **Kontrol TV** muncul dengan tab:
   - **Perintah TV** — 6 tombol (Power On/Off, Volume ±, Mute/Unmute)
   - **Branding Overlay** — text input, color picker, Show/Hide
5. Klik **"Nyalakan TV"** → TV harusnya wake up
6. Klik **"Volume +"** → volume naik
7. Klik **"Matikan TV"** → TV sleep

**Channel mapping otomatis**: dari `App.tsx` → `stationChannelMap()` → derives channel dari `station.consoleType + station.id` (mis. `tv:PS5_01`).

---

## 🎨 Branding Overlay

Receiver app support overlay nama rental di pojok kanan bawah TV — muncul di atas game / app apapun via `TYPE_APPLICATION_OVERLAY`.

### Trigger dari Operator

1. Tab **Units** → klik 📺 di Station card → tab **"Branding Overlay"**
2. Set text, subtitle, warna → klik **"Tampilkan di Station XX"**
3. Atau buka **Settings → Branding TV Overlay** → klik **Show All** untuk broadcast ke semua TV

### Permission Setup (Sekali di TV)

Overlay butuh `SYSTEM_ALERT_WINDOW` permission:

**Cara 1 — Manual dari TV:**
Settings → Apps → Special Access → Display over other apps → Command Center TV Receiver → Allow

**Cara 2 — Via ADB (recommended):**
```bash
adb shell appops set com.cmdcenter.tvreceiver SYSTEM_ALERT_WINDOW allow
```

### Style Customization

Edit [BrandingOverlayService.kt](android-tv-receiver/BrandingOverlayService.kt) untuk ubah:
- Posisi: default `Gravity.BOTTOM or Gravity.END` → ubah ke `TOP_LEFT`, dll
- Font size: `setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f)` → naikkan untuk lebih besar
- Background opacity: `DEFAULT_BG = "#80000000"` (50% black) → ubah alpha

---

## 🔧 Configuration `server.ts` (Channel-Based)

**Tidak perlu edit `stationUrlMap` lagi.** Channel-based system auto-register.

Tapi Anda perlu **1 konfigurasi** di `MainActivity.kt` sebelum build APK:

```kotlin
// Line ~37 di MainActivity.kt
private const val WS_SERVER_URL = "ws://192.168.1.5:3000"  // ← EDIT IP server.ts Anda
```

Ganti `192.168.1.5` dengan IP PC yang menjalankan `npm run dev`. Cek IP PC Anda:
- Windows: `ipconfig` di PowerShell → lihat IPv4 Address
- Mac/Linux: `ifconfig` atau `ip addr`

> ⚠️ Ini adalah **satu-satunya setting** yang perlu diubah. Tidak ada stationUrlMap atau konfigurasi per TV.

### Opsional: Set Server URL via SharedPreferences (Multi-Lokasi)

Kalau Anda pindahkan server antar laptop, tambahkan fallback:

```kotlin
private fun resolveServerUrl(): String {
    val prefs = getSharedPreferences("tv_receiver", Context.MODE_PRIVATE)
    return prefs.getString("server_url", null) ?: WS_SERVER_URL
}
```

---

## 🔍 Troubleshooting

### TV Tidak Teregister (channel tidak muncul di /api/channels)

1. **Cek WebSocket connection** — lihat logcat:
   ```bash
   adb logcat -s TVReceiver:D
   ```
   Harusnya muncul:
   ```
   [ws] Connecting to ws://...
   [ws] Connected to server
   [ws] Subscribed to channel: tv:PS5_01
   ```

2. **Cek server IP** — pastikan `WS_SERVER_URL` di MainActivity.kt benar. Test dari TV pakai browser:
   ```
   http://<SERVER-IP>:3000/api/health
   ```
   Harusnya return JSON `{status: "ok", ...}`.

3. **Cek firewall** di PC server:
   ```powershell
   # Izinkan port 3000 inbound (Windows Firewall)
   New-NetFirewallRule -DisplayName "Node.js Server" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
   ```

4. **Network unreachable** — pastikan PC & TV di **subnet yang sama**:
   ```
   PC:    192.168.1.5
   TV:    192.168.1.42   ← harus 192.168.1.X juga
   ```

### TV Online Tapi Command Tidak Sampai

1. **Channel name mismatch**:
   - Cek di server: `Invoke-RestMethod http://localhost:3000/api/channels`
   - Bandingkan dengan `WS_SERVER_URL` di TV's SharedPreferences

2. **TV subscribe ke channel berbeda**:
   - Log TV: `adb logcat -s TVReceiver:D` → lihat "[ws] Subscribed to channel: X"
   - Operator publish ke channel yang sama

3. **App TV di background killed** (Android hemat baterai):
   - Settings → Apps → TV Receiver → Battery → Unrestricted

### Branding Overlay Tidak Muncul

1. **`SYSTEM_ALERT_WINDOW` belum di-grant** — lihat Permission Setup di atas
2. **OEM restrict overlay** (Xiaomi/MIUI, Oppo/ColorOS):
   - Settings → Apps → TV Receiver → Other Permissions → Display Pop-up
   - Auto-startup permission juga mungkin perlu di-enable
3. **Service crash** — cek logcat untuk error

### Branding Overlay Tidak Muncul di TV (APK)

1. **`SYSTEM_ALERT_WINDOW` belum di-grant** di TV — lihat bagian Permission Setup di atas
2. **OEM restrict overlay** (Xiaomi/MIUI, Oppo/ColorOS):
   - Settings → Apps → TV Receiver → Other Permissions → Display Pop-up
   - Auto-startup permission juga mungkin perlu di-enable
3. **Service crash** — cek logcat: `adb logcat -s BrandingOverlay:E`

### Beberapa Station Tidak Response

Tiap TV harus punya **channel name unik**. Cek di log TV:
```bash
adb logcat -s TVReceiver:D | grep "Subscribed"
```

Kalau ada 2 TV dengan channel sama, rename salah satu via SharedPreferences.

---

## 📐 Skala Produksi

Untuk 12+ station PlayStation, sistem channel-based sudah **zero-config** — cukup install APK ke semua TV, set channel name masing-masing, done. Tapi beberapa optimasi:

1. **Channel naming convention** — pakai prefix sesuai konsol:
   - `tv:PS5_01`, `tv:PS5_02`, ..., `tv:PS5_06` (PS5 standard)
   - `tv:PS5PRO_07`, `tv:PS5PRO_08` (PS5 Pro)
   - `tv:SWITCH_09`, `tv:SWITCH_10` (Switch)
   - `tv:VIPSIM_11`, `tv:VIPSIM_12` (VIP Sim Rig)

2. **Auto-startup TV app** — pakai tasker/automate untuk buka app tiap pagi:
   ```bash
   adb shell am start -n com.cmdcenter.tvreceiver/.MainActivity
   ```

3. **TV replacement** — kalau TV rusak, tinggal:
   - Install APK ke TV baru
   - Set channel name sama dengan TV lama
   - Server otomatis route ke TV baru

4. **Monitoring UI** (future):
   - GET `/api/channels` sudah ada — return list channel + subscriber count
   - Bisa tambah UI di Settings tab untuk lihat "TV PS5_01: ONLINE" real-time

5. **Native-only mode** — APK adalah satu-satunya TV receiver. Tidak ada fallback web receiver. Semua TV harus punya APK terinstall & terkoneksi ke channel `tv:<nama>`. Sesuai keputusan Owner: prioritas stabilitas di atas fleksibilitas.

---

## 🔒 Fitur Kiosk & Auto-Launch (Production-Ready)

Agar TV benar-benar "tidak bisa diutak-atik" customer, APK ini sudah punya 4 fitur production-grade:

| Fitur | Tujuan | Cara Setup |
|-------|--------|------------|
| **🔒 Kiosk Mode** | Customer tidak bisa exit ke launcher | Toggle di Settings TV (default ON) |
| **🚀 Auto-launch on Boot** | TV restart → app auto-start | `RECEIVE_BOOT_COMPLETED` (default aktif) |
| **🏠 Set as Default Launcher** | Tombol Home remote → kembali ke app | ADB: `cmd package set-home-activity` |
| **🔄 Background Service** | WS tetap hidup walau app ke background | Toggle di Settings TV (default ON) |

### 1. Aktifkan Kiosk Mode (Lock-Task)

Kiosk mode = customer tidak bisa tekan Home, Back, atau buka app lain di TV.

**Cara simple (perlu "Screen pinned" toast sekali):**
1. Di TV, buka app → klik ⚙️ Settings
2. Centang **"Aktifkan mode kiosk"** → 💾 SIMPAN
3. App restart, masuk lock-task otomatis setelah WS connect
4. Customer pencet Home/Back → **tidak ada efek**

**Cara advanced (no toast, production-grade):**
```bash
# 1. Set APK sebagai device owner
adb shell dpm set-device-owner com.cmdcenter.tvreceiver/.AdminReceiver

# 2. (Opsional) Set sebagai default launcher — tombol Home → app kita
adb shell cmd package set-home-activity com.cmdcenter.tvreceiver/.MainActivity
```

Setelah 2 langkah di atas, TV akan **selalu kembali ke receiver app** tiap kali:
- TV di-restart
- Customer tekan tombol Home di remote
- Customer tekan Back berkali-kali
- Buka app lain dari recents

Untuk **un-install** (kalau TV perlu di-reset):
```bash
adb shell dpm remove-active-admin com.cmdcenter.tvreceiver/.AdminReceiver
adb uninstall com.cmdcenter.tvreceiver
```

### 2. Auto-Launch saat TV Boot

Sudah otomatis aktif — `BootReceiver` akan listen `BOOT_COMPLETED` dan launch `MainActivity` 3 detik setelah TV nyala. Tidak perlu konfigurasi tambahan.

Kalau TV restart karena mati listrik tengah malam, **pagi harinya TV sudah otomatis kembali ke receiver app** — operator tidak perlu remote control manual.

### 3. Background Service (Keep-Alive WS)

Default ON. Tanpa ini, customer pencet Home di remote → OS bisa kill MainActivity → WS putus.

Toggle di Settings TV:
- **ON** (recommended) → foreground service notification muncul di status bar (low priority, tidak bunyi). WS tetap hidup.
- **OFF** → WS putus saat app ke background.

### 4. Immersive UI (Sembunyikan Status Bar)

Default ON. Status bar & navigation bar di-hide otomatis. Customer tidak bisa:
- Tarik notifikasi dari atas
- Lihat jam / WiFi indicator
- Buka quick settings

Untuk keluar dari immersive (debugging), tarik dari atas 2× atau pakai ADB:
```bash
adb shell input keyevent KEYCODE_BACK
```

---

## 🎯 Tambah: Kontrol Lebih Lanjut

Anda bisa extend receiver app untuk support lebih banyak perintah:

| Perintah | Android API |
|----------|-------------|
| Buka app (mis. Netflix) | `Intent.setComponent(ComponentName(...))` + `startActivity` |
| Switch HDMI input | `Intent(ACTION_INPUT_METHOD_SETTINGS)` atau CEC via `libcec` |
| Set brightness | `WindowManager.LayoutParams.screenBrightness` |
| Lock screen | `DevicePolicyManager.lockNow()` (perlu Device Admin) |
| Reboot TV | `PowerManager.reboot()` (perlu root + permission) |
| Custom command | Tambah `when (command)` di `MainActivity.handleIncomingCommand()` |

Tambah case baru di `MainActivity.handleIncomingCommand()`, lalu operator publish via:
```typescript
ws.publishToChannel('tv:PS5_01', { command: 'open_youtube' });
```

---

## 📚 Referensi

- [WebSocket Protocol](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API)
- [Channel pattern (Pusher docs)](https://pusher.com/docs/channels/)
- [Android PowerManager](https://developer.android.com/reference/android/os/PowerManager)
- [Android AudioManager](https://developer.android.com/reference/android/media/AudioManager)
- [Android SYSTEM_ALERT_WINDOW](https://developer.android.com/reference/android/Manifest.permission#SYSTEM_ALERT_WINDOW)
- [ADB Wireless Debugging](https://developer.android.com/studio/command-line/adb#wireless)

---

**Happy commanding! 🎮📺**

Channel-based system ini adalah standar industri (Pusher/Ably/Socket.IO Rooms). TV Anda sekarang **benar-benar plug-and-play** — colok WiFi, buka app, langsung terdaftar.

Untuk pertanyaan, lihat:
- [android-tv-receiver/MainActivity.kt](android-tv-receiver/MainActivity.kt) — TV receiver logic
- [android-tv-receiver/BrandingOverlayService.kt](android-tv-receiver/BrandingOverlayService.kt) — overlay service
- [android-tv-receiver/BootReceiver.kt](android-tv-receiver/BootReceiver.kt) — auto-launch on boot
- [android-tv-receiver/ReceiverKeepAliveService.kt](android-tv-receiver/ReceiverKeepAliveService.kt) — WS persistence
- [server.ts](server.ts) — channel registry & WebSocket handlers
- [server-tv-adapter-channel.ts](server-tv-adapter-channel.ts) — channel publisher
- [src/hooks/useWebSocketTimer.ts](src/hooks/useWebSocketTimer.ts) — frontend WS client
- [src/components/TVControlPanel.tsx](src/components/TVControlPanel.tsx) — operator UI

> **Mode TV Receiver:** APK Native Android TV saja (tidak ada web fallback). Owner
> memutuskan APK-only demi stabilitas. Semua 12 TV harus install APK + subscribe
> ke channel masing-masing.