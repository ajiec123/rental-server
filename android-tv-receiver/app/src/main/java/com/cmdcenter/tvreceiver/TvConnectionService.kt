package com.cmdcenter.tvreceiver

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.media.AudioManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import android.view.WindowManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * TvConnectionService — Service-centric WS + state machine + HDMI control.
 *
 * Why this exists:
 *   - Previously, WebSocket + NSD + state logic lived in MainActivity.
 *     When customer pressed HOME on remote (or selected HDMI source to
 *     switch to PlayStation), Activity went onPause() → onStop() and the
 *     OS could throttle or kill the WS connection.
 *   - This Service is a STICKY foreground service: it owns the WS, the
 *     NSD discovery, and the session state machine. MainActivity now
 *     only observes [state] / [connectionState] and renders UI.
 *
 * State machine:
 *   IDLE        → no active session, TV dim/standby
 *   ACTIVE      → session running, WS steady, heartbeat OK
 *   WARNING     → <5 min remaining, overlay countdown shown
 *   ENDED       → time up, "WAKTU HABIS" overlay shown
 *   DISCONNECTED→ WS down, retrying with exponential backoff
 *   TAMPER      → session active but TV went offline unexpectedly
 *
 * Public API (consumed by MainActivity):
 *   - state: StateFlow<TvState>     (session state)
 *   - connection: StateFlow<ConnState> (WS health)
 *   - requestStartSession(customer, endTime)
 *   - requestEndSession()
 *   - forceSwitchInput()           (force switch to HDMI)
 *   - dismissTimeUpOverlay()        (when operator ends session)
 */
class TvConnectionService : Service() {

