# Command Center

Aplikasi manajemen rental PlayStation / gaming lounge — fully offline, berjalan sepenuhnya di jaringan lokal (LAN) tanpa layanan cloud.

## Fitur

- **Dashboard & Unit**: pantau status station (available / occupied / warning / maintenance) secara real-time via WebSocket.
- **Sesi bermain**: Fixed duration & Main Bebas, extend, pindah station, pembayaran (QRIS / Cash / Debit / E-Wallet), struk & riwayat transaksi.
- **Karyawan & absensi**: login PIN (hash SHA-256), role Owner/Karyawan dengan permission per-fitur, clock-in/out, rekap gaji bulanan.
- **Kontrol Android TV**: power/volume/mute, branding overlay, pairing channel per station, auto-discovery via mDNS, presence & tamper detection (anti-fraud).
- **Database lokal**: PGlite (PostgreSQL embedded) di `data-server/`, backup/restore JSON.

## Menjalankan

Prasyarat: Node.js 18+.

```bash
npm install
npm run dev
```

Buka http://localhost:3000 — REST API, WebSocket, dan frontend dilayani dari satu port.

Tidak diperlukan API key atau koneksi internet.

## Perintah lain

| Perintah | Deskripsi |
| --- | --- |
| `npm run build` | Build frontend (Vite) + bundle server (esbuild) ke `dist/` |
| `npm start` | Jalankan server produksi dari `dist/server.cjs` |
| `npm run lint` | Type-check TypeScript (`tsc --noEmit`) |
| `npm run db:info` | Info database + jumlah baris per tabel |
| `npm run db:export` | Export database ke JSON backup |
| `npm run db:import <file>` | Import/restore dari JSON backup |
| `npm run db:fresh <file>` | Drop semua tabel lalu import |
| `npm run db:reset` | Drop semua tabel (dibuat ulang saat server start) |

## Integrasi Android TV

Lihat [SETUP_ANDROID_TV.md](SETUP_ANDROID_TV.md) untuk setup TV receiver (APK companion, mDNS auto-discovery, pairing channel, dan troubleshooting).
