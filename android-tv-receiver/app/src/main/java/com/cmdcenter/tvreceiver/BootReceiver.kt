package com.cmdcenter.tvreceiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log

/**
 * BootReceiver — fires on BOOT_COMPLETED (or QUICKBOOT_POWERON on some OEMs)
 * and launches MainActivity so the TV receiver is always up when the TV
 * turns on.
 *
 * Without this, after a power outage or nightly reboot, the TV would sit
 * at the Android TV home screen with no WebSocket connection to the
 * Command Center — sessions would silently fail.
 *
 * Permission: requires android.permission.RECEIVE_BOOT_COMPLETED
 * (declared in AndroidManifest.xml).
 *
 * For Android TV, you can also enable "Launch this app on TV start" via:
 *   Settings → Apps → Command Center TV Receiver → Open by default
 * but BOOT_COMPLETED is the universal fallback that works on every device.
 */
class BootReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "TVBootReceiver"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        Log.i(TAG, "Boot signal received: $action")

        when (action) {
            Intent.ACTION_BOOT_COMPLETED,
            "android.intent.action.QUICKBOOT_POWERON",
            "com.htc.intent.action.QUICKBOOT_POWERON" -> {
                launchMainActivity(context)
            }
            Intent.ACTION_LOCKED_BOOT_COMPLETED -> {
                // Direct-boot mode (rare for TV): app data not yet decrypted.
                // We can still launch but defer WS connect until user unlocks.
                Log.i(TAG, "Locked boot — launching in direct-boot mode")
                launchMainActivity(context)
            }
        }
    }

    private fun launchMainActivity(context: Context) {
        val launchIntent = Intent(context, MainActivity::class.java).apply {
            // Bring up a fresh task so MainActivity fully starts even if
            // the previous instance was killed.
            addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_CLEAR_TOP or
                Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED
            )
        }

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                // API 34+: we may need to start from a non-Broadcast context
                // if the broadcast receiver is in "cached" state.
                context.startActivity(launchIntent)
            } else {
                context.startActivity(launchIntent)
            }
            Log.i(TAG, "MainActivity launched after boot")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to launch MainActivity on boot: ${e.message}")
        }
    }
}