    companion object {
        private const val TAG = "TvConnection"
        const val CHANNEL_ID = "tv_connection_service"
        const val NOTIFICATION_ID = 7778

        const val ACTION_START = "com.cmdcenter.tvreceiver.START_CONNECTION"
        const val ACTION_DISMISS_TIMEUP = "com.cmdcenter.tvreceiver.DISMISS_TIMEUP"
        const val ACTION_SWITCH_HDMI = "com.cmdcenter.tvreceiver.SWITCH_HDMI"

        // WS config — same as before, kept in Service so it survives Activity death
        private const val WS_PING_INTERVAL_MS = 25_000L
        private const val WS_HEARTBEAT_INTERVAL_MS = 5_000L
        private const val WS_RECONNECT_DELAY_MS = 3_000L
        private const val WS_RECONNECT_DELAY_MAX_MS = 30_000L
        private const val CHANNEL_PREFIX = "tv:"
        private const val SESSION_WARNING_THRESHOLD_MS = 5 * 60_000L // 5 min

        // Channel name — captured from MainActivity via Binder before start
        // OR from SharedPreferences if MainActivity hasn't run yet (BootReceiver path)
        private const val PREFS_NAME = "tv_receiver"
        private const val KEY_CHANNEL_NAME = "tv_channel_name"
        private const val KEY_SERVER_URL = "server_url"

        fun startWithChannel(context: Context, channel: String) {
            val intent = Intent(context, TvConnectionService::class.java).apply {
                action = ACTION_START
                putExtra("channel", channel)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun dismissTimeUp(context: Context) {
            context.startService(Intent(context, TvConnectionService::class.java).apply {
                action = ACTION_DISMISS_TIMEUP
            })
        }

        fun switchToHdmi(context: Context) {
            context.startService(Intent(context, TvConnectionService::class.java).apply {
                action = ACTION_SWITCH_HDMI
            })
        }
    }

    // ===== State flows consumed by MainActivity =====
    sealed class TvState {
        object Idle : TvState()
        data class Active(val sessionId: String, val endTime: Long, val customer: String) : TvState()
        data class Warning(val sessionId: String, val endTime: Long, val customer: String, val minutesLeft: Int) : TvState()
        data class Ended(val sessionId: String, val customer: String) : TvState()
        data class Tamper(val sessionId: String, val reason: String) : TvState()
    }

    sealed class ConnState {
        object Connecting : ConnState()
        data class Connected(val channel: String) : ConnState()
        data class Disconnected(val reason: String, val nextRetryMs: Long) : ConnState()
    }

    private val _state = MutableStateFlow<TvState>(TvState.Idle)
    val state: StateFlow<TvState> = _state.asStateFlow()

    private val _connection = MutableStateFlow<ConnState>(ConnState.Connecting)
    val connection: StateFlow<ConnState> = _connection.asStateFlow()

    // ===== Static shared state for Activities to observe =====
    // Since Service is a singleton per process, MainActivity can observe
    // the same StateFlow instance by reading StateBus directly. We assign
    // our internal flows to the bus in onCreate() so all observers see
    // the same state without needing to bind the Service.
    object StateBus {
        @Volatile var state: StateFlow<TvState>? = null
        @Volatile var connection: StateFlow<ConnState>? = null
    }

    // ===== Internal =====
    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private var timerMonitorJob: Job? = null

    private var webSocket: WebSocket? = null
    private var wsConnected = false
    private var wsStarted = false
    @Volatile private var currentReconnectDelayMs = WS_RECONNECT_DELAY_MS
    private val wsHandler = android.os.Handler(android.os.Looper.getMainLooper())

    private val wsClient: OkHttpClient = OkHttpClient.Builder()
        .pingInterval(WS_PING_INTERVAL_MS, TimeUnit.MILLISECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .build()

    // Separate OkHttp client for HTTP (pairing) — no WS config needed
    private val httpClient: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(5, TimeUnit.SECONDS)
        .readTimeout(5, TimeUnit.SECONDS)
        .build()

    /**
     * Stable deviceId for pairing — derived from ANDROID_ID last 8 hex chars.
     * Survives reinstalls on same device, differentiates between physical TVs.
     */
    private val deviceId: String by lazy {
        val androidId = android.provider.Settings.Secure.getString(
            contentResolver, android.provider.Settings.Secure.ANDROID_ID
        ) ?: "unknown"
        androidId.takeLast(8).uppercase()
    }

    @Volatile private var wsServerUrl: String = "ws://192.168.1.8:3000/ws"
    @Volatile private var tvChannel: String = "tv:UNKNOWN"
    private var nsdDiscovery: NsdDiscovery? = null

    private lateinit var powerManager: PowerManager
    private lateinit var audioManager: AudioManager
    private lateinit var windowManager: WindowManager
    private lateinit var devicePolicyManager: android.app.admin.DevicePolicyManager

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        devicePolicyManager = getSystemService(Context.DEVICE_POLICY_SERVICE) as android.app.admin.DevicePolicyManager
        createNotificationChannel()
        // Expose state flows to other components (Activity) without binding
        StateBus.state = _state
        StateBus.connection = _connection
        Log.i(TAG, "TvConnectionService created")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(NOTIFICATION_ID, buildNotification())

        when (intent?.action) {
            ACTION_DISMISS_TIMEUP -> {
                Log.i(TAG, "Dismissing time-up overlay (operator ended session)")
                TimeUpOverlayService.dismiss(this)
                if (_state.value is TvState.Ended) {
                    _state.value = TvState.Idle
                }
            }
            ACTION_SWITCH_HDMI -> {
                Log.i(TAG, "Manual HDMI switch requested")
                switchToHdmiInput()
            }
            else -> {
                // Normal start
                val channel = intent?.getStringExtra("channel") ?: resolveChannelFromPrefs()
                tvChannel = channel
                if (tvChannel.isBlank()) {
                    Log.w(TAG, "❌ Cannot start WS: channel not configured. Open Settings → set channel name.")
                    _connection.value = ConnState.Disconnected("CHANNEL_NOT_SET", 0L)
                    stopSelf()
                    return START_NOT_STICKY
                }
                Log.i(TAG, "Starting WS connection for channel: $tvChannel")
                // Guard against duplicate starts (MainActivity + re-delivered
                // START_STICKY intents can call onStartCommand more than once,
                // which used to open two WebSockets → server rejected the 2nd
                // subscription as CHANNEL_TAKEN).
                if (wsStarted) {
                    Log.i(TAG, "WS already started — ignoring duplicate start")
                    return START_STICKY
                }
                wsStarted = true
                // ===== Pairing fix: register channel on server BEFORE WS subscribe =====
                // This claims the channel for this specific device so two TVs
                // can't accidentally share the same channel name.
                resolveServerUrlFromPrefs()
                serviceScope.launch { registerChannelWithServer(tvChannel) }
                startNsdDiscovery()
                connectWebSocket()
            }
        }

        return START_STICKY
    }

    override fun onDestroy() {
        super.onDestroy()
        // Release channel claim synchronously (best-effort) before tearing down
        if (tvChannel.isNotBlank()) {
            try {
                kotlinx.coroutines.runBlocking { releaseChannelWithServer(tvChannel) }
            } catch (_: Exception) {}
        }
        serviceScope.cancel()
        try { webSocket?.close(1000, "service destroyed") } catch (_: Exception) {}
        try { nsdDiscovery?.unregisterTVService(); nsdDiscovery?.stopServerDiscovery() } catch (_: Exception) {}
        Log.i(TAG, "TvConnectionService destroyed")
    }

    // ===== Public commands =====
    fun forceSwitchInput() = switchToHdmiInput()

    private fun startNsdDiscovery() {
        try {
            nsdDiscovery = NsdDiscovery(
                context = this,
                onServerDiscovered = { host, port ->
                    val newUrl = "ws://$host:$port/ws"
                    if (newUrl != wsServerUrl) {
                        Log.i(TAG, "mDNS: server updated → $newUrl")
                        wsServerUrl = newUrl
                        webSocket?.close(4002, "server URL changed via mDNS")
                    }
                },
                onServerLost = {
                    Log.w(TAG, "mDNS: server lost. Reverting to Settings URL.")
                    resolveServerUrlFromPrefs()
                }
            )
            nsdDiscovery?.startServerDiscovery()
            val shortHash = tvChannel.removePrefix(CHANNEL_PREFIX)
            nsdDiscovery?.registerTVService(
                port = 8765,
                channelName = shortHash,
                model = android.os.Build.MODEL,
                version = "1.0.0",
                deviceId = shortHash
            )
        } catch (e: Exception) {
            Log.w(TAG, "NSD setup failed: ${e.message}")
        }
    }

    private fun connectWebSocket() {
        _connection.value = ConnState.Connecting
        val request = Request.Builder().url(wsServerUrl).build()
        webSocket = wsClient.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(ws: WebSocket, response: okhttp3.Response) {
                Log.i(TAG, "[ws] Connected")
                wsConnected = true
                currentReconnectDelayMs = WS_RECONNECT_DELAY_MS
                _connection.value = ConnState.Connected(tvChannel)

                ws.send("""{"type":"IDENTIFY","clientType":"tv"}""")
                ws.send("""{"type":"SUBSCRIBE","channels":["$tvChannel","tv:all"]}""")
                startHeartbeat()
            }

            override fun onMessage(ws: WebSocket, text: String) {
                try {
                    val json = JSONObject(text)
                    when (json.optString("type")) {
                        "INIT_STATE", "WS_TIMER_TICK" -> {
                            val stations = json.optJSONArray("stations")
                            stations?.let { reconcileSessionState(it) }
                        }
                        "CHANNEL_MESSAGE" -> {
                            val data = json.optJSONObject("data")
                            data?.let { handleIncomingCommand(it) }
                        }
                        "CHANNEL_TAKEN" -> {
                            // Server rejected our SUBSCRIBE because another TV
                            // already holds this channel. Show user a clear Toast
                            // and STOP the reconnect loop — they must fix the
                            // channel in Settings first.
                            val channel = json.optString("channel", tvChannel)
                            // HANYA fatal untuk channel kita sendiri. Konflik di
                            // channel broadcast (mis. "tv:all") tidak boleh
                            // mematikan koneksi — server lama pernah menolak
                            // subscribe tv:all saat ada >1 TV.
                            if (!channel.equals(tvChannel, ignoreCase = true)) {
                                Log.w(TAG, "CHANNEL_TAKEN untuk channel lain ($channel) — diabaikan")
                                return
                            }
                            val message = json.optString(
                                "message",
                                "Channel $channel is used by another TV"
                            )
                            Log.e(TAG, "❌ CHANNEL_TAKEN: $channel — $message")
                            wsHandler.post {
                                try {
                                    android.widget.Toast.makeText(
                                        this@TvConnectionService,
                                        "❌ $message\nBuka Settings → ganti ke channel lain",
                                        android.widget.Toast.LENGTH_LONG
                                    ).show()
                                } catch (_: Exception) {}
                                // Open Settings so user can fix channel
                                try {
                                    startActivity(
                                        android.content.Intent(
                                            this@TvConnectionService,
                                            SettingsActivity::class.java
                                        ).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
                                    )
                                } catch (_: Exception) {}
                            }
                            // Stop reconnect loop — user must fix channel manually
                            wsConnected = false
                            _connection.value = ConnState.Disconnected("CHANNEL_TAKEN", 0L)
                            // Cancel any pending reconnect
                            wsHandler.removeCallbacksAndMessages(null)
                        }
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "[ws] parse error: ${e.message}")
                }
            }

            override fun onClosed(ws: WebSocket, code: Int, reason: String) {
                wsConnected = false
                // Don't reconnect if we were rejected due to CHANNEL_TAKEN
                if (reason == "CHANNEL_TAKEN") {
                    Log.w(TAG, "[ws] Closed with CHANNEL_TAKEN — not reconnecting")
                    _connection.value = ConnState.Disconnected(reason, 0L)
                    return
                }
                _connection.value = ConnState.Disconnected(reason, currentReconnectDelayMs)
                scheduleReconnect()
            }

            override fun onFailure(ws: WebSocket, t: Throwable, response: okhttp3.Response?) {
                wsConnected = false
                Log.w(TAG, "[ws] Failure: ${t.message}")
                _connection.value = ConnState.Disconnected(t.message ?: "unknown", currentReconnectDelayMs)
                scheduleReconnect()
            }
        })
    }

