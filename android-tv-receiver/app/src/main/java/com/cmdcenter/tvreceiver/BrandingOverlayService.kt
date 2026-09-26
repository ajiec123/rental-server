package com.cmdcenter.tvreceiver

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView

/**
 * BrandingOverlayService — menampilkan teks nama rental + countdown timer
 * sewa di pojok layar TV (overlay di atas konten/game HDMI).
 *
 * The timer syncs with the server session (endTime absolute + server clock
 * offset), so the customer sees exactly how much time is left.
 */
class BrandingOverlayService : Service() {

    companion object {
        const val ACTION_SHOW = "show"
        const val ACTION_HIDE = "hide"
        const val ACTION_SET = "set"

        private const val TAG = "BrandingOverlay"
        private const val NOTIFICATION_ID = 7778
        private const val CHANNEL_ID = "branding_overlay"

        // Current active session endTime + server clock offset (updated by
        // TvConnectionService on every WS_TIMER_TICK / state change).
        @Volatile var activeEndTime: Long = 0L
        @Volatile var serverOffsetMs: Long = 0L

        fun show(
            context: Context,
            text: String,
            subtitle: String,
            color: String,
            bg: String,
            position: String,
            timerPosition: String,
            timerColor: String,
            timerSize: Int
        ) {
            val i = Intent(context, BrandingOverlayService::class.java).apply {
                action = ACTION_SHOW
                putExtra("text", text)
                putExtra("subtitle", subtitle)
                putExtra("color", color)
                putExtra("bg", bg)
                putExtra("position", position)
                putExtra("timerPosition", timerPosition)
                putExtra("timerColor", timerColor)
                putExtra("timerSize", timerSize)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(i)
            } else {
                context.startService(i)
            }
        }

        fun hide(context: Context) {
            context.stopService(Intent(context, BrandingOverlayService::class.java))
        }

        fun updateTimer(endTime: Long, offset: Long) {
            activeEndTime = endTime
            serverOffsetMs = offset
        }

        private fun gravityFor(position: String?): Int {
            val vert = if (position?.startsWith("top") == true) Gravity.TOP else Gravity.BOTTOM
            val horz = if (position?.endsWith("left") == true) Gravity.START else Gravity.END
            return vert or horz
        }
    }

    private var overlayView: View? = null
    private var timerOverlayView: View? = null
    private var timerView: TextView? = null
    private var windowManager: WindowManager? = null
    private val handler = Handler(Looper.getMainLooper())

    private val timerTick = object : Runnable {
        override fun run() {
            val endTime = activeEndTime
            val remaining = endTime - (System.currentTimeMillis() + serverOffsetMs)
            if (endTime > 0 && remaining > 0) {
                timerOverlayView?.visibility = View.VISIBLE
                timerView?.text = formatTimer(remaining)
            } else {
                // No active session — hide the whole timer window (transparent,
                // so nothing is visible).
                timerOverlayView?.visibility = View.GONE
            }
            handler.postDelayed(this, 1000)
        }
    }

    private fun formatTimer(remainingMs: Long): String {
        val h = remainingMs / 3_600_000L
        val m = (remainingMs % 3_600_000L) / 60_000L
        val s = (remainingMs % 60_000L) / 1000L
        return if (h > 0) "⏱ %d:%02d:%02d".format(h, m, s) else "⏱ %02d:%02d".format(m, s)
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(NOTIFICATION_ID, buildNotification())
        val action = intent?.getStringExtra("action") ?: ACTION_SHOW
        if (action == ACTION_HIDE) {
            hideOverlay()
            stopSelf()
            return START_NOT_STICKY
        }
        val text = intent?.getStringExtra("text") ?: "COMMAND CENTER"
        val subtitle = intent?.getStringExtra("subtitle") ?: ""
        val colorHex = intent?.getStringExtra("color") ?: "#00E5FF"
        val bgHex = intent?.getStringExtra("bg") ?: "#80000000"
        val position = intent?.getStringExtra("position") ?: "top-right"
        val timerPos = intent?.getStringExtra("timerPosition") ?: "top-right"
        val timerColorHex = intent?.getStringExtra("timerColor") ?: "#FFD700"
        val timerSizeSp = intent?.getIntExtra("timerSize", 16) ?: 16
        showOverlay(text, subtitle, colorHex, bgHex, position, timerPos, timerColorHex, timerSizeSp)
        return START_STICKY
    }

