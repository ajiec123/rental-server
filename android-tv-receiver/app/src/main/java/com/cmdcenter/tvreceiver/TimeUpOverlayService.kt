package com.cmdcenter.tvreceiver

import android.app.Service
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.media.AudioManager
import android.media.ToneGenerator
import android.os.Build
import android.os.IBinder
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.Log
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import android.media.RingtoneManager
import android.media.Ringtone

/**
 * TimeUpOverlayService — shows a FULL-SCREEN overlay on top of HDMI output
 * when a customer's session ends. Uses TYPE_APPLICATION_OVERLAY so it can
 * draw on top of the PlayStation's HDMI feed (or any other app).
 *
 * Why this is needed:
 *   - When player's HDMI source is selected, our app is in background.
 *     Normal Activity overlay won't show.
 *   - TYPE_APPLICATION_OVERLAY (with SYSTEM_ALERT_WINDOW permission) lets
 *     us draw on top of any other app, including HDMI input.
 *
 * Permission setup:
 *   adb shell appops set com.cmdcenter.tvreceiver SYSTEM_ALERT_WINDOW allow
 *   OR: Settings → Apps → Special Access → Display over other apps
 *
 * Lifecycle:
 *   - TimeUpOverlayService.show(context, customerName) → starts service
 *     which adds overlay view, plays alert tone, and exits after 2 min
 *     if operator doesn't dismiss.
 *   - TimeUpOverlayService.dismiss(context) → service removes overlay.
 *
 * Customer experience:
 *   - Big "WAKTU HABIS" banner + customer name
 *   - "Silakan ke kasir untuk tambah sesi" subtitle
 *   - Alert tone (3 beeps)
 *   - Auto-dismiss after 2 minutes if no action
 */
class TimeUpOverlayService : Service() {

    companion object {
        private const val TAG = "TimeUpOverlay"
        private const val ACTION_SHOW = "com.cmdcenter.tvreceiver.SHOW_TIMEUP"
        private const val ACTION_DISMISS = "com.cmdcenter.tvreceiver.DISMISS_TIMEUP"
        private const val FADE_TO_BLACK_AFTER_MS = 60_000L // 1 minute
        private const val NOTIFICATION_ID = 7779
        private const val CHANNEL_ID = "timeup_overlay"

        fun show(context: Context, customerName: String, persist: Boolean = false) {
            val intent = Intent(context, TimeUpOverlayService::class.java).apply {
                action = ACTION_SHOW
                putExtra("customer", customerName)
                putExtra("persist", persist)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun dismiss(context: Context) {
            context.startService(Intent(context, TimeUpOverlayService::class.java).apply {
                action = ACTION_DISMISS
            })
        }
    }

    private var overlayView: View? = null
    private var windowManager: WindowManager? = null
    private val handler = Handler(Looper.getMainLooper())
    private val fadeToBlackRunnable = Runnable { fadeToBlack() }
    private var ringtone: Ringtone? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // startForegroundService() requires startForeground() within 5s or
        // Android kills the process with RemoteServiceException.
        startForeground(NOTIFICATION_ID, buildNotification())
        when (intent?.action) {
            ACTION_DISMISS -> {
                selfDismiss()
                return START_NOT_STICKY
            }
            else -> {
                val customer = intent?.getStringExtra("customer") ?: "Customer"
                val persist = intent?.getBooleanExtra("persist", false) ?: false
                // persist=true → overlay kiosk-lock (operator mengakhiri sesi).
                // persist=false → overlay waktu habis biasa.
                // Keduanya: tampilkan "WAKTU HABIS" 1 menit, lalu fade ke layar
                // hitam penuh (simulasi sleep/mati) sampai power_on berikutnya.
                handler.removeCallbacks(fadeToBlackRunnable)
                handler.postDelayed(fadeToBlackRunnable, FADE_TO_BLACK_AFTER_MS)
                showOverlay(customer, persist)
                playAlertTone()
            }
        }
        return START_STICKY
    }

    private fun showOverlay(customer: String, persist: Boolean = false) {
        if (!Settings.canDrawOverlays(this)) {
            Log.w(TAG, "SYSTEM_ALERT_WINDOW not granted — falling back to notification only")
            return
        }

        // Remove existing if any
        overlayView?.let { try { windowManager?.removeView(it) } catch (_: Exception) {} }
        overlayView = null

        // PURE BLACK full-screen overlay — simulates "screen off" when the
        // session ends (works over HDMI input, unlike window brightness).
        val root = FrameLayout(this).apply {
            setBackgroundColor(Color.BLACK) // 100% black
        }

        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            else
                @Suppress("DEPRECATION")
                WindowManager.LayoutParams.TYPE_SYSTEM_OVERLAY,
            WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                or WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE,
            PixelFormat.OPAQUE
        ).apply {
            gravity = Gravity.CENTER
        }

        try {
            windowManager?.addView(root, params)
            overlayView = root
            Log.i(TAG, "Screen-off overlay shown (black)")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to add overlay: ${e.message}")
        }
    }

    private fun playAlertTone() {
        try {
            // 3 short beeps
            val tone = ToneGenerator(AudioManager.STREAM_MUSIC, 100)
            tone.startTone(ToneGenerator.TONE_PROP_BEEP, 300)
            handler.postDelayed({ tone.startTone(ToneGenerator.TONE_PROP_BEEP, 300) }, 500)
            handler.postDelayed({ tone.startTone(ToneGenerator.TONE_PROP_BEEP, 600) }, 1000)
            handler.postDelayed({ tone.release() }, 1800)
        } catch (e: Exception) {
            Log.w(TAG, "ToneGenerator failed: ${e.message}")
        }
    }

    private fun fadeToBlack() {
        try {
            overlayView?.let { root ->
                root.setBackgroundColor(Color.BLACK)
                if (root is FrameLayout) {
                    root.removeAllViews()
                }
            }
            Log.i(TAG, "Time-up overlay faded to full black (simulating sleep)")
        } catch (e: Exception) {
            Log.w(TAG, "fadeToBlack failed: ${e.message}")
        }
    }

    private fun selfDismiss() {
        overlayView?.let { try { windowManager?.removeView(it) } catch (_: Exception) {} }
        overlayView = null
        ringtone?.stop()
        ringtone = null
        handler.removeCallbacks(fadeToBlackRunnable)
        stopSelf()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (nm.getNotificationChannel(CHANNEL_ID) == null) {
                nm.createNotificationChannel(
                    NotificationChannel(CHANNEL_ID, "Time Up Overlay", NotificationManager.IMPORTANCE_LOW).apply {
                        setShowBadge(false)
                        enableLights(false)
                        enableVibration(false)
                    }
                )
            }
        }
    }

    private fun buildNotification(): Notification {
        val pi = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION") Notification.Builder(this)
        }
        return builder
            .setSmallIcon(android.R.drawable.ic_menu_compass)
            .setContentTitle("Sesi Berakhir")
            .setContentText("Waktu bermain habis")
            .setContentIntent(pi)
            .setOngoing(true)
            .setPriority(Notification.PRIORITY_LOW)
            .build()
    }

    override fun onDestroy() {
        selfDismiss()
        super.onDestroy()
    }
}