    private fun scheduleReconnect() {
        val delay = currentReconnectDelayMs
        wsHandler.postDelayed({
            if (wsConnected) return@postDelayed
            connectWebSocket()
            currentReconnectDelayMs = (currentReconnectDelayMs * 2)
                .coerceAtMost(WS_RECONNECT_DELAY_MAX_MS)
        }, delay)
    }

    private val heartbeatRunnable = object : Runnable {
        override fun run() {
            if (wsConnected) {
                webSocket?.send("""{"type":"TV_HEARTBEAT","channel":"$tvChannel"}""")
            }
            wsHandler.postDelayed(this, WS_HEARTBEAT_INTERVAL_MS)
        }
    }
    private fun startHeartbeat() {
        wsHandler.removeCallbacks(heartbeatRunnable)
        wsHandler.postDelayed(heartbeatRunnable, WS_HEARTBEAT_INTERVAL_MS)
    }

    /**
     * Reconcile session state from server's stations array.
     * Picks the session whose channel matches this TV's tvChannel.
     */
    private fun reconcileSessionState(stations: org.json.JSONArray) {
        // Try to find a session explicitly targeting this TV's channel.
        // Server sends a synthesized field "tvChannel" if paired, otherwise
        // we fallback to the active session on the station that matches our channel.
        val current = _state.value

        for (i in 0 until stations.length()) {
            val station = stations.optJSONObject(i) ?: continue
            val session = station.optJSONObject("currentSession") ?: continue
            // Server melampirkan field "tvChannel" (pairing eksplisit atau turunan)
            // di setiap station pada INIT_STATE & WS_TIMER_TICK. Pencocokan STRICT:
            // hanya sesi milik station kita — fallback "current is Active" dihapus
            // karena bisa latch ke sesi station lain (multi-TV salah timer).
            val stationChannel = station.optString("tvChannel", "")

            if (stationChannel.isNotEmpty() && stationChannel.equals(tvChannel, ignoreCase = true)) {
                val endTime = session.optLong("endTime", 0L)
                val sessionId = session.optString("sessionId", "unknown")
                val customer = session.optString("customerName", "Customer")

                if (endTime > 0) {
                    val now = System.currentTimeMillis()
                    val remaining = endTime - now
                    when {
                        remaining <= 0 -> {
                            if (current !is TvState.Ended) {
                                _state.value = TvState.Ended(sessionId, customer)
                                showTimeUpOverlay(customer)
                            }
                        }
                        remaining <= SESSION_WARNING_THRESHOLD_MS -> {
                            val mins = (remaining / 60_000L).toInt().coerceAtLeast(1)
                            _state.value = TvState.Warning(sessionId, endTime, customer, mins)
                        }
                        else -> {
                            _state.value = TvState.Active(sessionId, endTime, customer)
                        }
                    }
                }
                return
            }
        }

        // No active session found for our channel
        if (current is TvState.Active || current is TvState.Warning) {
            Log.w(TAG, "Session disappeared from server → tamper suspected")
            _state.value = TvState.Tamper(
                sessionId = (current as? TvState.Active)?.sessionId ?: "unknown",
                reason = "Session ended on server but TV still running"
            )
        } else if (current !is TvState.Ended) {
            _state.value = TvState.Idle
        }
    }

