# TV Receiver — Flow Documentation

> Dokumen ini menjelaskan alur koneksi **Operator App ↔ Server ↔ TV Receiver** secara lengkap setelah refactor pairing + service-centric.

---

## 🗺️ Overview Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        OPERATOR APP (Browser / React)                        │
│                                                                              │
│  User actions:                                                               │
│    1. Buka tab "Units" → klik ikon TV di station manapun                    │
│    2. Klik "Nyalakan TV" / "Matikan TV" / "Volume"                          │
│    3. (Owner) Buka tab "Perintah TV" → set channel pairing                  │
│                                                                              │
│  WS connection:                                                               │
│    ws://localhost:3000/ws                                                    │
│    Protocol: IDENTIFY (clientType=operator) → SUBSCRIBE → PUBLISH            │
└────────────────────────────┬─────────────────────────────────────────────────┘
                             │ WebSocket / HTTP
                             ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                          SERVER (server.ts)                                   │
│                                                                              │
│  ┌─────────────────┐  ┌──────────────────┐  ┌────────────────────────────┐  │
│  │ channelRegistry │  │  tvPairings     │  │   tvDeviceClaims          │  │
│  │ Map<channel,    │  │  (PGlite)       │  │   (in-memory Map)         │  │
│  │  Set<client>>    │  │  stationId →    │  │   tvChannel → deviceId    │  │
│  │                  │  │  tvChannel      │  │   (from POST /api/tv/pair)│  │
│  └────────┬────────┘  └────────┬─────────┘  └────────────┬─────────────┘  │
│           │                      │                          │                  │
│           │ WS SUBSCRIBE        │ REST POST                │ REST POST        │
│           │ (from TV)           │ /api/tv/pairings         │ /api/tv/pair    │
│           │                     │ (from Operator UI)        │ (from TV on boot)│
│           ▼                     ▼                          ▼                  │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │              ENDPOINTS & WS MESSAGE HANDLERS                           │   │
│  │                                                                       │   │
│  │  WS handlers:                                                         │   │
│  │    IDENTIFY  → clientType = "tv" | "operator"                       │   │
│  │    SUBSCRIBE → subscribeToChannel() [with uniqueness check]         │   │
│  │    PUBLISH    → publishToChannel() [TV_COMMAND_ACK anti-fraud]       │   │
│  │    TV_CONTROL (legacy) → dispatchTVCommand() → tvAdapters[] stub    │   │
│  │                                                                       │   │
│  │  REST endpoints:                                                      │   │
│  │    POST   /api/channel/publish  → publishToChannel()                │   │
│  │    POST   /api/tv/pair          → claim channel (deviceId tracking)  │   │
│  │    DELETE /api/tv/pair          → release channel claim              │   │
│  │    GET    /api/tv/pair          → list all claims (diagnostics)      │   │
│  │    POST   /api/tv/pairings      → save station→tvChannel mapping     │   │
│  │    GET    /api/tv/pairings      → list station↔tv pairings          │   │
│  │    POST   /api/tv/presence      → check if channel is live            │   │
│  └───────────────────────────────────────────────────────────────────────┘   │
└────────────────────────────┬─────────────────────────────────────────────────┘
                             │ WebSocket (CHANNEL_MESSAGE / TV_COMMAND_ACK)
                             ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                    ANDROID TV BOX (TV Receiver App)                          │
