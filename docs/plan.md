# Command Center — Plan & Techstack

> Dokumen ringkasan arsitektur, techstack, dan fitur aplikasi **Command Center** — sistem manajemen rental PlayStation / gaming lounge yang berjalan **fully offline** di jaringan lokal (LAN) tanpa layanan cloud.

---

## 1. Ringkasan

Command Center adalah aplikasi kasir & pusat kendali untuk rental gaming. Operator menjalankan satu server Node.js di PC lokal yang sekaligus melayani REST API, WebSocket, dan frontend React dari satu port (`:3000`). Setiap station bermain dipetakan ke sebuah Android TV Box yang menjalankan APK "TV Receiver" untuk menerima perintah kontrol (power/volume/mute) dan menampilkan branding overlay secara real-time.

**Tidak diperlukan API key maupun koneksi internet.** Semua komunikasi terjadi di LAN/WiFi lokal.

---

## 2. Techstack

### 2.1 Frontend (Operator App)

| Teknologi | Versi | Peran |
| --- | --- | --- |
| React | 19.0.1 | UI library (SPA) |
| TypeScript | 5.8.2 | Type safety |
| Vite | 6.2.3 | Bundler & dev server |
| Tailwind CSS | 4.1.14 | Styling utility-first |
| lucide-react | 0.546.0 | Ikon |
| motion | 12.23.24 | Animasi (Framer Motion) |
| @fontsource/* | — | Font lokal (Inter, JetBrains Mono, Material Symbols) tanpa CDN |

Struktur direktori `src/`:
- `App.tsx` — komponen utama, state global, routing tab, integrasi WebSocket.
- `components/` — komponen per-fitur (StationCard, NewSessionModal, TVControlPanel, AttendancePage, SettingsTab, dsb).
- `data/` — seed data (`mockData.ts`, `authData.ts`).
- `hooks/` — `useWebSocketTimer.ts` (client WebSocket + timer sinkronisasi server).
- `utils/` — `pinCrypto.ts` (hash PIN), `revenueUtils.ts`, `tvChannels.ts`, `tvPairing.ts`.
- `types.ts` — definisi tipe bersama.

### 2.2 Backend (Server)

| Teknologi | Versi | Peran |
| --- | --- | --- |
| Node.js | 18+ | Runtime |
| Express | 4.21.2 | REST API |
| TypeScript | 5.8.2 | Type safety |
| tsx | 4.21.0 | Menjalankan `server.ts` saat dev |
| esbuild | 0.25.0 | Bundle server untuk produksi |
| ws | 8.21.3 | WebSocket server (protokol custom) |
| bonjour-service | 1.4.4 | mDNS/DNS-SD auto-discovery |
| @electric-sql/pglite | 0.5.4 | PostgreSQL embedded (WASM) |
| cross-env | 10.1.0 | Variabel env lintas OS |

File server utama:
- `server.ts` — entry point: Express + WebSocket + semua endpoint & handler.
- `server-db.ts` — lapisan persistensi PGlite (schema, upsert, load/save, backup/restore, migrasi JSON lama).
- `server-mdns.ts` — advertise & browse mDNS (`_commandcenter._tcp.local`, `_tvreceiver._tcp.local`).
- `server-tv-adapter-channel.ts` — publisher perintah ke channel TV.
- `db-cli.ts` — CLI untuk info/export/import/reset database.

### 2.3 Database

**PGlite** — PostgreSQL lengkap yang dikompilasi ke WebAssembly, berjalan in-process tanpa server eksternal. Data tersimpan di direktori `data-server/pg`.

Tabel:
| Tabel | Isi |
| --- | --- |
| `stations` | Data station & sesi aktif (`current_session` JSONB) |
| `transactions` | Riwayat transaksi |
| `vips` | Data member VIP |
| `employees` | Akun karyawan + PIN hash |
| `permissions` | Izin per-fitur tiap user |
| `settings` | Pengaturan toko & tarif (key/value JSONB) |
| `tv_pairings` | Pemetaan `stationId → tvChannel` |

Fitur persistensi:
- Semua mutasi pakai `UPSERT` atomik dalam transaksi.
- Migrasi otomatis dari file JSON lama (`.bak`) saat pertama start.
- Backup/restore via REST (`/api/admin/backup`, `/api/admin/restore`) dan CLI (`db:export`, `db:import`).

### 2.4 Android TV Receiver (APK)

| Teknologi | Versi | Peran |
| --- | --- | --- |
| Kotlin | 1.9.24 | Bahasa aplikasi |
| Android Gradle Plugin (AGP) | 8.7.3 | Build system |
| compileSdk / targetSdk | 34 | — |
| minSdk | 21 (Android 5.0) | Kompatibilitas TV box lama |
| OkHttp | 4.12.0 | WebSocket client |
| kotlinx-coroutines | 1.7.3 | StateFlow / concurrency |
| androidx.leanback | 1.0.0 | Tema Leanback untuk Android TV |
| androidx.core-ktx / appcompat | 1.12.0 / 1.6.1 | AndroidX |
| NsdManager (native) | — | mDNS discovery & advertise |

Struktur `android-tv-receiver/app/src/main/java/com/cmdcenter/tvreceiver/`:
- `MainActivity.kt` — UI, auto-connect, resolve channel.
- `TvConnectionService.kt` — foreground service STICKY pemilik WebSocket & state machine.
- `BrandingOverlayService.kt` — overlay branding di pojok layar.
- `TimeUpOverlayService.kt` — overlay "WAKTU HABIS" full-screen + beep.
- `NsdDiscovery.kt` — mDNS browse & register.
- `BootReceiver.kt` — auto-launch saat TV boot.
- `ReceiverKeepAliveService.kt` — menjaga WebSocket tetap hidup.
- `AdminReceiver.kt` — Device Admin (kiosk/lock-task).
- `SettingsActivity.kt` — input channel name & server URL.

---

## 3. Arsitektur

```
┌─────────────────────┐   WebSocket/REST    ┌──────────────────────┐   WebSocket    ┌──────────────────┐
│  Operator App       │ ◄─────────────────► │  server.ts (Node)    │ ◄─────────────► │  Android TV Box  │
│  (React + Vite)     │   IDENTIFY/SUBSCRIBE│  - Express REST      │   CHANNEL_MSG   │  (Receiver APK)  │
│  [Browser]          │   /PUBLISH          │  - Channel Registry  │                 │  mDNS discovery  │
└─────────────────────┘                     │  - PGlite DB         │                 └──────────────────┘
                                            └──────────────────────┘
```

Tiga layer komunikasi:
1. **Operator → Server**: WebSocket `PUBLISH` ke channel (`tv:PS5_01`) atau REST (`POST /api/...`).
2. **Server → TV**: WebSocket `CHANNEL_MESSAGE` di-routing per channel.
3. **TV → Hardware**: Android API (`PowerManager`, `AudioManager`, `WindowManager`).
4. **Discovery**: mDNS saling temukan (`_commandcenter._tcp.local` ↔ `_tvreceiver._tcp.local`).

---

## 4. Fitur

### 4.1 Dashboard & Unit (Monitoring Real-Time)
- Pantau status tiap station: `available` / `occupied` / `warning` / `maintenance`.
- Update real-time via WebSocket (timer sinkron server).
- Statistik per station: total sesi & revenue hari ini.

### 4.2 Manajemen Sesi Bermain
- **Fixed duration** & **Main Bebas** (bayar di akhir).
- **Extend** durasi sesi.
- **Pindah station** (`MoveSessionModal`) — sesi dipindah antar unit.
- Pembayaran: **QRIS / Cash / Debit / E-Wallet**.
- Status pembayaran: `Lunas` / `Belum Lunas` / `Paid` / `Pending` (toggle & pelunasan hutang).
- **Struk digital** (`ReceiptModal`) dengan nomor struk otomatis (`NEX-YYYYMMDD-XXXX`).
- Riwayat transaksi (`HistoryTab`) dengan filter & pencarian.

### 4.3 Karyawan, Absensi & Gaji
- **Login PIN** (hash **SHA-256** via Web Crypto, disimpan sebagai `sha256:<hex>`).
- Role: **Owner** & **Karyawan** dengan izin per-fitur (`dashboard`, `units`, `history`, `users`, `settings`, `absensi`, `new_session`).
- Manajemen izin lewat `PermissionManagerModal`.
- **Clock-in/out** per hari kalender (`AttendancePage`, `AttendanceSelfCard`).
- **Rekap gaji bulanan** (periode tgl 25 → 24 bulan berikutnya): uang makan (Rp 10.000 × hari hadir) + profit share (25% × revenue yang ditangani).

### 4.4 Kontrol Android TV
- **Power** on/off, **volume** up/down, **mute/unmute** dari UI operator (`TVControlPanel`).
- **Branding overlay** — teks/subtitle/warna di pojok layar TV, per-station atau broadcast semua TV.
- **Pairing channel per station** (`stationId → tvChannel`, mis. `tv:PS5_01`).
- **mDNS auto-discovery** — TV otomatis menemukan server tanpa set IP manual.
- **Presence detection** (`/api/tv/presence`) & **claim/unclaim channel** (anti-bentrok 2 TV).
- **Tamper detection** (anti-fraud) — alert bila TV disconnect saat sesi aktif.
- **Kiosk mode / lock-task**, auto-launch on boot, default launcher, background service keep-alive.

### 4.5 Database Lokal & Backup
- PGlite embedded — tanpa setup eksternal.
- Backup/restore JSON via REST dan CLI.
- Reset database (`db:reset` / `db:fresh`).

### 4.6 VIP Membership
- Member dengan tier: `Cyber Elite` / `Platinum` / `Gold` / `Standard` (+ `Bronze` default di DB).
- Pencatatan jam bermain, loyalty points, total pengeluaran.
- Link VIP ke sesi saat start (`vipId`).

### 4.7 Pengaturan (Settings)
- Nama toko, alamat, tarif per tipe konsol (PS3/PS4/PS5/PS5 Pro/Switch/VIP Sim Rig).
- Toggle suara, TV auto-power, branding config.

---

## 5. REST API

| Method | Endpoint | Fungsi |
| --- | --- | --- |
| GET | `/api/state` | Snapshot seluruh state (stations, transactions, vips, dll.) |
| GET | `/api/stations` | List station |
| POST | `/api/stations/add` / `update` / `delete` / `clear` | CRUD station |
| POST | `/api/stations/move-session` | Pindah sesi antar station |
| POST | `/api/sessions/start` | Mulai sesi |
| POST | `/api/sessions/end-fixed` / `end-main-bebas` | Akhiri sesi |
| POST | `/api/transactions/toggle-payment` | Toggle status bayar |
| POST | `/api/transactions/delete` | Hapus transaksi |
| POST | `/api/vips/add` | Tambah VIP |
| POST | `/api/tv-control` | Kirim perintah TV (power/volume/mute) |
| POST | `/api/tv-branding` | Set branding overlay |
| POST | `/api/channel/publish` | Publish pesan ke channel TV |
| GET | `/api/channels` | List channel aktif + subscriber |
| POST | `/api/tv/presence` | Cek apakah channel live |
| GET/POST | `/api/tv/pairings` | List/simpan pemetaan station↔channel |
| POST/GET/DELETE | `/api/tv/pair` | Claim/list/release channel TV |
| GET | `/api/mdns/tvs` | List TV terdeteksi via mDNS |
| GET | `/api/admin/backup` / `backup-info` | Backup JSON |
| POST | `/api/admin/restore` | Restore dari backup |
| GET | `/api/health` | Health check + channels |

## 6. WebSocket Protocol

Protokol berbasis pesan JSON pada `ws://<host>:3000/ws`.

**Pesan TV (`clientType: "tv"`)**
- `IDENTIFY` — daftar sebagai TV.
- `SUBSCRIBE` / `UNSUBSCRIBE` — gabung/keluar channel (`tv:PS5_01`, `tv:all`).
- `PUBLISH` / `CHANNEL_LIST` — publish & daftar channel.
- `TV_HEARTBEAT` — heartbeat (anti-timeout).
- `TV_COMMAND_ACK` — ack anti-fraud dari TV.

**Pesan Operator (`clientType: "operator"`)**
- `REQUEST_SYNC` — minta sinkronisasi state.
- `START_SESSION`, `END_SESSION`, `EXTEND_SESSION`
- `END_MAIN_BEBAS_SESSION`, `END_FIXED_SESSION`
- `SET_STATION_STATUS`
- `TOGGLE_PAYMENT_STATUS`, `DELETE_TRANSACTIONS`
- `ADD_VIP`, `ADD_STATION`, `UPDATE_STATION`, `DELETE_STATION`
- `MOVE_SESSION`
- `TV_CONTROL`, `TV_BRANDING`

---

## 7. Menjalankan

```bash
npm install
npm run dev          # dev: tsx server.ts (http://localhost:3000)
npm run build        # build frontend + bundle server ke dist/
npm start            # produksi
npm run lint         # type-check tsc --noEmit
```

Perintah database: `npm run db:info` · `db:export` · `db:import <file>` · `db:fresh <file>` · `db:reset`.

Build APK TV: `cd android-tv-receiver && ./gradlew :app:assembleDebug`.
