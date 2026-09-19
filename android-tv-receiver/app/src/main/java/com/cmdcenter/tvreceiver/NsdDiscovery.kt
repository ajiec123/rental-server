package com.cmdcenter.tvreceiver

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.os.Build
import android.util.Log

/**
 * NsdDiscovery — DNS-SD / mDNS layer untuk APK TV Receiver.
 *
 * Dua fungsi utama:
 *
 * 1. **Discover server** — browse `_commandcenter._tcp.local` di LAN.
 *    Kalau ketemu → ambil host:port → kasih ke MainActivity untuk connect
 *    WebSocket. TV jadi **tidak perlu** setting server IP manual lagi.
 *
 * 2. **Advertise this TV** — register `_tvreceiver._tcp.local` dengan TXT
 *    record berisi channel name + model + version. Server browse service
 *    ini → otomatis tahu ada TV baru tanpa perlu konfigurasi.
 *
 * Service type convention (harus sama dengan server-mdns.ts):
 *   - Server: `_commandcenter._tcp.`
 *   - TV:     `_tvreceiver._tcp.`
 *
 * Edge cases:
 *   - mDNS tidak selalu bekerja di semua router/WiFi (multicast filtering).
 *     → Fallback: kalau discovery gagal dalam 5 detik, pakai WS_SERVER_URL
 *       yang sudah di-hardcode atau disimpan user di SharedPreferences.
 *   - TV pindah WiFi / network → harus restart discovery.
 *   - Multiple servers di LAN → ambil yang pertama, lalu pakai `onServiceLost`
 *     untuk fallback ke server lain.
 */