│                                                                              │
│  Architecture: Service-centric (TvConnectionService owns WS + state)        │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  TvConnectionService (STICKY FOREGROUND — survives Activity death)  │    │
│  │                                                                       │    │
│  │  onCreate():                                                         │    │
│  │    1. StateBus.state = _state   ← shared with MainActivity         │    │
│  │    2. StateBus.connection = _connection                             │    │
│  │                                                                       │    │
│  │  onStartCommand(ACTION_START, channel):                              │    │
│  │    1. POST /api/tv/pair  → claim channel on server                  │    │
│  │       • 200 OK → channel claimed                                     │    │
│  │       • 409 CONFLICT → another TV holds it → stopService + warn     │    │
│  │    2. startNsdDiscovery()  → mDNS to find server on LAN             │    │
│  │    3. connectWebSocket()   → ws://<server>:3000/ws                  │    │
│  │                                                                       │    │
│  │  WS message handlers:                                                │    │
│  │    CHANNEL_MESSAGE {command:"power_on"}  → wakeScreen() + HDMI      │    │
│  │    CHANNEL_MESSAGE {command:"power_off"} → sleepScreen()             │    │
│  │    CHANNEL_MESSAGE {command:"RECONNECT_TV"} → WS-only reconnect      │    │
│  │    CHANNEL_MESSAGE {payload:{action:"show",text:"..."}} → branding  │    │
│  │                                                                       │    │
│  │  State machine (TvState):                                            │    │
│  │    IDLE → (session starts) → ACTIVE → (5min left) → WARNING        │    │
│  │    WARNING → (time up) → ENDED (show TimeUpOverlayService)           │    │
│  │    ACTIVE → (WS disconnects) → TAMPER alert                         │    │
│  └──────────────────────────┬──────────────────────────────────────────┘    │
│                             │ StateFlow observed by                         │
│                             ▼                                                │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  MainActivity (UI only — no WS, no state logic)                      │    │
│  │                                                                       │    │
│  │  observeConnectionState():                                           │    │
│  │    TvConnectionService.StateBus.state.collect { renderTvState(it) }   │    │
│  │    TvConnectionService.StateBus.connection.collect { renderConn(it) }  │    │
│  │                                                                       │    │
│  │  Commands dispatched to Service via Intent actions:                   │    │
│  │    ACTION_DISMISS_TIMEUP → TimeUpOverlayService.dismiss()            │    │
│  │    ACTION_SWITCH_HDMI   → TvConnectionService.switchToHdmiInput()   │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  TimeUpOverlayService (TYPE_APPLICATION_OVERLAY — shows over HDMI)  │    │
│  │                                                                       │    │
│  │  show(customerName):                                                 │    │
│  │    1. if (!Settings.canDrawOverlays()) → fallback to notification   │    │
│  │    2. addView(full-screen "WAKTU HABIS" overlay, CENTER, 90% black) │    │
│  │    3. ToneGenerator: 3 short beeps (300ms each, 500ms apart)        │    │
│  │    4. autoDismiss() after 120 seconds                               │    │
│  │                                                                       │    │
│  │  dismiss():                                                         │    │
│  │    windowManager.removeView(overlayView) + stopSelf()               │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  BrandingOverlayService (existing — corner overlay, still works)    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  NsdDiscovery (mDNS — discovers server on LAN automatically)        │    │
│  │                                                                       │    │
│  │  browse `_commandcenter._tcp.local` → onServerDiscovered callback   │    │
│  │  register `_tvreceiver._tcp.local` → advertises channel + model     │    │
│  │  getDiscoveredServerUrl() → returns "ws://<ip>:<port>" for pairing  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 🔄 Flow 1: TV First Boot (New Installation)

```
TIMELINE                          WHO → WHAT
────────────────────────────────────────────────────────────────────────────────

[1] User install APK + open
    TV
    │
    ├─ MainActivity.onCreate()
    │    ├─ resolveChannelName() → "" (SharedPrefs kosong)
    │    └─ tvChannel.isBlank() → TRUE
    │         └─ "⚠️ No channel configured"
    │              ├─ Log.w("⚠️ No channel configured...")
    │              └─ startActivity(SettingsActivity)
    │
[2] User di SettingsActivity
    │
    ├─ channelInput.setText("PS5_01")
    ├─ saveButton.click()
    │    └─ SharedPreferences.put("tv_channel_name", "PS5_01")
    │         └─ finish() + startActivity(MainActivity)
    │
[3] MainActivity.onCreate() ulang
    │
    ├─ resolveChannelName() → "tv:PS5_01"
    ├─ TvConnectionService.startWithChannel(this, "tv:PS5_01")
    │    └─ startForeground() + onStartCommand(ACTION_START)
    │
[4] TvConnectionService.onStartCommand()
    │
    ├─ POST /api/tv/pair
    │    body: {tvChannel:"PS5_01", deviceId:"A4B2C1D3", model:"Mi Box S", version:"1.0.0"}
    │    │
    │    ├─ [if first time] → 200 OK, server stores tvDeviceClaims["tv:PS5_01"] = {deviceId, model}
    │    │    └─ Log: "✅ Pairing success: channel=tv:PS5_01 deviceId=A4B2C1D3"
    │    │
    │    └─ [if channel taken by another TV] → 409 CONFLICT
    │         └─ Log: "❌ CHANNEL_TAKEN"
    │              └─ ConnState.Disconnected("CHANNEL_TAKEN")
    │                   └─ stopSelf() + Toast "Channel taken"
    │
    ├─ startNsdDiscovery()
    │    └─ browse _commandcenter._tcp.local → onServerDiscovered(host,port)
    │
    ├─ connectWebSocket()
    │    ├─ ws.send(IDENTIFY {clientType:"tv"})
    │    ├─ ws.send(SUBSCRIBE {channels:["tv:PS5_01","tv:all"]})
    │    └─ startHeartbeat(5s interval)
    │
[5] Server side (on SUBSCRIBE)
    │
    ├─ subscribeToChannel(client, "tv:PS5_01")
    │    ├─ channelRegistry.get("tv:PS5_01") → existing.size > 0?
    │    │    ├─ [no existing] → add to registry, markChannelActive()
    │    │    └─ [another TV already there] → CHANNEL_TAKEN error to this client
    │    └─ broadcast TV_PRESENCE_UPDATE → operators
    │
[6] Done — TV 🟢 "Connected" di SettingsActivity status
```