    /**
     * Coroutine: monitor active session endTime and fire overlay when time's up.
     * This is server-independent: if WS dies, we still alert locally.
     */
    private fun startTimerMonitor(endTime: Long, customer: String, sessionId: String) {
        timerMonitorJob?.cancel()
        timerMonitorJob = serviceScope.launch {
            while (isActive) {
                val remaining = endTime - System.currentTimeMillis()
                val current = _state.value
                when {
                    remaining <= 0L && current !is TvState.Ended -> {
                        _state.value = TvState.Ended(sessionId, customer)
                        showTimeUpOverlay(customer)
                    }
                    remaining in 1..SESSION_WARNING_THRESHOLD_MS && current !is TvState.Warning -> {
                        val mins = (remaining / 60_000L).toInt().coerceAtLeast(1)
                        _state.value = TvState.Warning(sessionId, endTime, customer, mins)
                    }
                    remaining > SESSION_WARNING_THRESHOLD_MS && current !is TvState.Active -> {
                        _state.value = TvState.Active(sessionId, endTime, customer)
                    }
                }
                delay(1_000)
            }
        }
    }

    private fun handleIncomingCommand(dataObj: JSONObject) {
        val command = dataObj.optString("command")
        when (command) {
            "power_on" -> {
                Log.i(TAG, "[ws] power_on received → wake screen + switch HDMI")
                // Sesi baru dimulai operator: bersihkan overlay "WAKTU HABIS"
                // dari sesi sebelumnya dan reset state agar reconcile/tick
                // berikutnya mengisi Active dari server.
                try { TimeUpOverlayService.dismiss(this) } catch (_: Exception) {}
                if (_state.value is TvState.Ended) {
                    _state.value = TvState.Idle
                }
                wakeScreen()
                switchToHdmiInput()
                sendAck(channel = tvChannel, command = command, success = true)
            }
            "power_off" -> {
                Log.i(TAG, "[ws] power_off received")
                sleepScreen()
                // Kiosk lock (fase2 COMMAND_LOCK_AND_SLEEP): tanpa device-owner,
                // lockNow() tidak bisa — tampilkan overlay full-screen supaya
                // customer tidak lanjut main setelah sesi diakhiri operator.
                val current = _state.value
                val sessionId = when (current) {
                    is TvState.Active -> current.sessionId
                    is TvState.Warning -> current.sessionId
                    is TvState.Ended -> current.sessionId
                    else -> "operator-end"
                }
                val customer = when (current) {
                    is TvState.Active -> current.customer
                    is TvState.Warning -> current.customer
                    is TvState.Ended -> current.customer
                    else -> "Customer"
                }
                timerMonitorJob?.cancel()
                _state.value = TvState.Ended(sessionId, customer)
                showTimeUpOverlay(customer, persist = true)
                sendAck(channel = tvChannel, command = command, success = true)
            }
            "RECONNECT_TV" -> {
                // WS-only reconnect, no hardware change
                sendAck(channel = tvChannel, command = command, success = true)
                webSocket?.close(4001, "operator-triggered reconnect")
            }
            else -> {
                // Volume / mute / branding — defer to Activity-side handler
                // (those still work via activity_main overlay if visible)
                Log.i(TAG, "[ws] command '$command' forwarded to MainActivity")
                // Activity can still receive via receiver if registered
            }
        }
    }

