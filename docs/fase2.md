Fase 2: Setup Aplikasi Android TV (Agent Kiosk)

Target: Aplikasi TV berjalan di background, otomatis mendaftarkan diri, dan dapat merespons perintah kontrol layar/suara.

    Konfigurasi Manifest & Permissions:

        Tambahkan izin: RECEIVE_BOOT_COMPLETED, WAKE_LOCK, INTERNET, ACCESS_NETWORK_STATE, dan SYSTEM_ALERT_WINDOW.

    Layar Setup Awal (Input Identifier - Executed 1x):

        Buat UI sederhana untuk menginput nomor unit (misal: TV-01).

        Simpan string ini ke SharedPreferences / DataStore secara permanen.

    Pencarian Server via mDNS & Auto-Connect:

        Gunakan NsdManager (Android Native) atau library mDNS Kotlin untuk me-resolve domain rental-server.local.

        Hubungkan socket.io-client-java ke IP server yang ditemukan, lalu kirim payload REGISTER_DEVICE beserta unit_id.

    Implementasi Foreground Service & Boot Receiver:

        Buat BroadcastReceiver yang mendengarkan BOOT_COMPLETED agar service otomatis aktif saat TV menyala setelah mati listrik.

        Jalankan koneksi Socket di dalam Foreground Service bertipe shortService / connectedDevice agar OS Android TV tidak membekukan (freeze) aplikasi.

    Handling Perintah Real-time (Screen & Kiosk Lock):

        Saat Terima COMMAND_WAKE_AND_START:

            Panggil PowerManager.WakeLock untuk menyalakan layar seketika.

            Set window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON).

            Sembunyikan Kiosk Lock Screen dan tampilkan UI Game / Timer HUD.

        Saat Terima COMMAND_LOCK_AND_SLEEP (Waktu Habis):

            Hapus flag FLAG_KEEP_SCREEN_ON.

            Tampilkan Full Screen Kiosk Overlay (layar hitam/iklan yang mengunci input stik PS).