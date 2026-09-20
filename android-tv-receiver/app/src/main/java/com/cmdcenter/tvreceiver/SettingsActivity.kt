package com.cmdcenter.tvreceiver

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.text.InputType
import android.util.Log
import okhttp3.MediaType.Companion.toMediaType
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast

/**
 * SettingsActivity — UI di TV untuk:
 *   1. Set channel name (identifier TV, mis. "TV1-PS3", "PS5_01")
 *   2. Set server URL (kalau pindah server)
 *   3. Toggle Kiosk Mode (lock-task)
 *   4. Toggle Keep-Alive service
 *   5. Lihat status koneksi WebSocket
 *
 * Bisa diakses dari MainActivity (tombol Settings) atau langsung:
 *   adb shell am start -n com.cmdcenter.tvreceiver/.SettingsActivity
 *
 * Channel name disimpan ke SharedPreferences "tv_receiver".
 * Setelah user Save, MainActivity akan auto-restart WebSocket subscription.
 */
class SettingsActivity : Activity() {

    companion object {
        const val PREFS_NAME = "tv_receiver"
        const val KEY_CHANNEL_NAME = "tv_channel_name"
        const val KEY_STATION_NUMBER = "tv_station_number"
        const val KEY_SERVER_URL = "server_url"
        const val KEY_KIOSK_MODE = "kiosk_mode_enabled"
        const val KEY_KEEP_ALIVE = "keep_alive_enabled"
        const val DEFAULT_CHANNEL_NAME = ""  // Kosong = auto-derive dari device ID
        const val DEFAULT_SERVER_URL = "ws://192.168.1.8:3000"

        const val CHANNEL_PREFIX = "tv:"  // channel naming convention

        private const val TAG = "TVSettings"

        fun deriveChannelFromNumber(num: String?): String {
            val n = num?.trim()
            if (n.isNullOrBlank() || !n.all { it.isDigit() }) return ""
            return "$CHANNEL_PREFIX" + "STATION_" + n.padStart(2, '0')
        }
    }

    private lateinit var channelInput: EditText
    private lateinit var statusText: TextView
    private lateinit var channelPreviewText: TextView
    private lateinit var kioskCheckbox: CheckBox
    private lateinit var keepAliveCheckbox: CheckBox

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Edge-to-edge fullscreen for TV mode
        window.setFlags(
            WindowManager.LayoutParams.FLAG_FULLSCREEN,
            WindowManager.LayoutParams.FLAG_FULLSCREEN
        )

        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val savedNumber = prefs.getString(KEY_STATION_NUMBER, DEFAULT_CHANNEL_NAME) ?: DEFAULT_CHANNEL_NAME

