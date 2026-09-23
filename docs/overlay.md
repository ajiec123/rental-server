### **Arsitektur Ringkas Virtual Sleep**

```
                     [ Event WebSocket Diterima ]
                                  │
           ┌──────────────────────┴──────────────────────┐
           ▼                                             ▼
 [ Event: STOP_SESSION / LOCK ]               [ Event: START_SESSION / WAKE ]
           │                                             │
 1. KeepScreenOn = FALSE                        1. WakeLock (ACQUIRE_CAUSES_WAKEUP)
 2. ScreenBrightness = 0.1f (10%)               2. KeepScreenOn = TRUE
 3. Audio = MUTE                                3. ScreenBrightness = NORMAL (100%)
 4. Intercept Key Event = TRUE                  4. Audio = UNMUTE
 5. Show Branded Overlay (Galaxy PS)            5. Intercept Key Event = FALSE
                                                6. Hide Branded Overlay

```

---

### **Implementation Roadmap & Checklist To-Dos**

#### **Fase 1: Layout & Visual Asset (Branded Overlay UI)**

* **Target:** Menyiapkan UI layar penuh dengan tema **Galaxy PlayStation** yang menarik, dinamis, dan aman dari efek *burn-in* layar TV.

* [ ] **1.1. Buat Layout Overlay (`res/layout/xml_branded_overlay.xml` atau Canvas/WebView)**
* Atur kontainer utama dengan background warna *Deep Space* (`#0A0E17`).
* Tambahkan teks utama: **"GALAXY PLAYSTATION"** menggunakan gaya font futuristik/neon glowing.
* Tambahkan komponen dinamis: Teks Nomor Unit (misal: `[ TV - 01 ]`) dan petunjuk *"Hubungi Kasir untuk Memulai Sewa"*.


* [ ] **1.2. Tambahkan Animasi Pencegah *Burn-In***
* Tambahkan animasi halus pada elemen visual (misal: pendar pendar neon *breathing effect* atau pergerakan simbol stik PS / partikel bintang yang bergerak perlahan).
* *Tujuan:* Memastikan titik piksel layar TV (terutama panel OLED/LED) selalu berganti posisi saat TV ditinggal *idle* dalam durasi lama.



---

#### **Fase 2: State Manager & System Power Control (Kotlin)**

* **Target:** Membuat controller khusus di Android TV untuk mengatur kecerahan layar, audio, dan flag sistem OS saat transisi *Lock/Unlock*.

* [ ] **2.1. Buat Class `VirtualSleepManager.kt**`
* Buat fungsi `applyVirtualSleep()` dan `applyVirtualWake()`.


* [ ] **2.2. Logika `applyVirtualSleep()` (Masuk Mode Sleep/Terkunci)**
* **Kecerahan Layar:** Set kecerahan layar ke paling redup (10% / `0.1f`).
```kotlin
val lp = window.attributes
lp.screenBrightness = 0.1f
window.attributes = lp

```

* **Mute Audio:** Mute suara TV menggunakan `AudioManager.STREAM_MUSIC`.
* **Izinkan Screen Timeout OS:** Hapus flag `FLAG_KEEP_SCREEN_ON` agar fitur *Auto Power Down / Sleep* 5 menit bawaan TV tetap bisa mematikan panel fisik secara alami jika TV menganggur lama.
```kotlin
window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

```




* [ ] **2.3. Logika `applyVirtualWake()` (Membangunkan / Start Session)**
* **Membangunkan Layar Fisik (WakeLock):** Panggil `PowerManager.WakeLock` dengan flag `ACQUIRE_CAUSES_WAKEUP` agar jika TV fisik sedang tidur (setelah 5 menit auto-sleep bawaan TV), panel TV langsung menyala kembali.
```kotlin
val wakeLock = powerManager.newWakeLock(
    PowerManager.FULL_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP,
    "RentalApp::WakeLock"
)
wakeLock.acquire(3000)

```


* **Kecerahan & Audio Normal:** Kembalikan kecerahan layar ke 100% dan *unmute* audio TV.
* **Cegah TV Sleep Saat Bermain:** Pasang flag `FLAG_KEEP_SCREEN_ON` agar layar tidak mati selama durasi sewa berlangsung.
```kotlin
window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

```





---

#### **Fase 3: Input Interception / Kiosk Lock (Penjaga Remote & Stik)**

* **Target:** Mengunci akses TV saat *Virtual Sleep* aktif agar pelanggan tidak bisa menekan tombol *Back*, *Home*, atau *D-Pad* untuk keluar dari layar branding.

* [ ] **3.1. Override `dispatchKeyEvent` pada Activity Utama**
* Buat variabel *flag* penanda `isVirtualSleepActive: Boolean`.
* Intercept seluruh event tombol masuk saat `isVirtualSleepActive == true`:
```kotlin
override fun dispatchKeyEvent(event: KeyEvent): Boolean {
    if (isVirtualSleepActive) {
        // Abaikan semua input tombol dari remote / stik PS
        return true 
    }
    return super.dispatchKeyEvent(event)
}

```




* [ ] **3.2. Penanganan Window Overlay (`SYSTEM_ALERT_WINDOW`)**
* Tampilkan Overlay di atas seluruh layer sistem Android menggunakan flag `TYPE_APPLICATION_OVERLAY`.



---

#### **Fase 4: Integrasi Event WebSocket & Pengujian**

* **Target:** Mengubungkan `VirtualSleepManager` ke *listener* Socket.io dan menguji performa layarnya.

* [ ] **4.1. Binding Event WebSocket**
* Saat menerima event WebSocket `STOP_SESSION` / `LOCK_TV` $\rightarrow$ panggil `applyVirtualSleep()`.
* Saat menerima event WebSocket `START_SESSION` / `UNLOCK_TV` $\rightarrow$ panggil `applyVirtualWake()`.


* [ ] **4.2. Pengujian Transisi Layar**
* Kirim sinyal *Lock* dari server $\rightarrow$ Verifikasi UI berganti ke wallpaper Galaxy PS, redup 10%, dan suara ter-mute.


* [ ] **4.3. Pengujian Auto-Sleep 5 Menit Bawaan TV**
* Biarkan TV pada posisi *Virtual Sleep* selama 5 menit.
* Pastikan backlight panel TV fisik mati secara alami.
* Kirim sinyal *Start Session* dari kasir $\rightarrow$ Verifikasi layar TV fisik langsung terbangun seketika dan menampilkan game.