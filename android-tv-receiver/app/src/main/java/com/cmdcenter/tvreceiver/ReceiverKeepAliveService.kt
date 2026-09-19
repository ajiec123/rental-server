package com.cmdcenter.tvreceiver

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.os.Build
import android.os.IBinder
import android.util.Log

/**
 * ReceiverKeepAliveService — foreground service yang menjaga WebSocket
 * connection tetap hidup meskipun MainActivity ke background (mis.
 * customer tekan Home di remote, atau ada app lain yang foreground).
 *
 * Mengapa perlu:
 *   - Saat MainActivity tidak visible, Android bisa mem-`onStop()`-nya
 *     lalu memotong sumber daya. WS OkHttp masih hidup di thread
 *     terpisah, tapi Service yang "bound" ke activity bisa di-kill
 *     saat low-memory.
 *   - Dengan promote ke foreground service + notification persisten,
 *     Android menjamin proses kita tidak akan di-kill oleh sistem.
 *   - Result: ketika customer pindah ke game/app lain, branding overlay
 *     masih bisa di-show, dan perintah dari Operator tetap sampai.
 *
 * Lifecycle:
 *   1. MainActivity.onCreate() → startForegroundService(this)
 *   2. Service onStartCommand → startForeground(notification)
 *   3. Service stays alive even if MainActivity is paused/stopped
 *   4. MainActivity.onDestroy() → stopService(this)
 *
 * Notification:
 *   - Wajib untuk foreground service di Android 8+
 *   - Priority LOW agar tidak bunyi / getar
 *   - Ongoing (tidak bisa di-swipe)
 *   - Channel: "tv_receiver_service" (importance LOW)
 */
class ReceiverKeepAliveService : Service() {

    companion object {
        private const val TAG = "TVKeepAlive"
        const val CHANNEL_ID = "tv_receiver_service"
        const val NOTIFICATION_ID = 7777
        const val ACTION_START = "com.cmdcenter.tvreceiver.START_KEEPALIVE"
        const val ACTION_STOP = "com.cmdcenter.tvreceiver.STOP_KEEPALIVE"

        fun start(context: Context) {
            val intent = Intent(context, ReceiverKeepAliveService::class.java).apply {
                action = ACTION_START
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
            Log.i(TAG, "KeepAlive service start requested")
        }

        fun stop(context: Context) {
            val intent = Intent(context, ReceiverKeepAliveService::class.java).apply {
                action = ACTION_STOP
            }
            context.stopService(intent)
            Log.i(TAG, "KeepAlive service stop requested")
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        Log.i(TAG, "KeepAlive service created")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action ?: ACTION_START
        when (action) {
            ACTION_STOP -> {
                Log.i(TAG, "Stop action received — stopping service")
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
                return START_NOT_STICKY
            }
            else -> {
                startForeground(NOTIFICATION_ID, buildNotification())
                Log.i(TAG, "KeepAlive service in foreground mode")
            }
        }
        // START_STICKY: kalau sistem kill, dia akan restart otomatis
        return START_STICKY
    }

    override fun onDestroy() {
        Log.i(TAG, "KeepAlive service destroyed")
        super.onDestroy()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            val existing = nm.getNotificationChannel(CHANNEL_ID)
            if (existing == null) {
                val channel = NotificationChannel(
                    CHANNEL_ID,
                    getString(R.string.keepalive_channel_name),
                    NotificationManager.IMPORTANCE_LOW
                ).apply {
                    description = getString(R.string.keepalive_channel_description)
                    setShowBadge(false)
                    enableLights(false)
                    enableVibration(false)
                    lockscreenVisibility = Notification.VISIBILITY_SECRET
                }
                nm.createNotificationChannel(channel)
                Log.i(TAG, "Notification channel created")
            }
        }
    }

    private fun buildNotification(): Notification {
        // PendingIntent untuk buka MainActivity saat user klik notif (jarang, tapi bagus untuk debugging)
        val openIntent = Intent(this, MainActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        }
        val pi = PendingIntent.getActivity(
            this, 0, openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }

        return builder
            .setSmallIcon(android.R.drawable.ic_menu_compass)
            .setContentTitle(getString(R.string.notif_keepalive_title))
            .setContentText(getString(R.string.notif_keepalive_text))
            .setContentIntent(pi)
            .setOngoing(true) // tidak bisa di-swipe
            .setPriority(Notification.PRIORITY_LOW)
            .setColor(Color.parseColor("#00E5FF"))
            .setCategory(Notification.CATEGORY_SERVICE)
            .setVisibility(Notification.VISIBILITY_SECRET)
            .build()
    }
}