class NsdDiscovery(
    private val context: Context,
    private val onServerDiscovered: (host: String, port: Int) -> Unit,
    private val onServerLost: () -> Unit
) {

    companion object {
        private const val TAG = "TVNsdDiscovery"
        const val SERVER_SERVICE_TYPE = "_commandcenter._tcp."
        const val TV_SERVICE_TYPE = "_tvreceiver._tcp."
        const val DEFAULT_WS_PATH = "/ws"
        const val DISCOVERY_TIMEOUT_MS = 5_000L
    }

    private val nsdManager: NsdManager =
        context.getSystemService(Context.NSD_SERVICE) as NsdManager

    private var registeredServiceName: String? = null
    private var resolvedServerHost: String? = null
    private var resolvedServerPort: Int = 0

    // Guard against concurrent resolveService calls — Android NSD throws
    // "listener already in use" if resolveListener is reused before the
    // previous resolve completes. This queue ensures we resolve one at a time.
    @Volatile private var isResolving = false
    private val pendingResolveQueue = java.util.concurrent.ConcurrentLinkedQueue<NsdServiceInfo>()
    private val resolveLock = Any()

    // ===== Discovery listener: find _commandcenter._tcp. =====
    private val discoveryListener = object : NsdManager.DiscoveryListener {
        override fun onDiscoveryStarted(regType: String) {
            Log.d(TAG, "🔍 NSD discovery started for $regType")
        }

        override fun onServiceFound(service: NsdServiceInfo) {
            Log.d(TAG, "📡 Service found: ${service.serviceName} type=${service.serviceType}")
            if (service.serviceType != SERVER_SERVICE_TYPE) {
                Log.d(TAG, "Skipping non-server service")
                return
            }
            // Queue and resolve one at a time to avoid "listener already in use"
            pendingResolveQueue.offer(service)
            drainResolveQueueSafely()
        }

        override fun onServiceLost(service: NsdServiceInfo) {
            Log.w(TAG, "⚠️ Service lost: ${service.serviceName}")
            if (service.serviceName.contains("CommandCenter", ignoreCase = true) ||
                resolvedServerHost != null
            ) {
                resolvedServerHost = null
                resolvedServerPort = 0
                onServerLost()
            }
        }

        override fun onDiscoveryStopped(serviceType: String) {
            Log.d(TAG, "Discovery stopped: $serviceType")
        }

        override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {
            Log.e(TAG, "❌ Start discovery failed for $serviceType (code=$errorCode)")
            // Common code: NsdManager.FAILURE_ALREADY_ACTIVE = 3
            // → just continue, discovery is already running
        }

        override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {
            Log.e(TAG, "❌ Stop discovery failed for $serviceType (code=$errorCode)")
        }
    }

    private val resolveListener = object : NsdManager.ResolveListener {
        override fun onServiceResolved(service: NsdServiceInfo) {
            synchronized(resolveLock) {
                isResolving = false
            }
            val host = service.host?.hostAddress ?: run {
                Log.w(TAG, "Service resolved but no host address")
                drainResolveQueueSafely()
                return
            }
            val port = service.port
            resolvedServerHost = host
            resolvedServerPort = port
            Log.i(TAG, "✅ Server resolved: $host:$port (name=${service.serviceName})")
            onServerDiscovered(host, port)
            // Process any services that arrived while we were resolving
            drainResolveQueueSafely()
        }

        override fun onResolveFailed(service: NsdServiceInfo, errorCode: Int) {
            synchronized(resolveLock) {
                isResolving = false
            }
            Log.e(TAG, "❌ Resolve failed: ${service.serviceName} (code=$errorCode)")
            drainResolveQueueSafely()
        }
    }

    /**
     * Drain pending resolve queue one item at a time. Safe to call repeatedly.
     * Wrapped in try-catch so an NSD internal exception never bubbles up
     * and crashes the app via the NSD handler thread.
     */
    private fun drainResolveQueueSafely() {
        synchronized(resolveLock) {
            if (isResolving) return
            val next = pendingResolveQueue.poll() ?: return
            isResolving = true
            try {
                nsdManager.resolveService(next, resolveListener)
            } catch (e: IllegalArgumentException) {
                // "listener already in use" — release flag and retry on next tick
                Log.w(TAG, "resolveService race detected, releasing flag: ${e.message}")
                isResolving = false
                // Re-queue the service and try again shortly
                pendingResolveQueue.offer(next)
                android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                    drainResolveQueueSafely()
                }, 250)
            } catch (e: Exception) {
                Log.e(TAG, "resolveService threw unexpected error: ${e.message}")
                isResolving = false
            }
        }
    }

    // ===== Registration listener: advertise _tvreceiver._tcp. =====
    private val registrationListener = object : NsdManager.RegistrationListener {
        override fun onServiceRegistered(service: NsdServiceInfo) {
            registeredServiceName = service.serviceName
            Log.i(TAG, "✅ TV registered as '${service.serviceName}' on port ${service.port}")
        }

        override fun onRegistrationFailed(service: NsdServiceInfo, errorCode: Int) {
            Log.e(TAG, "❌ TV registration failed: ${service.serviceName} (code=$errorCode)")
        }

        override fun onServiceUnregistered(arg0: NsdServiceInfo) {
            Log.i(TAG, "TV unregistered: ${arg0.serviceName}")
        }

        override fun onUnregistrationFailed(service: NsdServiceInfo, errorCode: Int) {
            Log.e(TAG, "❌ Unregistration failed: ${service.serviceName} (code=$errorCode)")
        }
    }

    /**
     * Start discovering _commandcenter._tcp. services on the LAN.
     * Safe to call multiple times.
     */
    fun startServerDiscovery() {
        try {
            nsdManager.discoverServices(
                SERVER_SERVICE_TYPE,
                NsdManager.PROTOCOL_DNS_SD,
                discoveryListener
            )
            // Auto-stop discovery after timeout to save battery.
            // If server isn't found in 5s, fallback to manual URL.
            android.os.Handler(android.os.Looper.getMainLooper())
                .postDelayed({
                    if (resolvedServerHost == null) {
                        Log.w(TAG, "⏱️ No server found in ${DISCOVERY_TIMEOUT_MS}ms — falling back to manual URL")
                        // Don't stop discovery itself; let it keep running.
                        // Just notify that fallback should be used.
                        onServerLost()
                    }
                }, DISCOVERY_TIMEOUT_MS)
        } catch (e: IllegalArgumentException) {
            // Already discovering (e.g. after activity restart) — that's fine
            Log.w(TAG, "startServerDiscovery already active: ${e.message}")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start server discovery: ${e.message}")
            onServerLost()
        }
    }

    /**
     * Stop server discovery. Call in onDestroy to release resources.
     */
    fun stopServerDiscovery() {
        try {
            nsdManager.stopServiceDiscovery(discoveryListener)
        } catch (e: Exception) {
            Log.w(TAG, "Stop discovery error: ${e.message}")
        }
    }

    /**
     * Returns the URL of the currently discovered server, or null if none.
     * Format: "ws://<host>:<port>" so it can be plugged straight into
     * WebSocket connect call. Used by Pairing fix to make HTTP requests
     * to the same server discovered via mDNS.
     */
    fun getDiscoveredServerUrl(): String? {
        val host = resolvedServerHost ?: return null
        val port = resolvedServerPort
        return if (port > 0) "ws://$host:$port" else null
    }

    /**
     * Register this TV as `_tvreceiver._tcp.local` so the server can find it.
     *
     * @param port HTTP/WS port the APK is listening on (default 8765)
     * @param channelName Channel name to advertise in TXT record (e.g. "PS5_01")
     * @param model Android device model (e.g. "Mi Box S")
     * @param version APK version (e.g. "1.0.0")
     * @param deviceId Short hash of ANDROID_ID for unique identification
     */
    fun registerTVService(
        port: Int,
        channelName: String,
        model: String,
        version: String,
        deviceId: String
    ) {
        val serviceInfo = NsdServiceInfo().apply {
            // Service name must be unique on the LAN. Use channel name
            // when available so operator sees "PS5_01" in their browser UI.
            serviceName = if (channelName.isNotBlank()) {
                "TVReceiver-$channelName"
            } else {
                "TVReceiver-$deviceId"
            }
            serviceType = TV_SERVICE_TYPE
            this.port = port
            // TXT records — small key/value pairs. Total ≤ 1300 bytes.
            setAttribute("channel", channelName)
            setAttribute("model", model)
            setAttribute("version", version)
            setAttribute("device_id", deviceId)
            setAttribute("protocol", "ws")
            setAttribute("path", DEFAULT_WS_PATH)
        }

        try {
            nsdManager.registerService(
                serviceInfo,
                NsdManager.PROTOCOL_DNS_SD,
                registrationListener
            )
            Log.i(TAG, "📺 Advertising TV channel='$channelName' on port $port")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to register TV service: ${e.message}")
        }
    }

    /**
     * Unregister TV service (called in onDestroy).
     */
    fun unregisterTVService() {
        try {
            nsdManager.unregisterService(registrationListener)
        } catch (e: Exception) {
            Log.w(TAG, "Unregister error: ${e.message}")
        }
    }

    /**
     * Get currently-resolved server URL (if any). Returns null if not found.
     */
    fun getResolvedServerUrl(): String? {
        if (resolvedServerHost == null || resolvedServerPort == 0) return null
        return "ws://$resolvedServerHost:$resolvedServerPort$DEFAULT_WS_PATH"
    }
}
