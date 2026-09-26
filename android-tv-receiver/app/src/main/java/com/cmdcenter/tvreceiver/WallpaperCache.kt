package com.cmdcenter.tvreceiver

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Handler
import android.os.Looper
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

/**
 * Shared wallpaper cache for the TV screensaver. The wallpaper is uploaded
 * from the operator app (Settings → Screensaver TV) and stored on the server
 * at /api/branding/wallpaper. Both the TimeUpOverlayService (screensaver over
 * HDMI) and MainActivity (idle screen) read from this cache.
 */
object WallpaperCache {
    @Volatile
    var bitmap: Bitmap? = null

    @Volatile
    private var fetching = false

    @Volatile
    private var lastAttemptMs = 0L

    private val mainHandler = Handler(Looper.getMainLooper())

    private val client = OkHttpClient.Builder()
        .connectTimeout(5, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .build()

    /** Drop the cached bitmap (e.g. on BRANDING_UPDATE so next fetch reloads). */
    fun invalidate() {
        bitmap = null
        lastAttemptMs = 0L
    }

    /**
     * Fetch the wallpaper from the server in a background thread. Invokes
     * [onLoaded] on the main thread with the decoded bitmap (or null when no
     * wallpaper is configured / fetch failed). Retries are throttled to one
     * attempt per 15s; concurrent calls are ignored — callers can poll
     * [bitmap].
     */
    fun fetchAsync(onLoaded: ((Bitmap?) -> Unit)? = null) {
        if (fetching) return
        val now = System.currentTimeMillis()
        if (now - lastAttemptMs < 15_000) return
        lastAttemptMs = now
        fetching = true
        Thread {
            var result: Bitmap? = null
            try {
                val base = TvConnectionService.resolvedHttpBase
                val req = Request.Builder().url("$base/api/branding/wallpaper").build()
                client.newCall(req).execute().use { resp ->
                    if (resp.isSuccessful) {
                        val bytes = resp.body?.bytes()
                        if (bytes != null && bytes.isNotEmpty()) {
                            result = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                        }
                    }
                }
            } catch (e: Exception) {
                android.util.Log.w("WallpaperCache", "fetch failed: ${e.message}")
            } finally {
                bitmap = result
                fetching = false
                if (onLoaded != null) {
                    mainHandler.post { onLoaded(result) }
                }
            }
        }.start()
    }
}
