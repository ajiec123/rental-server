package com.cmdcenter.tvreceiver

import android.app.admin.DeviceAdminReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import android.widget.Toast

/**
 * AdminReceiver — diperlukan agar APK ini bisa di-set sebagai **device
 * owner** (administrator) lewat ADB:
 *
 *   adb shell dpm set-device-owner com.cmdcenter.tvreceiver/.AdminReceiver
 *
 * Setelah jadi device owner, app ini bisa:
 *   1. setLockTaskPackages() — whitelist app yang boleh di-lock-task
 *   2. Menjalankan kiosk mode tanpa "screen pinned" toast
 *   3. Mengontrol power / disable keyguard / dll (advanced)
 *
 * Untuk rental PS5 use case, opsional tapi sangat direkomendasikan.
 * Tanpa ini, lock-task mode tetap jalan tapi ada toast "Screen pinned"
 * yang muncul tiap kali customer restart app.
 *
 * Untuk un-install, device owner harus di-uninstall dulu:
 *   adb shell dpm remove-active-admin com.cmdcenter.tvreceiver/.AdminReceiver
 *   adb uninstall com.cmdcenter.tvreceiver
 *
 * Receiver ini WAJIB di-deklarasikan di AndroidManifest.xml dengan
 * permission BIND_DEVICE_ADMIN + meta-data device_admin (lihat manifest).
 */
class AdminReceiver : DeviceAdminReceiver() {

    companion object {
        private const val TAG = "TVAdminReceiver"
    }

    override fun onEnabled(context: Context, intent: Intent) {
        Log.i(TAG, "✅ Device owner enabled — kiosk mode available")
        Toast.makeText(context, "Device owner enabled", Toast.LENGTH_SHORT).show()
    }

    override fun onDisableRequested(context: Context, intent: Intent): CharSequence? {
        // Tampilkan konfirmasi ke user sebelum disable
        return "Disable device owner? Kiosk mode will be turned off."
    }

    override fun onDisabled(context: Context, intent: Intent) {
        Log.i(TAG, "Device owner disabled")
        Toast.makeText(context, "Device owner disabled", Toast.LENGTH_SHORT).show()
    }
}