---

## 🔄 Flow 2: Operator Kirim Command (Power ON)

```
TIMELINE                          WHO → WHAT
────────────────────────────────────────────────────────────────────────────────

[1] Operator di browser
    │
    ├─ Klik "Nyalakan TV" di TVControlPanel (Station 01)
    │    ├─ App.tsx::handleTvControl(stationId="st-01", command="power_on")
    │    │    ├─ stationChannelMap("st-01") → resolveStationTvChannel()
    │    │    │    ├─ cek tvPairings[] → found: tv:PS5_01 ✅
    │    │    │    └─ return "tv:PS5_01"
    │    │    │
    │    │    └─ ws.publishToChannel("tv:PS5_01", {command:"power_on", commandId:"cmd-uuid"})
    │    │         └─ WS.send({type:"PUBLISH", channel:"tv:PS5_01", data:{...}})
    │
[2] Server terima PUBLISH
    │
    ├─ publishToChannel("tv:PS5_01", {command:"power_on", commandId})
    │    ├─ channelRegistry.get("tv:PS5_01") → Set<ChannelClient>
    │    ├─ socket.send(JSON.stringify({
    │    │       type:"CHANNEL_MESSAGE",
    │    │       channel:"tv:PS5_01",
    │    │       data:{command:"power_on", commandId:"cmd-uuid"}
    │    │  }))
    │    └─ return sent=1
    │
[3] TV terima CHANNEL_MESSAGE
    │
    ├─ TvConnectionService: onMessage()
    │    ├─ data.optString("command") → "power_on"
    │    └─ handleIncomingCommand(data)
    │         ├─ wakeScreen()
    │         │    └─ PowerManager.WAKE_LOCK → SCREEN_ON
    │         ├─ switchToHdmiInput()
    │         │    └─ TvInputManager → launch HDMI Activity
    │         ├─ sendAck(channel:"tv:PS5_01", command:"power_on", success:true)
    │         │    └─ ws.send({type:"TV_COMMAND_ACK", channel, commandId, success:true})
    │         └─ Log: "✅ Switched input to: HDMI1"
    │
[4] Server propagasi TV_COMMAND_ACK
    │
    ├─ broadcast TV_COMMAND_ACK → ALL operators
    │    └─ semua ws client dapat: {type:"TV_COMMAND_ACK", channel, command, success}
    │
[5] Operator dapat ACK
    │
    ├─ App.tsx: options.onTvCommandAck({success:true, ...})
    │    └─ toast("✅ TV PS5_01 menyala")
```

---

## 🔄 Flow 3: Sesi Habis (WAKTU HABIS)

```
TIMELINE                          WHO → WHAT
────────────────────────────────────────────────────────────────────────────────

[1] Server broadcast WS_TIMER_TICK (every 1s)
    │
    └─ TvConnectionService: onMessage("WS_TIMER_TICK")
         ├─ reconcileSessionState(stations[])
         │    └─ find station matching our tvChannel + check endTime
         │
         └─ [jika remaining ≤ 0 AND state bukan Ended]
              ├─ _state.value = TvState.Ended(sessionId, customer)
              └─ showTimeUpOverlay(customer)

[2] TimeUpOverlayService.show()
    │
    ├─ if (!Settings.canDrawOverlays()) → skip overlay, only tone
    ├─ windowManager.addView(full-screen "WAKTU HABIS" layout)
    │    ├─ bg = #E6000000 (90% black)
    │    ├─ "⏰ WAKTU HABIS" (gold, 72sp, bold)
    │    ├─ customerName (white, 36sp)
    │    └─ "Silakan ke kasir untuk tambah sesi" (gray, 24sp)
    └─ ToneGenerator: beep-beep-beep (3x 300ms, 500ms apart)

[3] Auto-dismiss after 120 seconds
    │
    └─ handler.postDelayed(autoDismissRunnable, 120_000)
         └─ TimeUpOverlayService.dismiss()
              ├─ windowManager.removeView(overlayView)
              └─ stopSelf()

[4] Operator klik "End Session" (atau auto end dari server)
    │
    ├─ Server:收到 END_SESSION → power_off broadcast
    ├─ TvConnectionService: CHANNEL_MESSAGE {command:"power_off"}
    │    ├─ sleepScreen()
    │    │    └─ [device owner] devicePolicyManager.lockNow()
    │    │    └─ [non-owner] screenBrightness = 0
    │    └─ TvConnectionService.StateBus.state = Idle
    │
    └─ TimeUpOverlayService.dismiss() (jika masih showing)
         └─ [auto from END_SESSION flow, atau manual dari operator]
```