    private fun sendAck(channel: String, command: String, success: Boolean, error: String? = null) {
        val escError = (error ?: "").replace("\"", "\\\"").take(200)
        val ack = """{"type":"TV_COMMAND_ACK","channel":"$channel","command":"$command","success":$success,"error":"$escError"}"""
        webSocket?.send(ack)
    }

    private fun showTimeUpOverlay(customer: String, persist: Boolean = false) {
        try {
            TimeUpOverlayService.show(this, customer, persist)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to show time-up overlay: ${e.message}")
        }
    }

    // ===== Hardware helpers =====
    private fun wakeScreen() {
        try {
            val lock = powerManager.newWakeLock(
                PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP,
                "TVReceiver:wake"
            )
            lock.acquire(60_000L)
            wsHandler.postDelayed({ try { lock.release() } catch (_: Exception) {} }, 60_000L)
        } catch (e: Exception) {
            Log.w(TAG, "wakeScreen failed: ${e.message}")
        }
    }

    private fun sleepScreen() {
        try {
            val adminComponent = android.content.ComponentName(this, AdminReceiver::class.java)
            val isDeviceOwner = try {
                val m = devicePolicyManager.javaClass.getMethod("isDeviceOwner", android.content.ComponentName::class.java)
                m.invoke(devicePolicyManager, adminComponent) as? Boolean ?: false
            } catch (_: Exception) { false }

            if (isDeviceOwner) {
                devicePolicyManager.lockNow()
                Log.i(TAG, "[power_off] lockNow() via device-owner")
            } else {
                Log.i(TAG, "[power_off] no device-owner — session ended, customer will see overlay")
            }
        } catch (e: Exception) {
            Log.w(TAG, "sleepScreen error: ${e.message}")
        }
    }