    private fun showOverlay(
        text: String,
        subtitle: String,
        colorHex: String,
        bgHex: String,
        position: String,
        timerPos: String,
        timerColorHex: String,
        timerSizeSp: Int
    ) {
        hideOverlay()

        val density = resources.displayMetrics.density
        fun dp(v: Int) = (v * density).toInt()

        // ---- Branding overlay (text + subtitle) at `position` ----
        // Transparent background — only the text is visible (per operator request).
        val container = FrameLayout(this).apply {
            setPadding(dp(16), dp(10), dp(16), dp(10))
        }

        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = if (position.startsWith("top")) Gravity.START else Gravity.END
        }

        val mainText = TextView(this).apply {
            this.text = text
            setTextColor(Color.parseColor(colorHex))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f)
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            gravity = if (position.startsWith("top")) Gravity.START else Gravity.END
        }
        layout.addView(mainText)

        if (subtitle.isNotEmpty()) {
            val subText = TextView(this).apply {
                this.text = subtitle
                setTextColor(Color.WHITE)
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
                gravity = if (position.startsWith("top")) Gravity.START else Gravity.END
                alpha = 0.85f
            }
            layout.addView(subText)
        }

        container.addView(layout)

        val brandingParams = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            else
                @Suppress("DEPRECATION")
                WindowManager.LayoutParams.TYPE_SYSTEM_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                    WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
                    WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = gravityFor(position)
        }

        // ---- Timer overlay (countdown) at `timerPos` ----
        // Transparent background + hidden until a session starts.
        val timerContainer = FrameLayout(this).apply {
            setPadding(dp(14), dp(8), dp(14), dp(8))
            visibility = View.GONE
        }
        val timerText = TextView(this).apply {
            this.text = ""
            setTextColor(Color.parseColor(timerColorHex))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, timerSizeSp.toFloat())
            typeface = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD)
            gravity = if (timerPos.startsWith("top")) Gravity.START else Gravity.END
        }
        timerView = timerText
        timerContainer.addView(timerText)

        val timerParams = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            else
                @Suppress("DEPRECATION")
                WindowManager.LayoutParams.TYPE_SYSTEM_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                    WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
                    WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = gravityFor(timerPos)
        }

        try {
            windowManager?.addView(container, brandingParams)
            overlayView = container
            windowManager?.addView(timerContainer, timerParams)
            timerOverlayView = timerContainer
            handler.removeCallbacks(timerTick)
            handler.post(timerTick)
        } catch (e: Exception) {
            android.util.Log.w(TAG, "Cannot show overlay: ${e.message}")
        }
    }

    private fun hideOverlay() {
        handler.removeCallbacks(timerTick)
        overlayView?.let {
            try { windowManager?.removeView(it) } catch (_: Exception) {}
        }
        overlayView = null
        timerOverlayView?.let {
            try { windowManager?.removeView(it) } catch (_: Exception) {}
        }
        timerOverlayView = null
        timerView = null
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (nm.getNotificationChannel(CHANNEL_ID) == null) {
                nm.createNotificationChannel(
                    NotificationChannel(CHANNEL_ID, "Branding Overlay", NotificationManager.IMPORTANCE_LOW)
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
            .setContentText("Branding overlay aktif")
            .setContentIntent(pi)
            .setOngoing(true)
            .setPriority(Notification.PRIORITY_LOW)
            .build()
    }

    override fun onDestroy() {
        hideOverlay()
        super.onDestroy()
    }
}