---

## 🔄 Flow 4: Conflict Resolution (2 TV Pakai Channel Sama)

```
TIMELINE                          WHO → WHAT
────────────────────────────────────────────────────────────────────────────────

[1] TV-A boot, channel "PS5_01" (fresh install, no SharedPrefs)
    │
    ├─ MainActivity: resolveChannelName() → ""
    ├─ Auto-open SettingsActivity
    ├─ User set "PS5_01" → save
    └─ TvConnectionService.startWithChannel("tv:PS5_01")

[2] TV-A: POST /api/tv/pair
    │
    ├─ body: {tvChannel:"PS5_01", deviceId:"AAAA1111"}
    ├─ server: tvDeviceClaims["tv:PS5_01"] = {deviceId:"AAAA1111"}
    └─ Log: "✅ Pairing success: channel=tv:PS5_01 deviceId=AAAA1111"

[3] TV-A: WS SUBSCRIBE "tv:PS5_01"
    │
    ├─ server: channelRegistry.get("tv:PS5_01") → empty, OK to add
    ├─ add to registry, markChannelActive()
    └─ Log: "[ws-channels] Client subscribed to \"tv:PS5_01\" (now 1 subscribers)"

[4] TV-B boot, user SALAH set "PS5_01" juga
    │
    ├─ MainActivity: channel = "tv:PS5_01"
    └─ TvConnectionService.startWithChannel("tv:PS5_01")

[5] TV-B: POST /api/tv/pair
    │
    ├─ body: {tvChannel:"PS5_01", deviceId:"BBBB2222"}
    ├─ server: existing = tvDeviceClaims["tv:PS5_01"] → {deviceId:"AAAA1111"}
    ├─ existing.deviceId !== "BBBB2222" → HTTP 409 CONFLICT
    └─ Log: "❌ CHANNEL_TAKEN: channel=tv:PS5_01 already claimed by deviceId=AAAA1111"

[6] TV-B: WS SUBSCRIBE attempt
    │
    ├─ ws.send(SUBSCRIBE {channels:["tv:PS5_01"]})
    ├─ server: channelRegistry.get("tv:PS5_01") → TV-A already there
    ├─ other.clientType === "tv" → REJECT (no add to registry)
    └─ ws.send({type:"CHANNEL_TAKEN", channel:"tv:PS5_01",
                  message:"Channel tv:PS5_01 is held by another TV..."})

[7] TV-B: process CHANNEL_TAKEN (NEW — WS handler)
    │
    ├─ Log.e("❌ CHANNEL_TAKEN: tv:PS5_01 — Channel held by another TV")
    ├─ wsHandler.post { Toast.makeText("❌ Channel PS5_01 taken by another TV\n
    │    Buka Settings → ganti ke channel lain", LONG).show() }
    ├─ startActivity(SettingsActivity) ← auto-open so user can fix
    ├─ _connection.value = ConnState.Disconnected("CHANNEL_TAKEN")
    ├─ wsHandler.removeCallbacksAndMessages(null) ← STOP reconnect loop
    └─ onClosed(code, "CHANNEL_TAKEN") → early return, no scheduleReconnect()

[8] Owner resolution
    │
    ├─ TV-B shows Settings screen with error
    ├─ Owner: change channel to "PS5_02" → save
    ├─ POST /api/tv/pair {tvChannel:"PS5_02", deviceId:"BBBB2222"}
    │    └─ 200 OK → tvDeviceClaims["tv:PS5_02"] = {deviceId:"BBBB2222"}
    ├─ MainActivity reconnects with "tv:PS5_02"
    ├─ WS SUBSCRIBE "tv:PS5_02" → accepted ✅
    └─ Status: 🟢 Connected ✅
```

---

## 🔄 Flow 5: mDNS Auto-Discovery