    /**
     * Switch TV input to HDMI (or first available HDMI input).
     *
     * Uses TvInputManager on API 21+. Falls back to launching the
     * built-in HDMI launcher if available.
     */
    private fun switchToHdmiInput() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) return
        try {
            val tvInputManager = getSystemService(Context.TV_INPUT_SERVICE) as? android.media.tv.TvInputManager
            if (tvInputManager == null) {
                Log.w(TAG, "TvInputManager not available on this device")
                return
            }
            val inputs = tvInputManager.tvInputList
            val hdmi = inputs.firstOrNull {
                it.type == android.media.tv.TvInputInfo.TYPE_HDMI
            } ?: inputs.firstOrNull()

            if (hdmi != null) {
                // TvInputInfo.id adalah flattened ComponentName (mis. "com.vendor.tv/.HdmiInput")
                val comp = android.content.ComponentName.unflattenFromString(hdmi.id)
                if (comp == null) {
                    Log.w(TAG, "Cannot parse TV input id: ${hdmi.id}")
                    return
                }
                val intent = Intent(Intent.ACTION_MAIN).apply {
                    addCategory(Intent.CATEGORY_LAUNCHER)
                    setComponent(comp)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                startActivity(intent)
                Log.i(TAG, "✅ Switched input to: ${hdmi.loadLabel(this)}")
            } else {
                Log.w(TAG, "No HDMI input found via TvInputManager")
            }
        } catch (e: Exception) {
            Log.w(TAG, "switchToHdmiInput failed: ${e.message}")
        }
    }

    private fun resolveChannelFromPrefs(): String {
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val custom = prefs.getString(KEY_CHANNEL_NAME, null)
        return if (!custom.isNullOrBlank()) {
            // Normalize: upper-case + trim so operator/server matching is consistent
            "$CHANNEL_PREFIX${custom.trim().uppercase()}"
        } else {
            // ===== TESTING FALLBACK =====
            // Hardcoded channel for quick testing (same as MainActivity fallback).
            Log.w(TAG, "⚠️ No channel configured — using hardcoded test channel PS3_93")
            "$CHANNEL_PREFIX" + "PS3_93"
        }
    }

    /**
     * Load the operator-configured WebSocket server URL from SharedPreferences
     * (set in SettingsActivity). This is the primary fallback when mDNS
     * auto-discovery hasn't found the server yet, and it fixes the previous
     * bug where the service always connected to the hardcoded 192.168.1.2.
     */
    private fun resolveServerUrlFromPrefs() {
        try {
            val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val saved = prefs.getString(KEY_SERVER_URL, null)
            if (!saved.isNullOrBlank() &&
                saved != "ws://auto-discovered" &&
                (saved.startsWith("ws://") || saved.startsWith("wss://"))) {
                val base = saved.trim().removeSuffix("/")
                wsServerUrl = if (base.endsWith("/ws")) base else "$base/ws"
                Log.i(TAG, "Server URL loaded from Settings: $wsServerUrl")
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to read server URL from prefs: ${e.message}")
        }
    }

    /** Resolve an HTTP base URL (for pairing REST calls) from mDNS or saved URL. */
    private fun currentHttpBaseUrl(): String {
        val discovered = nsdDiscovery?.getDiscoveredServerUrl()
        val url = when {
            !discovered.isNullOrBlank() -> discovered
            else -> wsServerUrl
        }
        return url.replace("ws://", "http://")
            .replace("wss://", "https://")
            .removeSuffix("/ws")
            .removeSuffix("/")
    }

    /**
     * Pairing fix: POST /api/tv/pair to claim our channel on the server.
     *
     * If server returns 409 CHANNEL_TAKEN, we log a clear error so the
     * owner can resolve the conflict (reassign one of the TVs).
     */
    private suspend fun registerChannelWithServer(channel: String) {
        try {
            val httpUrl = currentHttpBaseUrl()
            val request = Request.Builder()
                .url("$httpUrl/api/tv/pair")
                .post(okhttp3.RequestBody.create(
                    "application/json".toMediaType(),
                    """{"tvChannel":"$channel","deviceId":"$deviceId","model":"${android.os.Build.MODEL}","version":"1.0.0"}"""
                ))
                .build()
            val response = httpClient.newCall(request).execute()
            val body = response.body?.string() ?: ""
            if (response.isSuccessful) {
                Log.i(TAG, "✅ Pairing success: channel=$channel deviceId=$deviceId")
            } else if (response.code == 409) {
                Log.e(TAG, "❌ CHANNEL_TAKEN: $channel is held by another TV. Pick a different channel in Settings.")
                _connection.value = ConnState.Disconnected("CHANNEL_TAKEN", 0L)
            } else {
                Log.w(TAG, "Pairing HTTP ${response.code}: $body")
            }
        } catch (e: Exception) {
            Log.w(TAG, "Pairing request failed: ${e.message}")
        }
    }

    /**
     * Release channel claim on server when Service stops cleanly.
     */
    private suspend fun releaseChannelWithServer(channel: String) {
        try {
            val httpUrl = currentHttpBaseUrl()
            val request = Request.Builder()
                .url("$httpUrl/api/tv/pair")
                .delete(okhttp3.RequestBody.create(
                    "application/json".toMediaType(),
                    """{"tvChannel":"$channel","deviceId":"$deviceId"}"""
                ))
                .build()
            httpClient.newCall(request).execute().close()
            Log.i(TAG, "Released channel: $channel")
        } catch (e: Exception) {
            Log.w(TAG, "Release channel failed: ${e.message}")
        }
    }

    // ===== Notification =====
    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (nm.getNotificationChannel(CHANNEL_ID) == null) {
                nm.createNotificationChannel(
                    NotificationChannel(CHANNEL_ID, "TV Connection", NotificationManager.IMPORTANCE_LOW)
                        .apply {
                            setShowBadge(false)
                            enableLights(false)
                            enableVibration(false)
                        }
                )
            }
        }
    }

    private fun buildNotification(): Notification {
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
            @Suppress("DEPRECATION") Notification.Builder(this)
        }

        return builder
            .setSmallIcon(android.R.drawable.ic_menu_compass)
            .setContentTitle("TV Receiver Connected")
            .setContentText("Channel: $tvChannel")
            .setContentIntent(pi)
            .setOngoing(true)
            .setPriority(Notification.PRIORITY_LOW)
            .setColor(Color.parseColor("#00E5FF"))
            .build()
    }
}
