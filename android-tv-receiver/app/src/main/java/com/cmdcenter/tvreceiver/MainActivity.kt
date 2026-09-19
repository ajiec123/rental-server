package com.cmdcenter.tvreceiver

import android.app.Activity
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.media.AudioManager
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.util.Log
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStream
import java.net.ServerSocket
import java.net.Socket
import java.util.regex.Pattern
import kotlinx.coroutines.launch

/**
 * Android TV Receiver — exposes a tiny HTTP server on port 8765
 * that accepts {"command": "..."} and translates to Android system APIs.
 *
 * This single Activity runs in fullscreen, starts a background thread
 * serving HTTP, and handles each command via a dedicated executor.
 *
 * Compile target: Android TV (API 21+ recommended; tested on 9 / 10 / 11)
 *
 * ===== Project layout suggestion =====
 * android-tv-receiver/
 *   build.gradle
 *   settings.gradle
 *   AndroidManifest.xml
 *   app/
 *     build.gradle
 *     src/main/
 *       AndroidManifest.xml
 *       java/com/cmdcenter/tvreceiver/MainActivity.kt   ← this file
 *       res/
 *         layout/activity_main.xml
 *         values/strings.xml
 *
 * ===== Wire with server.ts =====
 * See server-tv-adapter-androidtv.ts in the parent project.
 */
class MainActivity : Activity() {

    companion object {
        private const val TAG = "TVReceiver"
        private const val HTTP_PORT = 8765
        private const val AUTH_TOKEN = "rahasia-123" // Match server-tv-adapter-androidtv.ts

        // ===== Channel-based WebSocket config =====
        // PRIMARY: discovered via mDNS (NSD) — TV doesn't need to know server IP.
        // FALLBACK: hardcoded URL if mDNS fails (5s timeout).
        // Override via SettingsActivity → set server_url there for different network.
        // Default assumes PC Owner at 192.168.1.2 (common Fiberhome router subnet).
        private const val WS_SERVER_URL_FALLBACK = "ws://192.168.1.2:3000"
        private const val WS_RECONNECT_DELAY_MS = 3000L
        private const val WS_RECONNECT_DELAY_MAX_MS = 30_000L
        private const val WS_PING_INTERVAL_MS = 25000L
        private const val WS_HEARTBEAT_INTERVAL_MS = 5_000L // anti-fraud: keep TV marked online
        private const val CHANNEL_PREFIX = "tv:" // channel naming convention: "tv:PS5_01"

        // SharedPreferences keys
        const val PREFS_NAME = "tv_receiver"
        const val KEY_KIOSK_MODE = "kiosk_mode_enabled"
        const val KEY_KEEP_ALIVE = "keep_alive_enabled"
        const val KEY_AUTO_RECONNECT = "auto_reconnect_enabled"
    }

    private lateinit var powerManager: PowerManager
    private lateinit var audioManager: AudioManager
    private lateinit var windowManager: WindowManager
    private lateinit var prefs: SharedPreferences
    private lateinit var devicePolicyManager: DevicePolicyManager
    private var serverSocket: ServerSocket? = null
    @Volatile private var isRunning = false

    // ===== Service-centric refactor =====
    // Activity observes state via static StateFlow exposed by the Service.
    // We don't bind to the Service — we just read its public state holder.
    // The Service auto-starts in onCreate() and keeps running independently.
    private val serviceScope = kotlinx.coroutines.CoroutineScope(
        kotlinx.coroutines.SupervisorJob() + kotlinx.coroutines.Dispatchers.Main
    )

    // Kiosk / lock-task state
    private var kioskModeEnabled = true
    private var keepAliveEnabled = true

    // Exponential backoff for WS reconnect
    @Volatile private var currentReconnectDelayMs = WS_RECONNECT_DELAY_MS
    private val maxReconnectDelayMs = WS_RECONNECT_DELAY_MAX_MS

    // Channel name — derived from Android device ID, e.g. "tv:PS5_01"
    // Override via SharedPreferences if you want a custom name (set in TV settings).
    private lateinit var tvChannel: String

    // WebSocket URL — starts as fallback, then mDNS may upgrade it.
    @Volatile private var wsServerUrl: String = WS_SERVER_URL_FALLBACK
    @Volatile private var serverDiscoveredViaMdns: Boolean = false

    // Live timer overlay view (programmatically added on top of activity_main)
    private var timerOverlay: android.widget.FrameLayout? = null
    private var timerTextView: android.widget.TextView? = null
    private var timerSubtitleView: android.widget.TextView? = null
    private var timerStationView: android.widget.TextView? = null
    private var timerContainer: android.widget.FrameLayout? = null

    // Latest stations snapshot from server (for cross-referencing our channel)
    @Volatile private var latestStationsSnapshot: org.json.JSONArray? = null

    // Track which station this TV is currently showing timer for
    @Volatile private var activeStationId: String? = null

    // Persisted pairing info from server: { tvChannel → stationId }.
    // Used by handleTimerTick() to match this TV's channel to the right
    // station instead of guessing from console/suffix.
    @Volatile private var pairingByChannel: Map<String, String> = emptyMap()