        val rootLayout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(60, 60, 60, 60)
            setBackgroundColor(0xFF0F172A.toInt()) // dark slate
        }

        // ===== Title =====
        val title = TextView(this).apply {
            text = "⚙️ SETTINGS — TV RECEIVER"
            textSize = 22f
            setTextColor(0xFF00E5FF.toInt())
            setTypeface(typeface, android.graphics.Typeface.BOLD)
            gravity = Gravity.CENTER
        }
        rootLayout.addView(title)

        // ===== Station number input =====
        val channelLabel = TextView(this).apply {
            text = "Nomor Station (1 - 99)"
            textSize = 14f
            setTextColor(0xFFFFFFFF.toInt())
            setPadding(0, 40, 0, 10)
        }
        rootLayout.addView(channelLabel)

        channelInput = EditText(this).apply {
            inputType = InputType.TYPE_CLASS_NUMBER
            hint = "Contoh: 1, 10, 12"
            setText(savedNumber)
            setTextColor(0xFF000000.toInt())
            setBackgroundColor(0xFFFFFFFF.toInt())
            setPadding(20, 20, 20, 20)
            textSize = 16f
            isSingleLine = true
        }
        val channelInputParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        )
        rootLayout.addView(channelInput, channelInputParams)

        channelPreviewText = TextView(this).apply {
            textSize = 12f
            setPadding(0, 8, 0, 0)
            setTextColor(0xFF94A3B8.toInt())
        }
        rootLayout.addView(channelPreviewText)
        updateChannelPreview()

        // ===== Station number hint =====
        val conventionHint = TextView(this).apply {
            text = "💡 Nomor ini menentukan channel TV: nomor 1 → tv:STATION_01, 10 → tv:STATION_10.\n" +
                    "   Pastikan nomor sama dengan station di aplikasi operator."
            textSize = 10f
            setTextColor(0xFFFBBF24.toInt()) // amber — important notice
            setPadding(0, 4, 0, 0)
        }
        rootLayout.addView(conventionHint)

        // ===== Kiosk / Lock-task toggle =====
        val kioskLabel = TextView(this).apply {
            text = "🔒 Kiosk Mode (Lock-Task)"
            textSize = 14f
            setTextColor(0xFFFFFFFF.toInt())
            setPadding(0, 30, 0, 10)
        }
        rootLayout.addView(kioskLabel)

        kioskCheckbox = CheckBox(this).apply {
            text = "Aktifkan mode kiosk (customer tidak bisa exit ke launcher)"
            isChecked = prefs.getBoolean(KEY_KIOSK_MODE, true)
            setTextColor(0xFFCBD5E1.toInt())
            textSize = 12f
            setPadding(0, 0, 0, 0)
        }
        rootLayout.addView(kioskCheckbox)

        val kioskHint = TextView(this).apply {
            text = "💡 Untuk mode tanpa toast 'Screen pinned', set device owner via:\n" +
                    "   adb shell dpm set-device-owner com.cmdcenter.tvreceiver/.AdminReceiver"
            textSize = 10f
            setTextColor(0xFF94A3B8.toInt())
            setPadding(0, 4, 0, 0)
        }
        rootLayout.addView(kioskHint)

        // ===== Keep-alive service toggle =====
        val keepAliveLabel = TextView(this).apply {
            text = "🔄 Background Service"
            textSize = 14f
            setTextColor(0xFFFFFFFF.toInt())
            setPadding(0, 20, 0, 10)
        }
        rootLayout.addView(keepAliveLabel)

        keepAliveCheckbox = CheckBox(this).apply {
            text = "Jaga WebSocket tetap hidup saat app ke background"
            isChecked = prefs.getBoolean(KEY_KEEP_ALIVE, true)
            setTextColor(0xFFCBD5E1.toInt())
            textSize = 12f
        }
        rootLayout.addView(keepAliveCheckbox)

        val keepAliveHint = TextView(this).apply {
            text = "💡 Tanpa ini, customer tekan Home → WS bisa terputus"
            textSize = 10f
            setTextColor(0xFF94A3B8.toInt())
            setPadding(0, 4, 0, 0)
        }
        rootLayout.addView(keepAliveHint)

        // ===== Status =====
        val statusLabel = TextView(this).apply {
            text = "Status Koneksi"
            textSize = 14f
            setTextColor(0xFFFFFFFF.toInt())
            setPadding(0, 30, 0, 10)
        }
        rootLayout.addView(statusLabel)

        statusText = TextView(this).apply {
            textSize = 13f
            setTextColor(0xFF6BCB77.toInt())
            setPadding(20, 15, 20, 15)
            setBackgroundColor(0xFF1E293B.toInt())
        }
        rootLayout.addView(statusText)

        // ===== Pairing Test Button =====
        // Owner can press this to verify the server recognizes this channel
        // and returns "ok" (vs CHANNEL_TAKEN, which means another TV holds it).
        val pairTestButton = Button(this).apply {
            text = "🔌 TEST PAIRING"
            textSize = 13f
            setBackgroundColor(0xFF14B8A6.toInt())
            setTextColor(0xFFFFFFFF.toInt())
            setPadding(30, 15, 30, 15)
            setOnClickListener { testPairing() }
        }
        val pairTestParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        )
        pairTestParams.setMargins(0, 16, 0, 0)
        pairTestParams.gravity = Gravity.START
        rootLayout.addView(pairTestButton, pairTestParams)

        // ===== Buttons =====
        val buttonLayout = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            setPadding(0, 40, 0, 0)
        }

        val saveButton = Button(this).apply {
            text = "💾 SIMPAN"
            textSize = 14f
            setBackgroundColor(0xFF00E5FF.toInt())
            setTextColor(0xFF000000.toInt())
            setPadding(40, 20, 40, 20)
            setOnClickListener { saveSettings() }
        }
        val saveParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        )
        saveParams.setMargins(10, 0, 10, 0)
        buttonLayout.addView(saveButton, saveParams)

        val cancelButton = Button(this).apply {
            text = "❌ BATAL"
            textSize = 14f
            setBackgroundColor(0xFF475569.toInt())
            setTextColor(0xFFFFFFFF.toInt())
            setPadding(40, 20, 40, 20)
            setOnClickListener { finish() }
        }
        val cancelParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        )
        cancelParams.setMargins(10, 0, 10, 0)
        buttonLayout.addView(cancelButton, cancelParams)

        val resetButton = Button(this).apply {
            text = "🔄 RESET"
            textSize = 14f
            setBackgroundColor(0xFFA66CFF.toInt())
            setTextColor(0xFFFFFFFF.toInt())
            setPadding(40, 20, 40, 20)
            setOnClickListener { resetToDefaults() }
        }
        val resetParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        )
        resetParams.setMargins(10, 0, 10, 0)
        buttonLayout.addView(resetButton, resetParams)

        rootLayout.addView(buttonLayout)

        // Live preview when user types channel name
        channelInput.setOnFocusChangeListener { _, hasFocus ->
            if (!hasFocus) updateChannelPreview()
        }

        val scrollView = ScrollView(this).apply {
            isFillViewport = true
            addView(rootLayout)
        }
        setContentView(scrollView)

        // Show current status
        updateStatusDisplay(savedNumber)
    }

    private fun updateChannelPreview() {
        val typed = channelInput.text.toString().trim()
        val preview = if (typed.isEmpty()) {
            "(kosong → belum ada nomor station)"
        } else {
            "Channel aktif: ${deriveChannelFromNumber(typed)}"
        }
        channelPreviewText.text = preview
    }

    private fun saveSettings() {
        val stationNumber = channelInput.text.toString().trim()
        val kioskEnabled = kioskCheckbox.isChecked
        val keepAliveEnabled = keepAliveCheckbox.isChecked

        // Validate station number (numeric, 1-99)
        val numInt = stationNumber.toIntOrNull()
        if (stationNumber.isNotEmpty() && (numInt == null || numInt < 1 || numInt > 99)) {
            Toast.makeText(
                this,
                "❌ Nomor station harus angka 1 sampai 99",
                Toast.LENGTH_LONG
            ).show()
            return
        }

        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit()
            .putString(KEY_STATION_NUMBER, stationNumber)
            .putBoolean(KEY_KIOSK_MODE, kioskEnabled)
            .putBoolean(KEY_KEEP_ALIVE, keepAliveEnabled)
            .apply()

        Log.i(TAG, "Settings saved: stationNumber=$stationNumber, kiosk=$kioskEnabled, keepAlive=$keepAliveEnabled")

        // Restart keep-alive service based on new setting
        if (keepAliveEnabled) {
            ReceiverKeepAliveService.start(this)
        } else {
            ReceiverKeepAliveService.stop(this)
        }

        Toast.makeText(this, "✅ Tersimpan! Restart MainActivity untuk apply.", Toast.LENGTH_LONG).show()

        // Restart MainActivity so it reconnects with new settings
        val intent = Intent(this, MainActivity::class.java)
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_NEW_TASK)
        startActivity(intent)
        finish()
    }

    private fun resetToDefaults() {
        channelInput.setText(DEFAULT_CHANNEL_NAME)
        updateChannelPreview()
        Toast.makeText(this, "🔄 Reset ke default", Toast.LENGTH_SHORT).show()
    }

    /**
     * Test pairing by calling POST /api/tv/pair on the server.
     * Shows result in [statusText] and as toast.
     */
    private fun testPairing() {
        val stationNumber = channelInput.text.toString().trim()
        val channelName = deriveChannelFromNumber(stationNumber)
        if (channelName.isEmpty()) {
            Toast.makeText(this, "❌ Isi nomor station dulu", Toast.LENGTH_SHORT).show()
            return
        }
        // Server URL no longer manually configurable — server is auto-discovered
        // via UDP/mDNS. Use the default fallback for the pairing test.
        val serverUrl = DEFAULT_SERVER_URL
        val httpBase = when {
            serverUrl.startsWith("ws://") -> serverUrl.replace("ws://", "http://")
            serverUrl.startsWith("wss://") -> serverUrl.replace("wss://", "https://")
            else -> serverUrl
        }
        // Strip only a trailing "/ws" or "/" path — keep the "//host:port" part.
        val cleanBase = httpBase.removeSuffix("/ws").removeSuffix("/")
        val deviceId = try {
            val androidId = android.provider.Settings.Secure.getString(
                contentResolver, android.provider.Settings.Secure.ANDROID_ID
            ) ?: "unknown"
            androidId.takeLast(8).uppercase()
        } catch (_: Exception) { "unknown" }

        statusText.text = "⏳ Testing pairing to $cleanBase..."
        Thread {
            try {
                val client = okhttp3.OkHttpClient.Builder()
                    .connectTimeout(5, java.util.concurrent.TimeUnit.SECONDS)
                    .readTimeout(5, java.util.concurrent.TimeUnit.SECONDS)
                    .build()
                val body = """{"tvChannel":"$channelName","deviceId":"$deviceId","model":"${android.os.Build.MODEL}","version":"1.0.0"}"""
                val request = okhttp3.Request.Builder()
                    .url("$cleanBase/api/tv/pair")
                    .post(okhttp3.RequestBody.create("application/json".toMediaType(), body))
                    .build()
                val response = client.newCall(request).execute()
                val responseBody = response.body?.string() ?: ""
                response.close()
                runOnUiThread {
                    when {
                        response.isSuccessful -> {
                            statusText.text = "✅ Pairing OK! Channel '$channelName' claimed by deviceId=$deviceId"
                            statusText.setTextColor(0xFF6BCB77.toInt())
                            Toast.makeText(this, "✅ Pairing success", Toast.LENGTH_SHORT).show()
                        }
                        response.code == 409 -> {
                            statusText.text = "❌ CHANNEL_TAKEN: '$channelName' is used by another TV.\nPilih channel lain."
                            statusText.setTextColor(0xFFEF4444.toInt())
                            Toast.makeText(this, "❌ Channel taken", Toast.LENGTH_LONG).show()
                        }
                        else -> {
                            statusText.text = "⚠️ HTTP ${response.code}: $responseBody"
                            statusText.setTextColor(0xFFFBBF24.toInt())
                        }
                    }
                }
            } catch (e: Exception) {
                runOnUiThread {
                    statusText.text = "❌ Network error: ${e.message}"
                    statusText.setTextColor(0xFFEF4444.toInt())
                    Toast.makeText(this, "❌ ${e.message}", Toast.LENGTH_LONG).show()
                }
            }
        }.start()
    }

    private fun updateStatusDisplay(stationNumber: String) {
        val resolvedChannel = deriveChannelFromNumber(stationNumber).ifEmpty {
            "(belum ada nomor station)"
        }
        val status = """
            📺 Channel: $resolvedChannel
            🪄 Auto-Discovery: AKTIF (UDP + mDNS)

            💡 Tips:
               • WiFi harus sama dengan komputer Owner
               • Tidak perlu setting IP — server auto-terdeteksi
               • Hanya perlu set Nomor Station (1-99)
        """.trimIndent()
        statusText.text = status
    }
}