import { useEffect, useRef, useState, useCallback } from 'react';
import { GamingStation, Transaction } from '../types';

interface UseWebSocketOptions {
  onStateUpdate?: (stations: GamingStation[], transactions: Transaction[]) => void;
  onLastTransaction?: (tx: Transaction) => void;
  onActionMessage?: (msg: string) => void;
  onTvPresenceUpdate?: (presence: Record<string, { subscribers: number; lastSeen: number; online: boolean }>) => void;
  onTvCommandAck?: (ack: { channel: string; command: string; success: boolean; stationId?: string | null; error?: string | null; timestamp: number }) => void;
  onTvPairingsUpdate?: (pairings: Array<{ stationId: string; tvChannel: string; label?: string; createdAt?: number; lastSeenAt?: number }>) => void;
  onTvTamperAlert?: (alert: { stationId: string; stationName: string; reason: string; timestamp: number }) => void;
  /** Server ack untuk setiap PUBLISH: recipients=0 berarti tidak ada TV yang tersubscriksi di channel itu. */
  onPublishAck?: (ack: { channel: string; recipients: number; timestamp: number }) => void;
  /** Klaim channel dari TV receiver (POST /api/tv/pair saat TV boot). */
  onTvClaimsUpdate?: (claims: Record<string, { deviceId: string; model: string; version: string; claimedAt: number }>) => void;
}

