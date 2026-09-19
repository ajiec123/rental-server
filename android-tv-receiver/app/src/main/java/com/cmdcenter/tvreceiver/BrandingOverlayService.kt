package com.cmdcenter.tvreceiver

import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.os.Build
import android.os.IBinder
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.TextView

/**
 * BrandingOverlayService — menampilkan teks nama rental di pojok
 * kanan bawah TV Android, overlay di atas konten apapun.
 *
 * Dipanggil via HTTP endpoint /branding dengan body:
 *   { "action": "show", "text": "COMMAND CENTER", "subtitle": "Station 01" }
 *   { "action": "hide" }
 *   { "action": "set",  "text": "...", "subtitle": "...", "color": "#00E5FF" }
 *
 * Pakai SYSTEM_ALERT_WINDOW permission agar bisa overlay di atas game/app lain.
 * User harus grant permission sekali via:
 *   adb shell appops set com.cmdcenter.tvreceiver SYSTEM_ALERT_WINDOW allow
 * Atau di Settings → Apps → Special Access → Display over other apps.
 */
class BrandingOverlayService : Service() {

    companion object {
        const val ACTION_SHOW = "show"
        const val ACTION_HIDE = "hide"
        const val ACTION_SET = "set"

        private const val DEFAULT_TEXT = "COMMAND CENTER"
        private const val DEFAULT_SUBTITLE = ""
        private const val DEFAULT_COLOR = "#00E5FF"
        private const val DEFAULT_BG = "#80000000" // 50% black
        private const val DEFAULT_POSITION = "bottom-right" // back-compat

        /**
         * Maps "top-left" | "top-right" | "bottom-left" | "bottom-right"
         * to a WindowManager.LayoutParams.gravity int. Falls back to BOTTOM|END.
         */
        private fun gravityFor(position: String?): Int {
            val vert = if (position?.startsWith("top") == true) Gravity.TOP else Gravity.BOTTOM
            val horz = if (position?.endsWith("left") == true) Gravity.START else Gravity.END
            return vert or horz
        }
    }

    private var overlayView: View? = null
    private var windowManager: WindowManager? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.getStringExtra("action") ?: ACTION_SHOW
        val text = intent?.getStringExtra("text") ?: DEFAULT_TEXT
        val subtitle = intent?.getStringExtra("subtitle") ?: DEFAULT_SUBTITLE
        val colorHex = intent?.getStringExtra("color") ?: DEFAULT_COLOR
        val bgHex = intent?.getStringExtra("bg") ?: DEFAULT_BG
        val position = intent?.getStringExtra("position") ?: DEFAULT_POSITION

        when (action) {
            ACTION_HIDE -> hideOverlay()
            ACTION_SET, ACTION_SHOW -> showOverlay(text, subtitle, colorHex, bgHex, position)
        }
        return START_STICKY
    }

    private fun showOverlay(text: String, subtitle: String, colorHex: String, bgHex: String, position: String) {
        hideOverlay()

        val container = FrameLayout(this).apply {
            setBackgroundColor(Color.parseColor(bgHex))
            val pad = (16 * resources.displayMetrics.density).toInt()
            val padV = (10 * resources.displayMetrics.density).toInt()
            setPadding(pad, padV, pad, padV)
        }

        // Inner LinearLayout: text alignment inside container follows horizontal position.
        // Top positions align start, bottom positions align end (matches typical branding convention).
        val layout = android.widget.LinearLayout(this).apply {
            orientation = android.widget.LinearLayout.VERTICAL
            gravity = when {
                position.startsWith("top") -> Gravity.START
                else -> Gravity.END
            }
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

        val params = WindowManager.LayoutParams(
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
            // Margins are handled by gravity + padding inside the container view
            // (WindowManager.LayoutParams does not have setMargins — that's only
            // available on ViewGroup.MarginLayoutParams, which is used by child
            // views, not by the top-level overlay params).
        }

        try {
            windowManager?.addView(container, params)
            overlayView = container
        } catch (e: Exception) {
            // SYSTEM_ALERT_WINDOW permission not granted yet
            android.util.Log.w("BrandingOverlay", "Cannot show overlay: ${e.message}")
        }
    }

    private fun hideOverlay() {
        overlayView?.let {
            try { windowManager?.removeView(it) } catch (_: Exception) {}
        }
        overlayView = null
    }

    override fun onDestroy() {
        hideOverlay()
        super.onDestroy()
    }
}