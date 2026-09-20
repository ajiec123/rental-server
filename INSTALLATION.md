# Installation Guide — Command Center

Panduan instalasi untuk **komputer baru (server operator)** dan **Android TV baru (per unit)**.

Sistem ini berjalan **sepenuhnya offline di jaringan lokal (LAN/WiFi)** — tanpa internet, tanpa API key, tanpa cloud.

---

## 1. Arsitektur Singkat

```
┌─────────────────────┐   WebSocket + REST    ┌──────────────────────┐
│  Operator App       │ ◄───────────────────► │  Server (PC operator) │
│  (browser di PC)    │   port 3000           │  Node.js              │
└─────────────────────┘                       └──────────┬───────────┘
                                                         │ WebSocket
                                                         │ (auto-discovery)
                                              ┌──────────▼───────────┐
                                              │  Android TV (per unit)│
                                              │  Receiver APK         │
                                              └───────────────────────┘
```

- **Server** = komputer kasir (PC Windows/Linux/Mac).
- **TV** = Android TV / TV box per unit, menjalankan APK receiver.
- TV **otomatis menemukan server** lewat UDP broadcast + mDNS (zero-setup, tanpa isi IP).

---

## 2. Prasyarat

### Komputer Operator (Server)
- **Node.js 18+** (unduh di https://nodejs.org)
- Sistem operasi: Windows / Linux / macOS
- Koneksi ke **WiFi/LAN yang sama** dengan semua TV

### Android TV (per unit)
- Android TV / TV box **Android 5.0 (API 21) ke atas**
- Terhubung ke **WiFi yang sama** dengan komputer operator

---

## 3. Instalasi Server (Komputer Operator)

### 3.1 Install Node.js

1. Unduh & install Node.js 18+ dari https://nodejs.org (pilih LTS).
2. Cek lewat terminal/Command Prompt:
   ```bash
   node -v
   npm -v
   ```

### 3.2 Salin project & install dependency

```bash
cd command-center
npm install
```

### 3.3 Jalankan server

**Mode development (untuk uji coba):**
```bash
npm run dev
```

**Mode produksi (untuk rental berjalan):**
```bash
npm run build
npm start
```

### 3.4 Akses aplikasi operator

Buka salah satu alamat berikut di browser:

| URL | Keterangan |
| --- | --- |
| `http://localhost:3000` | Dari komputer server itu sendiri |
| `http://<IP-PC>:3000` | Dari perangkat lain di LAN (cek IP PC dengan `ipconfig`) |
| `http://rental-server.local:3000` | Alias mDNS (biasanya jalan di Windows) |

> **Penting:** server harus **tetap berjalan** (jangan tutup terminal) selama rental beroperasi.

### 3.5 Login

| Role | Username | PIN |
| --- | --- | --- |
| Owner | `owner-rental` | `681232` |
| Karyawan | `rian` | `123456` |
| Karyawan | `maya` | `234567` |
| Karyawan | `dimas` | `345678` |

> Ganti PIN & tambah karyawan lewat menu **Users** setelah login Owner.

---

## 4. Instalasi Android TV (per unit)

### 4.1 Siapkan APK

Build APK (di komputer server, perlu Android SDK/Gradle):
```bash
cd android-tv-receiver
./gradlew :app:assembleDebug
```
Hasil: `android-tv-receiver/app/build/outputs/apk/debug/app-debug.apk`

### 4.2 Install APK ke TV

**Cara A — USB flashdisk (paling mudah, tanpa ADB):**
1. Copy `app-debug.apk` ke flashdisk.
2. Colok flashdisk ke TV.
3. Buka file APK lewat file manager TV → klik install → izinkan "Install from unknown sources".

**Cara B — ADB over WiFi (butuh developer mode):**
```bash
# Aktifkan Developer Options + USB/Network Debugging di TV, lalu:
adb connect <IP-TV>:5555
adb install -r app-debug.apk
adb shell appops set com.cmdcenter.tvreceiver SYSTEM_ALERT_WINDOW allow
```

### 4.3 Set Nomor Station (sekali per TV)

1. Buka app **Command Center TV Receiver** di TV.
2. Buka **Settings**:
   ```
   adb shell am start -n com.cmdcenter.tvreceiver/.SettingsActivity
   ```
   (atau: saat pertama kali app dibuka tanpa nomor, Settings terbuka otomatis)
3. Isi **Nomor Station (1-99)** sesuai unit-nya, lalu **Simpan**.
   - TV di unit 1 → `1`
   - TV di unit 7 → `7`
   - dst.

4. Nomor ini **tersimpan permanen** — TV mati listrik pun tidak perlu di-set ulang.

### 4.4 Verifikasi koneksi

Setelah Simpan, TV otomatis:
1. Menemukan server (UDP discovery).
2. Connect WebSocket.
3. Subscribe channel `tv:STATION_XX`.

Di aplikasi operator, station yang nomornya sama akan menunjukkan status **"TV Connected"**.

---

## 5. Cara Kerja Pemetaan (Zero-Setup)

Tidak perlu pairing manual. Pemetaan otomatis lewat **nomor**:

```
TV diberi nomor "7"  →  subscribe channel "tv:STATION_07"
Station "Station 07"  →  server kirim ke channel "tv:STATION_07"
                          → match otomatis
```

- Nomor di TV harus **sama** dengan nomor unit station di aplikasi operator.
- Satu TV = satu nomor = satu station.
- Kalau dua TV memakai nomor yang sama, TV kedua akan ditolak (anti-bentrok).

---

## 6. Setup Tambahan (opsional tapi disarankan)

### 6.1 Auto-start saat TV dinyalakan (matikan listrik)

**Mi TV (Xiaomi):** aktifkan **Auto-start** di:
```
Settings → Apps → Command Center TV Receiver → Permissions → Auto-start (Startup)
```

**TV lain (TCL, dsb.):** umumnya `BOOT_COMPLETED` sudah jalan otomatis tanpa langkah ekstra.

### 6.2 Overlay "WAKTU HABIS" (layar gelap saat sesi habis)

Butuh izin overlay (sudah di-set saat install via ADB di atas). Tanpa device-owner, overlay inilah yang "mematikan" layar (gelap penuh setelah 1 menit).

### 6.3 Matikan layar TV secara fisik (screen off sesungguhnya)

Butuh **device-owner** (kiosk). Pada Android 11+ yang sudah ter-setup, ini butuh factory reset + provisioning:
```bash
# Setelah factory reset, sebelum setup wizard selesai:
adb shell dpm set-device-owner com.cmdcenter.tvreceiver/.AdminReceiver
```
Tanpa ini, fallback-nya adalah overlay layar hitam (bukan backlight mati).

### 6.4 Backup database

```bash
npm run db:export          # export ke JSON
npm run db:import <file>   # restore
```

---

## 7. Troubleshooting

| Gejala | Penyebab / Solusi |
| --- | --- |
| TV tidak muncul di operator ("TV Belum Terhubung") | Pastikan TV & PC di WiFi yang sama. Coba klik **Connect** di station. |
| Perintah station tidak sampai ke TV | Nomor TV ≠ nomor station. Set nomor TV sesuai station. |
| Warning "tidak ada TV tersubscripsi" | TV belum subscribe channel itu. Cek nomor TV / pairing. |
| TV berubah "Offline" padahal konek | WiFi TV putus-nyambung. Atau server di-restart. Tunggu beberapa detik. |
| App operator tidak bisa dibuka | Server belum jalan. Jalankan `npm run dev` / `npm start`. |

---

## 8. Perintah Penting

| Perintah | Deskripsi |
| --- | --- |
| `npm run dev` | Jalankan server (development) |
| `npm run build` | Build produksi |
| `npm start` | Jalankan server (produksi) |
| `npm run lint` | Type-check |
| `npm run db:export` | Backup database ke JSON |
| `npm run db:import <file>` | Restore database |
| `npm run db:reset` | Reset database |

---

## 9. Ringkasan Alur Fresh Install

1. **PC**: install Node.js → `npm install` → `npm run dev`.
2. **Buka** `http://localhost:3000` → login Owner (`owner-rental` / `681232`).
3. **TV (tiap unit)**: install APK → set **Nomor Station** → Simpan.
4. **Selesai.** TV auto-connect, station auto-match.