```
TIMELINE                          WHO → WHAT
────────────────────────────────────────────────────────────────────────────────

[1] Server starts (npm run dev)
    │
    └─ server-mdns.ts: startMdns(PORT=3000, version)
         ├─ bonjour.publish({name:"CommandCenter-win-<port>", type:"commandcenter", port:3000})
         └─ bonjour.find({type:"tvreceiver"}) → listen for TV up/down

[2] TV boots, startNsdDiscovery()
    │
    ├─ nsdManager.discoverServices("_commandcenter._tcp.")
    ├─ [2-5s timeout — if no server found]
    │    └─ onServerLost() → fallback to WS_SERVER_URL_FALLBACK
    └─ onServiceFound(service)
         ├─ nsdManager.resolveService(service) → host + port
         └─ onServerDiscovered(host, port)
              ├─ wsServerUrl = "ws://192.168.1.5:3000"
              ├─ webSocket?.close(4002, "server URL changed via mDNS")
              └─ connectWebSocket() ← reconnect with resolved URL

[3] TV advertise itself (for server browse)
    │
    └─ nsdManager.registerService({
         serviceName: "TVReceiver-PS5_01",
         serviceType: "_tvreceiver._tcp.",
         port: 8765,
         txt: {channel:"PS5_01", model:"Mi Box S", version:"1.0.0", device_id:"A4B2C1D3"}
       })
       └─ Server: server-mdns.ts browser.on("up") → DiscoveredTV map update

[4] Server advertise (repeat every 30s automatically by bonjour-service)
    │
    └─ Advertised as "_commandcenter._tcp.local" with TXT:
         {version:"1.0.0", platform:"win32", protocol:"ws", path:"/ws"}
       └─ TV on next scan picks it up → pair
```

---

## 📡 API Reference (New + Existing)

### POST /api/tv/pair — TV claims a channel

**Request:**
```json
{
  "tvChannel": "PS5_01",
  "deviceId": "A4B2C1D3",
  "model": "Mi Box S",
  "version": "1.0.0"
}
```

**Response 200 OK:**
```json
{
  "ok": true,
  "channel": "tv:PS5_01",
  "claimed": true,
  "deviceId": "A4B2C1D3",
  "claimedAt": 1723891200000
}
```

**Response 409 CONFLICT:**
```json
{
  "ok": false,
  "error": "CHANNEL_TAKEN",
  "channel": "tv:PS5_01",
  "claimedBy": "AAAA1111",
  "message": "Channel tv:PS5_01 is already registered to another TV. Please pick a different channel in Settings."
}
```

### DELETE /api/tv/pair — TV releases a channel claim

**Request:**
```json
{ "tvChannel": "PS5_01", "deviceId": "A4B2C1D3" }
```

**Response:**
```json
{ "ok": true, "released": true }
```

### GET /api/tv/pair — List all channel claims (diagnostics)

**Response:**
```json
{
  "claims": {
    "tv:PS5_01": { "deviceId": "AAAA1111", "model": "Mi Box S", "version": "1.0.0", "claimedAt": 1723891200000 },
    "tv:PS5_02": { "deviceId": "BBBB2222", "model": "Nvidia Shield", "version": "1.0.0", "claimedAt": 1723891300000 }
  },
  "count": 2
}
```

---

## ⚠️ Known Limitations

| Issue | Workaround |
|---|---|
| `TvInputManager` on some Android TV boxes only lists **built-in** TV input, not physical HDMI ports | HDMI CEC (CECClient API) or `am start` intent to HDMI picker Activity |
| `SYSTEM_ALERT_WINDOW` permission requires manual grant on some OEM TV | Guide user: Settings → Apps → Special Access → Display over other apps |
| mDNS blocked on guest WiFi / captive portal | Fallback: user sets manual server URL in Settings |
| None — `CHANNEL_TAKEN` fully handled | WS `CHANNEL_TAKEN` message shows Toast + auto-opens Settings |

---

## 🧪 Debug Commands

```bash
# Lihat semua channel claims
curl http://localhost:3000/api/tv/pair

# Cek apakah channel PS5_01 online
curl -X POST http://localhost:3000/api/tv/presence \
  -H "Content-Type: application/json" \
  -d '{"channel":"tv:PS5_01"}'

# Cek TV presence (WS subscriber)
curl http://localhost:3000/api/tv/pairings

# Log server pairing events
grep -i "tv-pair\|CHANNEL_TAKEN" server.log

# Log TV
adb logcat -v time -s TvConnection:I TimeUpOverlay:I TVReceiver:I
```
