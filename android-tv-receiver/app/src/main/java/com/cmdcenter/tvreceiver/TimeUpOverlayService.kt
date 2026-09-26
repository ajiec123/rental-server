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
import android.media.AudioManager
import android.media.ToneGenerator
import android.os.Build
import android.os.IBinder
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.Log
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.ImageView

/**
 * TimeUpOverlayService — SCREENSAVER overlay shown fullscreen on top of the
 * HDMI output (or any app) when a session ends / the unit is on standby.
 *
 * Instead of a black screen, it displays the rental's wallpaper uploaded
 * from the operator app (Settings → Screensaver TV → /api/branding/wallpaper).
 * Falls back to pure black while the wallpaper is still downloading or when
 * none is configured.
 *
 * Permission: SYSTEM_ALERT_WINDOW (granted via appops during install).
 *   adb shell appops set com.cmdcenter.tvreceiver SYSTEM_ALERT_WINDOW allow
 */
class TimeUpOverlayService : Service() {

    companion object {
        private const val TAG = "TimeUpOverlay"
        private const val ACTION_SHOW = "com.cmdcenter.tvreceiver.SHOW_TIMEUP"
        private const val ACTION_DISMISS = "com.cmdcenter.tvreceiver.DISMISS_TIMEUP"
        private const val NOTIFICATION_ID = 7779
        private const val CHANNEL_ID = "timeup_overlay"

        /** True while the screensaver overlay window is on screen. */
        @Volatile
        var isShowing = false

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
                showOverlay()
            }
        }
        return START_STICKY
    }

    private fun buildWallpaperView(bitmap: android.graphics.Bitmap): ImageView {
        return ImageView(this).apply {
            setImageBitmap(bitmap)
            scaleType = ImageView.ScaleType.CENTER_CROP
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
        }
    }

    private fun showOverlay() {
        if (!Settings.canDrawOverlays(this)) {
            Log.w(TAG, "SYSTEM_ALERT_WINDOW not granted — screensaver cannot show")
            return
        }

        // Remove existing if any
        removeOverlayView()

        // Screensaver root: black background with the wallpaper on top
        // (CENTER_CROP fills the whole screen). Falls back to plain black
        // when no wallpaper is cached yet.
        val root = FrameLayout(this).apply {
            setBackgroundColor(Color.BLACK)
        }
        val cached = WallpaperCache.bitmap
        if (cached != null) {
            root.addView(buildWallpaperView(cached))
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
            isShowing = true
            Log.i(TAG, "Screensaver overlay shown (wallpaper=${cached != null})")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to add overlay: ${e.message}")
            return
        }

        // Wallpaper not cached yet — fetch it and swap the view in-place.
        if (cached == null) {
            WallpaperCache.fetchAsync { loaded ->
                if (loaded != null && isShowing) {
                    handler.post {
                        val current = overlayView as? FrameLayout ?: return@post
                        try {
                            current.removeAllViews()
                            current.addView(buildWallpaperView(loaded))
                            Log.i(TAG, "Screensaver wallpaper loaded and displayed")
                        } catch (e: Exception) {
                            Log.w(TAG, "Failed to swap wallpaper: ${e.message}")
                        }
                    }
                }
            }
        }
    }

    private fun removeOverlayView() {
        overlayView?.let { try { windowManager?.removeView(it) } catch (_: Exception) {} }
        overlayView = null
    }

    private fun selfDismiss() {
        removeOverlayView()
        isShowing = false
        stopSelf()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (nm.getNotificationChannel(CHANNEL_ID) == null) {
                nm.createNotificationChannel(
                    NotificationChannel(CHANNEL_ID, "Screensaver Overlay", NotificationManager.IMPORTANCE_LOW).apply {
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
            .setContentTitle("Command Center TV")
            .setContentText("Screensaver aktif")
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