export function useWebSocketTimer(options: UseWebSocketOptions = {}) {
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [stations, setStations] = useState<GamingStation[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [lastTick, setLastTick] = useState<number>(Date.now());
  const socketRef = useRef<WebSocket | null>(null);
  // Simpan options di ref: identitas objek options dari caller berubah tiap
  // render (inline object). Tanpa ini, `connect` dibuat ulang tiap render →
  // useEffect menutup & membuka socket setiap detik (reconnect storm).
  const optionsRef = useRef(options);
  optionsRef.current = options;
  // Penanda close disengaja (cleanup/unmount) agar tidak dijadwalkan reconnect.
  const manualCloseRef = useRef(false);

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    try {
      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      socket.onopen = () => {
        console.log('[WebSocket] Connected to Server Timer Engine');
        setIsConnected(true);
      };

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          const opts = optionsRef.current;

          if (payload.type === 'INIT_STATE' || payload.type === 'STATE_UPDATE') {
            if (payload.stations) {
              setStations(payload.stations);
            }
            if (payload.transactions) {
              setTransactions(payload.transactions);
            }
            if (opts.onStateUpdate && payload.stations && payload.transactions) {
              opts.onStateUpdate(payload.stations, payload.transactions);
            }
            if (payload.lastTransaction && opts.onLastTransaction) {
              opts.onLastTransaction(payload.lastTransaction);
            }
            if (payload.actionMessage && opts.onActionMessage) {
              opts.onActionMessage(payload.actionMessage);
            }
          } else if (payload.type === 'WS_TIMER_TICK') {
            setLastTick(payload.timestamp || Date.now());
            if (payload.stations) {
              setStations(payload.stations);
            }
          } else if (payload.type === 'TV_PRESENCE_UPDATE' && payload.presence) {
            // Server broadcast: which TV channels currently have an active subscriber.
            const now = Date.now();
            const STALE_MS = 15_000;
            const map: Record<string, { subscribers: number; lastSeen: number; online: boolean }> = {};
            for (const [ch, info] of Object.entries(payload.presence as Record<string, { subscribers: number; lastSeen: number }>)) {
              map[ch] = {
                ...info,
                online: info.subscribers > 0 && now - info.lastSeen < STALE_MS,
              };
            }
            if (opts.onTvPresenceUpdate) opts.onTvPresenceUpdate(map);
          } else if (payload.type === 'TV_COMMAND_ACK') {
            if (opts.onTvCommandAck) {
              opts.onTvCommandAck({
                channel: payload.channel,
                command: payload.command,
                success: !!payload.success,
                stationId: payload.stationId ?? null,
                error: payload.error ?? null,
                timestamp: payload.timestamp || Date.now(),
              });
            }
          } else if (payload.type === 'TV_PAIRINGS_UPDATE' && Array.isArray(payload.pairings)) {
            if (opts.onTvPairingsUpdate) {
              opts.onTvPairingsUpdate(payload.pairings);
            }
          } else if (payload.type === 'TV_PAIR_UPDATE' && payload.claims) {
            // Klaim channel dari TV (self-registration saat boot).
            if (opts.onTvClaimsUpdate) opts.onTvClaimsUpdate(payload.claims);
          } else if (payload.type === 'PUBLISH_ACK') {
            if (opts.onPublishAck) {
              opts.onPublishAck({
                channel: payload.channel,
                recipients: payload.recipients ?? 0,
                timestamp: payload.timestamp || Date.now(),
              });
            }
          } else if (payload.type === 'TV_TAMPER_ALERT') {
            if (opts.onTvTamperAlert) {
              opts.onTvTamperAlert({
                stationId: payload.stationId,
                stationName: payload.stationName,
                reason: payload.reason || 'TV offline during active session',
                timestamp: payload.timestamp || Date.now(),
              });
            }
          }
        } catch (e) {
          console.error('[WebSocket] Error parsing socket data:', e);
        }
      };

      socket.onclose = () => {
        setIsConnected(false);
        if (manualCloseRef.current) return;
        console.log('[WebSocket] Disconnected from server. Reconnecting in 3s...');
        setTimeout(() => connect(), 3000);
      };

      socket.onerror = (err) => {
        console.error('[WebSocket] Socket error:', err);
        socket.close();
      };
    } catch (e) {
      console.error('[WebSocket] Failed to instantiate WebSocket:', e);
      if (!manualCloseRef.current) {
        setTimeout(() => connect(), 3000);
      }
    }
  }, []);

  useEffect(() => {
    manualCloseRef.current = false;
    connect();
    return () => {
      manualCloseRef.current = true;
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, [connect]);

  const startSessionViaWS = useCallback((data: {
    stationId: string;
    customerName: string;
    customerPhone?: string;
    durationMinutes: number;
    paymentMethod: 'QRIS' | 'Cash' | 'Debit' | 'E-Wallet';
    amount: number;
    gamePlaying?: string;
    cashierName: string;
  }) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'START_SESSION',
        data
      }));
    }
  }, []);

  const endSessionViaWS = useCallback((stationId: string) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'END_SESSION',
        data: { stationId }
      }));
    }
  }, []);

  const extendSessionViaWS = useCallback((data: {
    stationId: string;
    extraMinutes: number;
    extraAmount: number;
    cashierName: string;
  }) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'EXTEND_SESSION',
        data
      }));
    }
  }, []);

  const setStatusViaWS = useCallback((stationId: string, status: 'available' | 'occupied' | 'warning' | 'maintenance') => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'SET_STATION_STATUS',
        data: { stationId, status }
      }));
    }
  }, []);

  const sendMoveSessionViaWS = useCallback((sourceStationId: string, targetStationId: string) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'MOVE_SESSION',
        data: { sourceStationId, targetStationId },
      }));
      return true;
    }
    return false;
  }, []);

  // ===== New sync methods for all DB-backed actions =====
  const sendStartSessionViaWS = useCallback((data: object) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'START_SESSION', data }));
      return true;
    }
    return false;
  }, []);

  const sendEndMainBebasViaWS = useCallback((data: object) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'END_MAIN_BEBAS_SESSION', data }));
      return true;
    }
    return false;
  }, []);

  const sendEndFixedViaWS = useCallback((data: object) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'END_FIXED_SESSION', data }));
      return true;
    }
    return false;
  }, []);

  const sendTogglePaymentViaWS = useCallback((transactionId: string) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'TOGGLE_PAYMENT_STATUS',
        data: { transactionId },
      }));
      return true;
    }
    return false;
  }, []);

  const sendDeleteTransactionsViaWS = useCallback((transactionIds: string[]) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'DELETE_TRANSACTIONS',
        data: { transactionIds },
      }));
      return true;
    }
    return false;
  }, []);

  const sendAddVipViaWS = useCallback((vip: object) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'ADD_VIP',
        data: { vip },
      }));
      return true;
    }
    return false;
  }, []);

  const sendDeleteStationViaWS = useCallback((stationId: string) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'DELETE_STATION',
        data: { stationId },
      }));
      return true;
    }
    return false;
  }, []);

  const sendAddStationViaWS = useCallback((station: object) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'ADD_STATION',
        data: { station },
      }));
      return true;
    }
    return false;
  }, []);

  const sendUpdateStationViaWS = useCallback((station: object) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'UPDATE_STATION',
        data: { station },
      }));
      return true;
    }
    return false;
  }, []);

  const requestSync = useCallback(() => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'REQUEST_SYNC' }));
    }
  }, []);

  // TV control: send power/volume commands to TV adapters via WebSocket
  const sendTvControl = useCallback((stationId: string, command: string) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'TV_CONTROL',
        data: { stationId, command },
      }));
      return true;
    }
    return false;
  }, []);

  // Branding overlay: send rental-name text/visibility to TV adapters
  const sendTvBranding = useCallback((
    stationId: string,
    payload: { action: 'show' | 'hide' | 'set'; text?: string; subtitle?: string; color?: string; bg?: string }
  ) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'TV_BRANDING',
        data: { stationId, payload },
      }));
      return true;
    }
    return false;
  }, []);

  // ===== Channel-based publish (Pusher/Ably/Socket.IO style) =====
  // Send a command to a named channel — server.ts routes to all subscribers.
  // Use this for TV control: channel "tv:PS5_01" receives { command: "power_on" }.
  const publishToChannel = useCallback((channel: string, data: object): boolean => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'PUBLISH',
        channel,
        data,
      }));
      return true;
    }
    // Fallback: use REST endpoint (in case WS is down)
    fetch('/api/channel/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel, data }),
    }).catch((e) => console.error('[ws] publishToChannel fallback failed:', e));
    return false;
  }, []);

  // Subscribe to channel(s) for receiving messages
  const subscribeToChannel = useCallback((channels: string | string[]): boolean => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'SUBSCRIBE',
        channels: Array.isArray(channels) ? channels : [channels],
      }));
      return true;
    }
    return false;
  }, []);

  const unsubscribeFromChannel = useCallback((channels: string | string[]): boolean => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'UNSUBSCRIBE',
        channels: Array.isArray(channels) ? channels : [channels],
      }));
      return true;
    }
    return false;
  }, []);

  // Listen for server-emitted TV_CONTROL_RESULT and surface via callback (optional)
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;
    // Reuse the existing onmessage handler by injecting a passthrough listener.
    // Since we can't add a second listener easily without refactor, callers
    // should subscribe via a wrapper. For now, this is a no-op (handled via the
    // raw socket below if needed).
  }, [isConnected]);

  return {
    isConnected,
    stations,
    transactions,
    lastTick,
    startSessionViaWS,
    endSessionViaWS,
    extendSessionViaWS,
    setStatusViaWS,
    sendMoveSessionViaWS,
    sendStartSessionViaWS,
    sendEndMainBebasViaWS,
    sendEndFixedViaWS,
    sendTogglePaymentViaWS,
    sendDeleteTransactionsViaWS,
    sendAddVipViaWS,
    sendDeleteStationViaWS,
    sendAddStationViaWS,
    sendUpdateStationViaWS,
    requestSync,
    sendTvControl,
    sendTvBranding,
    publishToChannel,
    subscribeToChannel,
    unsubscribeFromChannel,
  };
}