    private var webSocket: okhttp3.WebSocket? = null
    private val wsClient: okhttp3.OkHttpClient = okhttp3.OkHttpClient.Builder()
        .pingInterval(WS_PING_INTERVAL_MS, java.util.concurrent.TimeUnit.MILLISECONDS)
        .readTimeout(0, java.util.concurrent.TimeUnit.MILLISECONDS) // never time out
        .build()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Edge-to-edge fullscreen for TV mode
        window.setFlags(
            WindowManager.LayoutParams.FLAG_FULLSCREEN,
            WindowManager.LayoutParams.FLAG_FULLSCREEN
        )
        // Keep screen on — TV is meant to display branding/timer continuously
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        // Show even when device is locked, and turn screen on if it's off
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        }
        setContentView(R.layout.activity_main)

        powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        devicePolicyManager = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager

        // Apply immersive mode (hide system bars / nav bar) — critical for TV kiosk
        applyImmersiveMode()

        // Safety net: catch uncaught exceptions on background threads so a
        // single misbehaving subsystem (e.g. NsdManager race) doesn't kill
        // the entire TV receiver and leave the customer with a black screen.
        // We log + survive instead of letting Android's default handler
        // terminate the process. UI thread exceptions are still fatal because
        // those actually mean our own code is broken.
        val defaultHandler = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            val isNsdThread = thread.name?.contains("NsdManager", ignoreCase = true) == true ||
                thread.name?.contains("Nsd", ignoreCase = true) == true
            val isListenerRace = throwable is IllegalArgumentException &&
                (throwable.message?.contains("listener already in use", ignoreCase = true) == true ||
                 throwable.message?.contains("listener", ignoreCase = true) == true)
            if (isNsdThread || isListenerRace) {
                Log.e(TAG, "🛡️ Suppressed non-fatal exception on ${thread.name}: ${throwable.message}", throwable)
                // Don't rethrow — let the WS reconnect loop + mDNS timeout
                // recover naturally instead of crashing the whole process.
                return@setDefaultUncaughtExceptionHandler
            }
            // Anything else: delegate to default (which will crash the app)
            defaultHandler?.uncaughtException(thread, throwable)
        }

        // Load prefs
        kioskModeEnabled = prefs.getBoolean(KEY_KIOSK_MODE, true)
        keepAliveEnabled = prefs.getBoolean(KEY_KEEP_ALIVE, true)

        // Wire Settings button → open SettingsActivity (manual, never auto-launch)
        findViewById<android.widget.Button>(R.id.btn_open_settings)?.setOnClickListener {
            val settingsIntent = Intent(this, SettingsActivity::class.java)
            startActivity(settingsIntent)
        }

        // Build the live timer card (hidden until WS_TIMER_TICK arrives)
        timerOverlay = buildTimerOverlay()

        tvChannel = resolveChannelName()
        if (tvChannel.isBlank()) {
            Log.w(TAG, "⚠️ Channel not configured. Opening Settings for mandatory setup.")
            // Auto-navigate to Settings so user MUST set channel
            runOnUiThread {
                startActivity(Intent(this, SettingsActivity::class.java))
            }
        } else {
            Log.i(TAG, "TV will subscribe to channel: $tvChannel")
        }

        // ===== Service-centric refactor =====
        // WebSocket + NSD + state machine moved to TvConnectionService.
        // Activity now only renders UI and observes StateFlow.
        // This way, when customer presses HOME on remote or switches
        // to HDMI source, the WS keeps running and operator commands
        // still arrive (and trigger TimeUpOverlayService when needed).
        startHttpServer()

        // Start the connection service (foreground, sticky)
        TvConnectionService.startWithChannel(this, tvChannel)

        // Observe state changes to update UI when Activity is visible
        observeConnectionState()

        Log.i(TAG, "Android TV Receiver ready (channel=$tvChannel, kiosk=$kioskModeEnabled, keepAlive=$keepAliveEnabled)")
    }

    /**
     * Observe TvConnectionService state flows and update Activity UI.
     * Runs via lifecycleScope so it auto-cancels when Activity is destroyed.
     */
    private fun observeConnectionState() {
        serviceScope.launch {
            // StateBus is set by TvConnectionService.onCreate() which runs
            // before our Activity.onCreate() because we startWithChannel()
            // there. Wait briefly if needed.
            val stateFlow = TvConnectionService.StateBus.state
            if (stateFlow != null) {
                stateFlow.collect { tvState ->
                    Log.d(TAG, "state: $tvState")
                    runOnUiThread { renderTvState(tvState) }
                }
            }
        }
        serviceScope.launch {
            val connFlow = TvConnectionService.StateBus.connection
            if (connFlow != null) {
                connFlow.collect { conn ->
                    Log.d(TAG, "conn: $conn")
                    runOnUiThread { renderConnState(conn) }
                }
            }
        }
    }

    private fun renderTvState(state: TvConnectionService.TvState) {
        val statusView = findViewById<android.widget.TextView>(R.id.tv_ws_status)
        when (state) {
            is TvConnectionService.TvState.Idle -> {
                statusView?.text = "Status: ⚪ Idle (no active session)"
            }
            is TvConnectionService.TvState.Active -> {
                val remaining = (state.endTime - System.currentTimeMillis()) / 60_000L
                statusView?.text = "Status: 🟢 Active: ${state.customer} (${remaining}m left)"
            }
            is TvConnectionService.TvState.Warning -> {
                statusView?.text = "Status: 🟡 ${state.minutesLeft}m left: ${state.customer}"
            }
            is TvConnectionService.TvState.Ended -> {
                statusView?.text = "Status: 🔴 TIME UP: ${state.customer}"
            }
            is TvConnectionService.TvState.Tamper -> {
                statusView?.text = "🚨 Tamper: ${state.reason}"
            }
        }
    }

    private fun renderConnState(conn: TvConnectionService.ConnState) {
        val statusView = findViewById<android.widget.TextView>(R.id.tv_ws_status)
        when (conn) {
            is TvConnectionService.ConnState.Connected -> {
                statusView?.text = "🟢 Connected (${conn.channel})"
            }
            is TvConnectionService.ConnState.Connecting -> {
                statusView?.text = "🟡 Connecting..."
            }
            is TvConnectionService.ConnState.Disconnected -> {
                statusView?.text = "🔴 Disconnected: ${conn.reason} (retry in ${conn.nextRetryMs / 1000}s)"
            }
        }
    }

    /**
     * Hide all system UI (status bar, navigation bar) so the TV displays
     * only our content. Compatible across API 21-34 via WindowInsetsController
     * (API 30+) and the deprecated systemUiVisibility flags for older devices.
     */
    @Suppress("DEPRECATION")
    private fun applyImmersiveMode() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            // API 30+: modern WindowInsetsController
            window.setDecorFitsSystemWindows(false)
            window.insetsController?.let { controller ->
                controller.hide(WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars())
                controller.systemBarsBehavior =
                    WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } else {
            // API 21-29: legacy immersive sticky
            window.decorView.systemUiVisibility = (
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_FULLSCREEN
                or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            )
        }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        // Re-apply immersive mode when window regains focus (e.g., after toast)
        if (hasFocus) applyImmersiveMode()
    }

    /**
     * Resolve channel name. Priority:
     *   1. SharedPreferences "tv_channel_name" (set via TV settings UI).
     *      Format: "PS5_01" → CHANNEL_PREFIX is auto-prepended.
     *
     * ===== FIX (pairing) =====
     * Previously we fell back to a random ANDROID_ID-derived name like
     * "tv:DEV_73". That was the #1 cause of "silent fail" — operator
     * publishes to "tv:PS5_01" but TV subscribes to "tv:DEV_73".
     *
     * Now: if no channel is set, we return empty string and log a clear
     * warning. TvConnectionService will refuse to start WS until channel
     * is configured. User MUST open Settings → set channel manually.
     *
     * IMPORTANT: channel suffix MUST match a station's id ending, because
     * [src/utils/tvPairing.ts] uses regex `_(\d{2})$` to derive mapping.
     */
    private fun resolveChannelName(): String {
        val prefs = getSharedPreferences("tv_receiver", Context.MODE_PRIVATE)
        val custom = prefs.getString("tv_channel_name", null)
        return if (!custom.isNullOrBlank()) {
            val normalized = custom.trim().uppercase()
            CHANNEL_PREFIX + normalized
        } else {
            // ===== NO FALLBACK =====
            Log.w(TAG, "⚠️ No channel configured. Owner MUST open Settings → set channel name.")
            "" // empty = invalid, Service will refuse to connect
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        isRunning = false
        try {
            serverSocket?.close()
        } catch (e: Exception) {
            Log.w(TAG, "ServerSocket close error: ${e.message}")
        }
        // ===== Service-centric refactor =====
        // TvConnectionService is STICKY foreground — it keeps running
        // even after Activity dies. Only stop if user explicitly disables
        // keep-alive in Settings.
        // WS cleanup, NSD cleanup moved to TvConnectionService.onDestroy()
        if (!keepAliveEnabled) {
            try {
                stopService(Intent(this, TvConnectionService::class.java))
            } catch (_: Exception) {}
        }
    }

    /**
     * Try to enter lock-task (kiosk) mode. Two ways:
     *
     * 1) **Lock task mode (API 21+)** — `startLockTask()`. App is pinned
     *    to screen; user cannot navigate to other apps or home screen.
     *    No special permission needed if the app is the device owner OR
     *    if the user manually pinned it via "Pin this app" in recents.
     *    This is the simplest path for non-rooted TV.
     *
     * 2) **Device owner / kiosk mode** — `setLockTaskPackages()` via
     *    DevicePolicyManager. Requires the app to be set as the device
     *    owner with:
     *      adb shell dpm set-device-owner com.cmdcenter.tvreceiver/.AdminReceiver
     *    Then this app can lock task other apps too. Stronger kiosk.
     *
     * For the rental use case, both work. We try DeviceOwner first
     * (silent, no UI), then fall back to startLockTask() (which may
     * show a "screen pinned" toast).
     */
    private fun tryEnterKioskMode() {
        if (!kioskModeEnabled) return
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) return
        try {
            // Check if we're device owner
            val adminComponent = ComponentName(this, AdminReceiver::class.java)

            // DevicePolicyManager.isDeviceOwner(ComponentName) is the public API
            // method to check device-owner status. The String overload exists but
            // is @SystemApi-only and was hidden in compileSdk 34 — Kotlin compiler
            // reports "Unresolved reference" because it doesn't appear in the
            // public stub jar.
            //
            // Use reflection as a defensive fallback: if the method isn't there
            // (some manufacturer ROMs strip it), we just default to false.
            val isDeviceOwner: Boolean = try {
                val method = devicePolicyManager.javaClass.getMethod(
                    "isDeviceOwner",
                    ComponentName::class.java
                )
                method.invoke(devicePolicyManager, adminComponent) as? Boolean ?: false
            } catch (e: NoSuchMethodException) {
                Log.w(TAG, "isDeviceOwner(ComponentName) not found on this ROM")
                false
            } catch (e: Exception) {
                Log.w(TAG, "Reflection error checking device owner: ${e.message}")
                false
            }

            if (isDeviceOwner) {
                // Pre-set lock-task packages while we still own the device
                // setLockTaskPackages requires API 28+ (P)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    devicePolicyManager.setLockTaskPackages(
                        adminComponent,
                        arrayOf(packageName)
                    )
                }
                Log.i(TAG, "Device owner detected — lock-task packages set")
            }

            // Try to enter lock task (works either way)
            if (!isInLockTaskMode()) {
                startLockTask()
                Log.i(TAG, "✅ Entered lock-task (kiosk) mode")
            } else {
                Log.i(TAG, "Already in lock-task mode")
            }
        } catch (e: Exception) {
            Log.w(TAG, "Could not enter kiosk mode: ${e.message}")
        }
    }

    private fun isInLockTaskMode(): Boolean {
        val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            (getSystemService(Context.ACTIVITY_SERVICE) as android.app.ActivityManager).lockTaskModeState
        } else {
            @Suppress("DEPRECATION")
            if ((getSystemService(Context.ACTIVITY_SERVICE) as android.app.ActivityManager).isInLockTaskMode) 1 else 0
        }
        return mode != 0
    }

    /**
     * Block the system back button so customer can't exit kiosk mode.
     * (Home button is blocked by Android's lock-task itself.)
     */
    override fun onBackPressed() {
        if (kioskModeEnabled && isInLockTaskMode()) {
            // Ignore back press in kiosk mode
            Log.d(TAG, "Back press blocked (kiosk mode)")
            return
        }
        @Suppress("DEPRECATION")
        super.onBackPressed()
    }

    private fun startHttpServer() {
        isRunning = true
        Thread {
            try {
                serverSocket = ServerSocket(HTTP_PORT)
                while (isRunning) {
                    val client = serverSocket!!.accept()
                    Thread { handleClient(client) }.start()
                }
            } catch (e: Exception) {
                if (isRunning) Log.e(TAG, "HTTP server error: ${e.message}")
            }
        }.start()
    }

    // ===== Channel-based WebSocket client =====
    private var wsConnected = false
    private val wsHandler = android.os.Handler(android.os.Looper.getMainLooper())

    private fun startWebSocketClient() {
        connectWebSocket()
    }

    private fun connectWebSocket() {
        if (!isRunning) return
        Log.i(TAG, "[ws] Connecting to $wsServerUrl (mDNS=$serverDiscoveredViaMdns) ...")

        val request = okhttp3.Request.Builder()
            .url(wsServerUrl)
            .build()

        webSocket = wsClient.newWebSocket(request, object : okhttp3.WebSocketListener() {
            override fun onOpen(webSocket: okhttp3.WebSocket, response: okhttp3.Response) {
                Log.i(TAG, "[ws] Connected to server")
                wsConnected = true
                // Reset exponential backoff on successful connection
                currentReconnectDelayMs = WS_RECONNECT_DELAY_MS
                updateWsStatusUI(true, tvChannel)

                // 1. Identify ourselves as 'tv' client
                webSocket.send("""{"type":"IDENTIFY","clientType":"tv"}""")

                // 2. Subscribe to our unique channel and a generic fallback channel
                // so the operator app can reach this TV even when the default
                // channel name isn't manually configured yet.
                webSocket.send("""{"type":"SUBSCRIBE","channels":["$tvChannel","tv:all"]}""")

                // 3. Start periodic heartbeat so server knows we're alive
                startHeartbeat()

                // 4. Enter kiosk mode now that we're online (gives user a chance
                //    to open Settings first-launch, then locks down)
                tryEnterKioskMode()

                Log.i(TAG, "[ws] Subscribed to channel: $tvChannel")
            }

            override fun onMessage(webSocket: okhttp3.WebSocket, text: String) {
                Log.d(TAG, "[ws] Message: $text")
                try {
                    val json = org.json.JSONObject(text)
                    when (json.optString("type")) {
                        "WELCOME", "IDENTIFIED", "SUBSCRIBED" -> {
                            Log.i(TAG, "[ws] Server handshake: ${json.optString("type")}")
                        }
                        "WS_TIMER_TICK" -> {
                            // Server broadcasts latest stations every second
                            // Use this to render live session timer on TV
                            val stationsArr = json.optJSONArray("stations")
                            if (stationsArr != null) {
                                handleTimerTick(stationsArr)
                            }
                        }
                        "INIT_STATE" -> {
                            // Server snapshot includes tvPairings — record them so
                            // handleTimerTick() can match our channel to the right
                            // station instead of guessing from console/suffix.
                            Log.i(TAG, "[ws] INIT_STATE received; tvPairings=${json.optJSONArray("tvPairings")?.length() ?: 0} stations=${json.optJSONArray("stations")?.length() ?: 0}")
                            val pairings = json.optJSONArray("tvPairings")
                            if (pairings != null) {
                                applyPairingsFromServer(pairings)
                            }
                            // Stations list also carries current sessions for tick matching.
                            val stationsArr = json.optJSONArray("stations")
                            if (stationsArr != null) {
                                handleTimerTick(stationsArr)
                            }
                        }
                        "TV_PAIRINGS_UPDATE" -> {
                            val pairings = json.optJSONArray("pairings")
                            if (pairings != null) {
                                applyPairingsFromServer(pairings)
                            }
                        }
                        "CHANNEL_MESSAGE" -> {
                            // Incoming command from operator
                            val channel = json.optString("channel")
                            val dataObj = json.optJSONObject("data")
                            if (dataObj != null) {
                                handleIncomingCommand(dataObj)
                            }
                        }
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "[ws] Parse error: ${e.message}")
                }
            }

            override fun onClosing(webSocket: okhttp3.WebSocket, code: Int, reason: String) {
                Log.i(TAG, "[ws] Closing: $code $reason")
                webSocket.close(1000, null)
            }

            override fun onClosed(webSocket: okhttp3.WebSocket, code: Int, reason: String) {
                Log.i(TAG, "[ws] Closed: $code $reason")
                wsConnected = false
                updateWsStatusUI(false, tvChannel)
                scheduleReconnect()
            }

            override fun onFailure(webSocket: okhttp3.WebSocket, t: Throwable, response: okhttp3.Response?) {
                Log.e(TAG, "[ws] Failure: ${t.message}")
                wsConnected = false
                updateWsStatusUI(false, tvChannel)
                scheduleReconnect()
            }
        })
    }

    /**
     * Update the WebSocket status TextView in MainActivity UI.
     * Called from background thread; must post to UI thread.
     */
    private fun updateWsStatusUI(connected: Boolean, channel: String) {
        runOnUiThread {
            val statusView = findViewById<android.widget.TextView>(R.id.tv_ws_status)
            val channelView = findViewById<android.widget.TextView>(R.id.tv_channel_label)
            val mdnsView = findViewById<android.widget.TextView>(R.id.tv_mdns_status)
            if (channelView != null) {
                channelView.text = "📺 Channel: $channel"
            }
            if (statusView != null) {
                statusView.text = if (connected) {
                    "Status: 🟢 Connected & Subscribed"
                } else {
                    "Status: 🔴 Disconnected (auto-reconnecting...)"
                }
            }
            if (mdnsView != null) {
                mdnsView.text = if (serverDiscoveredViaMdns) {
                    "🪄 Auto-Discovery: ✅ ON (${wsServerUrl.removePrefix("ws://")})"
                } else {
                    "🪄 Auto-Discovery: ⏳ searching..."
                }
            }
        }
    }

    private fun scheduleReconnect() {
        if (!isRunning) return
        val delay = currentReconnectDelayMs
        Log.i(TAG, "[ws] Scheduling reconnect in ${delay}ms (exponential backoff)")
        wsHandler.postDelayed({
            if (!isRunning) return@postDelayed
            Log.i(TAG, "[ws] Reconnecting...")
            connectWebSocket()
            // Double delay for next failure, capped at maxReconnectDelayMs
            // (3s → 6s → 12s → 24s → 30s → 30s → ...)
            currentReconnectDelayMs = (currentReconnectDelayMs * 2)
                .coerceAtMost(maxReconnectDelayMs)
        }, delay)
    }

    // ===== ANTI-FRAUD: send command ACK back to operator =====
    // After executing a TV command, notify the operator's app whether it
    // succeeded. Operator logs this for audit + shows warning toast on fail.
    private fun sendTvAck(channel: String, command: String, success: Boolean, error: String? = null) {
        val escapedChannel = channel.replace("\"", "\\\"")
        val escapedCommand = command.replace("\"", "\\\"")
        val escapedError = (error ?: "").replace("\"", "\\\"").take(200)
        val ack = """{"type":"TV_COMMAND_ACK","channel":"$escapedChannel","command":"$escapedCommand","success":$success,"error":"$escapedError"}"""
        webSocket?.send(ack)
        Log.i(TAG, "[ws-ack] sent: success=$success command=$command")
    }

    // ===== ANTI-FRAUD: periodic heartbeat so server knows we're alive =====
    // Server marks TV offline if no heartbeat / SUBSCRIBE / CHANNEL_MESSAGE
    // for >15s. Without this, server could misjudge an idle-but-online TV
    // as offline (and force Owner override unnecessarily).
    private val heartbeatRunnable = object : Runnable {
        override fun run() {
            if (!isRunning || !wsConnected) {
                wsHandler.postDelayed(this, WS_HEARTBEAT_INTERVAL_MS)
                return
            }
            val hb = """{"type":"TV_HEARTBEAT","channel":"$tvChannel"}"""
            webSocket?.send(hb)
            wsHandler.postDelayed(this, WS_HEARTBEAT_INTERVAL_MS)
        }
    }

    private fun startHeartbeat() {
        wsHandler.removeCallbacks(heartbeatRunnable)
        wsHandler.postDelayed(heartbeatRunnable, WS_HEARTBEAT_INTERVAL_MS)
    }

    private fun handleIncomingCommand(dataObj: org.json.JSONObject) {
        // Try multiple shapes: { command: "power_on" } or { payload: { action: "show", text: "..." } }
        val command = dataObj.optString("command")
        val payload = dataObj.optJSONObject("payload")

        when {
            command == "RECONNECT_TV" -> {
                // ANTI-FRAUD: pure WS-only operation. Does NOT wake screen or
                // change TV hardware state — that would create a fraud window
                // where kasir bisa turn on TV di tengah sesi tanpa trigger
                // timer logic. Reconnect ini HANYA:
                //   1. Send ACK ke operator (callback)
                //   2. Close WS biar scheduleReconnect() refresh handshake
                // Power on/off tetap eksklusif lewat command terpisah (power_on
                // / power_off) yang dikirim hanya oleh App saat start/end sesi.
                Log.i(TAG, "[ws] Operator-triggered reconnect (WS-only) — sending ACK + closing WS")
                sendTvAck(channel = tvChannel, command = command, success = true)
                webSocket?.close(4001, "operator-triggered reconnect")
                // scheduleReconnect() will fire automatically via onClosed()
            }
            command.isNotEmpty() -> {
                // Direct command (power_on, volume_up, etc.)
                runOnUiThread {
                    val result = executeCommand(command)
                    Log.i(TAG, "[ws] Executed '$command' → $result")
                    // ===== ANTI-FRAUD: send ACK back to operator =====
                    // Tells operator app whether the TV actually executed the
                    // command. If `result` indicates failure, operator can flag
                    // this in audit log + alert Owner.
                    sendTvAck(
                        channel = tvChannel,
                        command = command,
                        success = !result.startsWith("error") && !result.startsWith("unavailable"),
                        error = if (result.startsWith("error") || result.startsWith("unavailable")) result else null
                    )
                }
            }
            payload != null -> {
                // Branding payload
                runOnUiThread {
                    val action = payload.optString("action", "show")
                    val intent = Intent(this, BrandingOverlayService::class.java).apply {
                        putExtra("action", action)
                        putExtra("text", payload.optString("text", ""))
                        putExtra("subtitle", payload.optString("subtitle", ""))
                        putExtra("color", payload.optString("color", "#00E5FF"))
                        putExtra("bg", payload.optString("bg", "#80000000"))
                    }
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        startForegroundService(intent)
                    } else {
                        startService(intent)
                    }
                    Log.i(TAG, "[ws] Branding dispatched: $action")
                }
            }
        }
    }

    private fun handleClient(socket: Socket) {
        try {
            val input = BufferedReader(InputStreamReader(socket.getInputStream()))
            val output = socket.getOutputStream()

            // Read HTTP request line + headers
            val requestLine = input.readLine() ?: run {
                socket.close(); return
            }
            // Consume headers
            var contentLength = 0
            while (true) {
                val line = input.readLine() ?: break
                if (line.isEmpty()) break
                if (line.lowercase().startsWith("content-length:")) {
                    contentLength = line.substringAfter(":").trim().toIntOrNull() ?: 0
                }
                if (line.lowercase().startsWith("authorization:")) {
                    val token = line.substringAfter(":").trim().removePrefix("Bearer ").trim()
                    if (token != AUTH_TOKEN) {
                        writeHttp(output, 401, "Unauthorized")
                        socket.close(); return
                    }
                }
            }

            // Read body
            val bodyBuilder = StringBuilder()
            if (contentLength > 0) {
                val chars = CharArray(contentLength)
                var read = 0
                while (read < contentLength) {
                    val n = input.read(chars, read, contentLength - read)
                    if (n < 0) break
                    read += n
                }
                bodyBuilder.append(chars, 0, read)
            }

            // Parse command from JSON: {"command": "power_on"}
            val body = bodyBuilder.toString()
            val command = Regex("\"command\"\\s*:\\s*\"([^\"]+)\"").find(body)?.groupValues?.get(1)

            when {
                requestLine.startsWith("POST") && requestLine.contains(" /command ") && command != null -> {
                    val result = executeCommand(command)
                    val resp = """{"ok":true,"result":"$result"}"""
                    writeHttp(output, 200, resp)
                }
                requestLine.startsWith("POST") && requestLine.contains(" /branding ") -> {
                    val result = handleBranding(body)
                    val resp = """{"ok":true,"result":"$result"}"""
                    writeHttp(output, 200, resp)
                }
                requestLine.startsWith("GET") && requestLine.contains(" /health ") -> {
                    writeHttp(output, 200, """{"status":"ok","device":"${Build.MODEL}"}""")
                }
                else -> {
                    writeHttp(output, 400, """{"error":"bad request"}""")
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Client handler error: ${e.message}")
        } finally {
            try { socket.close() } catch (_: Exception) {}
        }
    }

    private fun writeHttp(output: OutputStream, status: Int, body: String) {
        val statusText = when (status) {
            200 -> "OK"; 400 -> "Bad Request"; 401 -> "Unauthorized"
            else -> "Error"
        }
        val response = "HTTP/1.1 $status $statusText\r\n" +
                "Content-Type: application/json\r\n" +
                "Content-Length: ${body.toByteArray().size}\r\n" +
                "Connection: close\r\n\r\n" +
                body
        output.write(response.toByteArray())
        output.flush()
    }

    /**
     * Extract a string value from a JSON object body (e.g. `"key": "value"`).
     * Lightweight manual parser — avoids pulling in a JSON lib.
     */
    private fun extractJsonString(json: String, key: String): String? {
        val pattern = Pattern.compile("\"" + Pattern.quote(key) + "\"\\s*:\\s*\"([^\"]*)\"")
        val matcher = pattern.matcher(json)
        return if (matcher.find()) matcher.group(1) else null
    }

    /**
     * Handle POST /branding endpoint.
     * Body: { "action": "show"|"hide"|"set", "text": "...", "subtitle": "...",
     *         "color": "#00E5FF", "bg": "#80000000" }
     * Returns a short status string describing the action taken.
     */
    private fun handleBranding(body: String): String {
        val action = extractJsonString(body, "action") ?: "show"
        val text = extractJsonString(body, "text") ?: ""
        val subtitle = extractJsonString(body, "subtitle") ?: ""
        val color = extractJsonString(body, "color") ?: "#00E5FF"
        val bg = extractJsonString(body, "bg") ?: "#80000000"

        val intent = Intent(this, BrandingOverlayService::class.java).apply {
            putExtra("action", action)
            putExtra("text", text)
            putExtra("subtitle", subtitle)
            putExtra("color", color)
            putExtra("bg", bg)
        }
        // startForegroundService required from API 26+
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(intent)
        } else {
            startService(intent)
        }
        Log.i(TAG, "Branding action=$action text='$text' subtitle='$subtitle'")
        return "branding_${action}_dispatched"
    }

    private fun executeCommand(command: String): String {
        Log.i(TAG, "Executing command: $command")
        return try {
            when (command) {
                "power_on" -> {
                    wakeScreen()
                    "screen_on"
                }
                "power_off" -> {
                    sleepScreen()
                    "screen_off"
                }
                "volume_up" -> {
                    audioManager.adjustStreamVolume(
                        AudioManager.STREAM_MUSIC,
                        AudioManager.ADJUST_RAISE,
                        0
                    )
                    "volume_increased"
                }
                "volume_down" -> {
                    audioManager.adjustStreamVolume(
                        AudioManager.STREAM_MUSIC,
                        AudioManager.ADJUST_LOWER,
                        0
                    )
                    "volume_decreased"
                }
                "mute" -> {
                    val max = audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
                    audioManager.setStreamVolume(AudioManager.STREAM_MUSIC, 0, 0)
                    "muted_to_zero (max=$max)"
                }
                "unmute" -> {
                    val max = audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
                    audioManager.setStreamVolume(AudioManager.STREAM_MUSIC, max / 2, 0)
                    "unmuted_to_${max / 2}"
                }
                else -> throw IllegalArgumentException("Unknown command: $command")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Command '$command' failed: ${e.message}")
            "error: ${e.message}"
        }
    }

    /**
     * Turn the screen back on (wake device from sleep, but don't unlock).
     * Works on most Android TV devices. Some manufacturers may restrict this
     * — fall back to FLAG_KEEP_SCREEN_ON if needed.
     */
    private fun wakeScreen() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            // API 31+: use acquireLocked without unlock
            val lock = powerManager.newWakeLock(
                PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP,
                "TVReceiver:wake"
            )
            lock.acquire(60_000L) // hold for 60s, then release
            // Schedule release
            android.os.Handler(mainLooper).postDelayed({ try { lock.release() } catch (_: Exception) {} }, 60_000L)
        } else {
            @Suppress("DEPRECATION")
            val lock = powerManager.newWakeLock(
                PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP,
                "TVReceiver:wake"
            )
            lock.acquire(60_000L)
            android.os.Handler(mainLooper).postDelayed({ try { lock.release() } catch (_: Exception) {} }, 60_000L)
        }
        // Also clear any fullscreen flags to ensure visibility
        window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }

    /**
     * Turn the screen off without fully powering down the device.
     *
     * Strategy:
     *   1. If we are device-owner → call `lockNow()` to actually turn off
     *      the screen (no minimize, no home screen).
     *   2. Otherwise dim brightness to zero and keep the activity foreground
     *      so the customer doesn't see Android's launcher. `moveTaskToBack`
     *      is intentionally NOT used because it minimizes the app and the
     *      customer thinks the TV "broken".
     */
    private fun sleepScreen() {
        val adminComponent = ComponentName(this, AdminReceiver::class.java)
        val isDeviceOwner: Boolean = try {
            val method = devicePolicyManager.javaClass.getMethod(
                "isDeviceOwner",
                ComponentName::class.java
            )
            method.invoke(devicePolicyManager, adminComponent) as? Boolean ?: false
        } catch (_: Exception) {
            false
        }

        if (isDeviceOwner) {
            try {
                devicePolicyManager.lockNow()
                Log.i(TAG, "[power_off] lockNow() — screen off via device-owner")
                return
            } catch (e: Exception) {
                Log.w(TAG, "[power_off] lockNow failed: ${e.message} — falling back to dim")
            }
        }

        // Non-device-owner fallback: dim the window's brightness so the panel
        // goes black. This keeps the activity foreground (no minimize) and
        // recovers instantly when `wakeScreen()` runs.
        window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        val params = window.attributes
        params.screenBrightness = 0f
        window.attributes = params

        // Hide the timer overlay explicitly so a stale countdown is not visible
        // if the panel still emits some backlight.
        runOnUiThread { hideTimerOverlay() }
        Log.i(TAG, "[power_off] brightness=0 fallback (no device-owner)")
    }

    // ============================================================
    //  Live Timer Overlay
    // ============================================================
    // Server broadcasts WS_TIMER_TICK every second with the latest stations
    // array. Each station that has currentSession.endTime lets us compute
    // a live countdown. We render it as a big-card overlay so the customer
    // can see their remaining time directly on the TV.

    /**
     * Build a full-screen overlay containing a centered card with:
     *   - Station name + console type
     *   - Customer name
     *   - Big countdown (HH:MM:SS)
     *   - Status color: cyan (normal) → amber (warning <15m) → red (last minute)
     *
     * Added on top of activity_main via addContentView so it floats over
     * the existing UI without modifying XML.
     */
    private fun buildTimerOverlay(): android.widget.FrameLayout {
        val density = resources.displayMetrics.density
        fun dp(v: Int) = (v * density).toInt()

        val root = android.widget.FrameLayout(this).apply {
            setBackgroundColor(android.graphics.Color.parseColor("#CC000000")) // 80% black scrim
            visibility = android.view.View.GONE
            isClickable = false
            isFocusable = false
            layoutParams = android.widget.FrameLayout.LayoutParams(
                android.view.ViewGroup.LayoutParams.MATCH_PARENT,
                android.view.ViewGroup.LayoutParams.MATCH_PARENT
            )
        }

        // Centered card
        val card = android.widget.LinearLayout(this).apply {
            orientation = android.widget.LinearLayout.VERTICAL
            gravity = android.view.Gravity.CENTER
            setBackgroundColor(android.graphics.Color.parseColor("#0A2540"))
            setPadding(dp(60), dp(40), dp(60), dp(40))
            val lp = android.widget.FrameLayout.LayoutParams(
                dp(720),
                android.view.ViewGroup.LayoutParams.WRAP_CONTENT
            ).apply {
                gravity = android.view.Gravity.CENTER
            }
            layoutParams = lp
            // Rounded corners
            val outline = android.graphics.drawable.GradientDrawable().apply {
                cornerRadius = dp(24).toFloat()
                setColor(android.graphics.Color.parseColor("#0A2540"))
                setStroke(dp(3), android.graphics.Color.parseColor("#00E5FF"))
            }
            background = outline
        }

        // Station name + console type
        val stationText = android.widget.TextView(this).apply {
            text = "STATION 01 — PS3"
            setTextColor(android.graphics.Color.parseColor("#00E5FF"))
            setTextSize(android.util.TypedValue.COMPLEX_UNIT_SP, 28f)
            typeface = android.graphics.Typeface.create(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.BOLD)
            gravity = android.view.Gravity.CENTER
        }
        timerStationView = stationText
        card.addView(stationText)

        // Customer name
        val customerText = android.widget.TextView(this).apply {
            text = ""
            setTextColor(android.graphics.Color.parseColor("#E0F2FE"))
            setTextSize(android.util.TypedValue.COMPLEX_UNIT_SP, 18f)
            gravity = android.view.Gravity.CENTER
            setPadding(0, dp(8), 0, dp(20))
        }
        timerSubtitleView = customerText
        card.addView(customerText)

        // Big countdown digits
        val countdownText = android.widget.TextView(this).apply {
            text = "00:00"
            setTextColor(android.graphics.Color.parseColor("#FFFFFF"))
            setTextSize(android.util.TypedValue.COMPLEX_UNIT_SP, 96f)
            typeface = android.graphics.Typeface.create(android.graphics.Typeface.MONOSPACE, android.graphics.Typeface.BOLD)
            gravity = android.view.Gravity.CENTER
            // Letter spacing so the digits breathe
            letterSpacing = 0.1f
        }
        timerTextView = countdownText
        card.addView(countdownText)

        // Sisa waktu label
        val label = android.widget.TextView(this).apply {
            text = "SISA WAKTU SEWA"
            setTextColor(android.graphics.Color.parseColor("#94A3B8"))
            setTextSize(android.util.TypedValue.COMPLEX_UNIT_SP, 14f)
            gravity = android.view.Gravity.CENTER
            setPadding(0, dp(16), 0, 0)
            letterSpacing = 0.2f
        }
        card.addView(label)

        root.addView(card)
        timerContainer = root

        // Add to the activity's content (floats over XML layout)
        runOnUiThread {
            addContentView(
                root,
                android.widget.FrameLayout.LayoutParams(
                    android.view.ViewGroup.LayoutParams.MATCH_PARENT,
                    android.view.ViewGroup.LayoutParams.MATCH_PARENT
                )
            )
        }
        return root
    }

    /**
     * Handle WS_TIMER_TICK from server. Each tick contains the full stations
     * array; we find the station paired to this TV's channel (via
     * `pairingByChannel` if available, otherwise heuristic), then render its
     * currentSession countdown.
     *
     * If no active session is found for this TV, hide the overlay.
     */
    private fun handleTimerTick(stationsArr: org.json.JSONArray) {
        latestStationsSnapshot = stationsArr
        Log.i(TAG, "[timer-tick] stations=${stationsArr.length()} pairings=${pairingByChannel.size} channel=$tvChannel")

        // Channel naming convention (mirrors server-side App.tsx stationChannelMap):
        //   "tv:<consoleShort>_<suffix>" e.g. "tv:PS3_01", "tv:PS5_03"
        // Priority for matching station → TV:
        //   1) Persisted pairing (tvPairings) — server tells us exactly which
        //      station maps to our channel. This avoids false matches when
        //      two TVs share a similar console/suffix pattern.
        //   2) Heuristic channel suffix matching (legacy fallback).
        //   3) Fallback to first active session so the TV still renders
        //      SOMETHING instead of staying blank.
        var matchStation: org.json.JSONObject? = null
        val channelBody = tvChannel.removePrefix(CHANNEL_PREFIX)

        // Strategy 1: persisted pairing by exact channel match
        val pairedStationId = pairingByChannel[tvChannel.uppercase()]
        if (!pairedStationId.isNullOrBlank()) {
            for (i in 0 until stationsArr.length()) {
                val st = stationsArr.optJSONObject(i) ?: continue
                if (st.optString("id", "").equals(pairedStationId, ignoreCase = true)) {
                    matchStation = st
                    break
                }
            }
            if (matchStation == null) {
                Log.w(TAG, "[timer] pairing says $tvChannel → $pairedStationId but station not in snapshot")
            }
        }

        // Strategy 2: parse channel as "tv:CONSOLE_SUFFIX" and match console+suffix
        val underscoreIdx = channelBody.indexOf('_')
        if (underscoreIdx > 0 && matchStation == null) {
            val channelConsole = channelBody.substring(0, underscoreIdx).uppercase()
            val channelSuffix = channelBody.substring(underscoreIdx + 1).uppercase()
            for (i in 0 until stationsArr.length()) {
                val st = stationsArr.optJSONObject(i) ?: continue
                val stConsole = st.optString("consoleType", "").replace(" ", "").uppercase()
                val stIdSuffix = st.optString("id", "")
                    .replace("st-", "").replace("ST-", "")
                    .takeLast(channelSuffix.length).uppercase()
                val stNameSuffix = st.optString("name", "")
                    .replace("Station ", "").replace("STATION ", "")
                    .uppercase()
                if (stConsole.startsWith(channelConsole) &&
                    (stIdSuffix == channelSuffix || stNameSuffix == channelSuffix)) {
                    Log.i(TAG, "[timer] heuristic match stationId=${st.optString("id")}")
                    matchStation = st
                    break
                }
            }
        }

        // Strategy 3: station.id contains full channel body (legacy fallback for
        // channels like "tv:E1AC5D" derived from ANDROID_ID).
        if (matchStation == null) {
            for (i in 0 until stationsArr.length()) {
                val st = stationsArr.optJSONObject(i) ?: continue
                val stId = st.optString("id", "")
                if (stId.contains(channelBody, ignoreCase = true)) {
                    matchStation = st
                    break
                }
            }
        }

        // Strategy 4: fall back to the first active session so the TV still
        // renders a timer (better than blank).
        if (matchStation == null) {
            for (i in 0 until stationsArr.length()) {
                val st = stationsArr.optJSONObject(i) ?: continue
                val sessionObj = st.optJSONObject("currentSession")
                val endTime = sessionObj?.optLong("endTime", 0) ?: 0
                if (sessionObj != null && endTime > 0) {
                    matchStation = st
                    break
                }
            }
        }

        if (matchStation == null) {
            Log.i(TAG, "[timer] no matchStation — hiding overlay")
            runOnUiThread { hideTimerOverlay() }
            return
        }

        val sessionObj = matchStation.optJSONObject("currentSession")
        if (sessionObj == null) {
            Log.i(TAG, "[timer] matchStation ${matchStation.optString("id")} has no currentSession — hiding overlay")
            // Station is available — no active session
            runOnUiThread { hideTimerOverlay() }
            return
        }

        val endTime = sessionObj.optLong("endTime", 0)
        if (endTime <= 0) {
            Log.i(TAG, "[timer] matchStation ${matchStation.optString("id")} endTime=$endTime — hiding")
            runOnUiThread { hideTimerOverlay() }
            return
        }

        val now = System.currentTimeMillis()
        val remainingMs = endTime - now
        if (remainingMs <= 0) {
            Log.i(TAG, "[timer] matchStation ${matchStation.optString("id")} remaining<=0 — hiding")
            runOnUiThread { hideTimerOverlay() }
            return
        }

        val stationName = matchStation.optString("name", "Station")
        val consoleType = matchStation.optString("consoleType", "")
        val customerName = sessionObj.optString("customerName", "Pelanggan")
        val gamePlaying = sessionObj.optString("gamePlaying", "")

        runOnUiThread {
            Log.i(TAG, "[timer] matchStation=${matchStation.optString("id")} customer=$customerName remainingMs=$remainingMs")
            renderTimerOverlay(stationName, consoleType, customerName, gamePlaying, remainingMs)
        }
    }

    /**
     * Render the timer overlay with formatted countdown.
     * Color transitions:
     *   - White (>15 min)
     *   - Amber (#FFD93D) for warning (≤15 min)
     *   - Red (#FF5555) for critical (≤2 min)
     */
    private fun renderTimerOverlay(
        stationName: String,
        consoleType: String,
        customerName: String,
        gamePlaying: String,
        remainingMs: Long
    ) {
        val totalSeconds = remainingMs / 1000
        val hours = totalSeconds / 3600
        val minutes = (totalSeconds % 3600) / 60
        val seconds = totalSeconds % 60
        val countdown = String.format(java.util.Locale.US, "%02d:%02d:%02d", hours, minutes, seconds)

        // Pick color based on remaining time
        val color = when {
            remainingMs <= 2 * 60 * 1000 -> android.graphics.Color.parseColor("#FF5555") // last 2 min = red
            remainingMs <= 15 * 60 * 1000 -> android.graphics.Color.parseColor("#FFD93D") // ≤15 min = amber
            else -> android.graphics.Color.parseColor("#FFFFFF") // >15 min = white
        }

        timerContainer?.visibility = android.view.View.VISIBLE
        timerTextView?.text = countdown
        timerTextView?.setTextColor(color)

        timerStationView?.text = if (consoleType.isNotEmpty()) "$stationName — $consoleType" else stationName
        timerSubtitleView?.text = buildString {
            append(customerName)
            if (gamePlaying.isNotEmpty()) append(" • ").append(gamePlaying)
        }
        Log.i(TAG, "[renderTimerOverlay] station=$stationName customer=$customerName remaining=${countdown}")
    }

    /**
     * Hide the timer overlay (called when no active session).
     */
    private fun applyPairingsFromServer(pairings: org.json.JSONArray) {
        val map = HashMap<String, String>(pairings.length())
        for (i in 0 until pairings.length()) {
            val obj = pairings.optJSONObject(i) ?: continue
            val ch = obj.optString("tvChannel", "").uppercase()
            val stationId = obj.optString("stationId", "")
            if (ch.isNotBlank() && stationId.isNotBlank()) {
                map[ch] = stationId
            }
        }
        pairingByChannel = map
        Log.i(TAG, "[pairings] applied ${map.size} pairings (this TV=$tvChannel upper=${tvChannel.uppercase()}) entries=${map.entries}")
        // Re-render against latest snapshot so pairing takes effect immediately.
        latestStationsSnapshot?.let { snap ->
            runOnUiThread { handleTimerTick(snap) }
        }
    }

    private fun hideTimerOverlay() {
        timerContainer?.visibility = android.view.View.GONE
        if (activeStationId != null) {
            Log.d(TAG, "[timer] No active session for $tvChannel — hiding overlay")
            activeStationId = null
        }
    }
}