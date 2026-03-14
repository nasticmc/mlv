import { useCallback, useEffect, useRef, useState } from 'react';
import { PacketVisualizer3D } from './components/PacketVisualizer3D';
import type {
  Contact,
  ContactAdvertPathSummary,
  RadioConfig,
  RawPacket,
  WsMessage,
} from './types';

/** Largest live ring-buffer kept in memory (on top of whatever history loaded). */
const MAX_LIVE_PACKETS = 500;
const DEFAULT_WS_PORT = 8765;
const WS_STORAGE_KEY = 'mlv-ws-url';

/** Derive a sensible default backend WS URL from the current page location. */
function defaultWsUrl(): string {
  const host = window.location.hostname || 'localhost';
  return `ws://${host}:${DEFAULT_WS_PORT}`;
}

function getStoredWsUrl(): string {
  try {
    return localStorage.getItem(WS_STORAGE_KEY) || defaultWsUrl();
  } catch {
    return defaultWsUrl();
  }
}

function saveWsUrl(url: string) {
  try {
    localStorage.setItem(WS_STORAGE_KEY, url);
  } catch {
    // ignore
  }
}

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export default function App() {
  const [wsUrlInput, setWsUrlInput] = useState(getStoredWsUrl);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [packets, setPackets] = useState<RawPacket[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [config, setConfig] = useState<RadioConfig | null>(null);
  const [advertPaths, setAdvertPaths] = useState<ContactAdvertPathSummary[]>([]);
  const [showConfig, setShowConfig] = useState(false);
  const [historyCount, setHistoryCount] = useState<number | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  // Track whether we intentionally disconnected (no auto-reconnect in that case)
  const intentionalDisconnectRef = useRef(false);
  // Keep the active URL in a ref for the auto-reconnect closure
  const activeUrlRef = useRef(getStoredWsUrl());

  const connect = useCallback((url: string) => {
    intentionalDisconnectRef.current = false;
    activeUrlRef.current = url;

    if (wsRef.current) {
      wsRef.current.onclose = null; // suppress reconnect from the old socket
      wsRef.current.close();
      wsRef.current = null;
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    setConnectionState('connecting');
    setErrorMsg(null);
    setHistoryCount(null);

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) return;
        setConnectionState('connected');
        setErrorMsg(null);
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;
        try {
          const msg: WsMessage = JSON.parse(event.data as string);

          if (msg.type === 'state_update') {
            if (msg.config) setConfig(msg.config);
            if (msg.contacts) setContacts(msg.contacts);
            if (msg.advert_paths) setAdvertPaths(msg.advert_paths);

          } else if (msg.type === 'history') {
            // Replace current packet buffer with the full history replay
            setPackets(msg.packets);
            setHistoryCount(msg.packets.length);
            // Clear the indicator after a few seconds
            setTimeout(() => setHistoryCount(null), 4000);

          } else if (msg.type === 'packet') {
            setPackets((prev) => {
              // Append live packet; trim only the live tail beyond MAX_LIVE_PACKETS
              // (history packets stay in the buffer — they have lower IDs)
              const next = [...prev, msg.packet];
              return next.length > MAX_LIVE_PACKETS + 2000
                ? next.slice(-MAX_LIVE_PACKETS - 2000)
                : next;
            });

          } else if (msg.type === 'error') {
            setErrorMsg(msg.message);
          }
        } catch {
          // ignore parse errors
        }
      };

      ws.onerror = () => {
        if (!mountedRef.current) return;
        setConnectionState('error');
        setErrorMsg('WebSocket connection failed');
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        wsRef.current = null;
        if (intentionalDisconnectRef.current) return;
        setConnectionState('error');
        reconnectTimerRef.current = setTimeout(() => {
          if (mountedRef.current && !intentionalDisconnectRef.current) {
            connect(activeUrlRef.current);
          }
        }, 5000);
      };
    } catch (e) {
      setConnectionState('error');
      setErrorMsg(String(e));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      wsRef.current?.close();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, []);

  const handleConnect = () => {
    const url = wsUrlInput.trim();
    saveWsUrl(url);
    connect(url);
    setShowConfig(false);
  };

  const handleDisconnect = () => {
    intentionalDisconnectRef.current = true;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    wsRef.current?.close();
    wsRef.current = null;
    setConnectionState('disconnected');
    setErrorMsg(null);
  };

  const statusColor =
    connectionState === 'connected' ? '#22c55e' :
    connectionState === 'connecting' ? '#f59e0b' :
    connectionState === 'error' ? '#ef4444' : '#6b7280';

  const statusLabel =
    connectionState === 'connected' ? 'Connected' :
    connectionState === 'connecting' ? 'Connecting…' :
    connectionState === 'error' ? 'Error' : 'Disconnected';

  const isLive = connectionState === 'connected' || connectionState === 'connecting';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0a0a0a', color: '#e5e7eb' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 16px',
        borderBottom: '1px solid #374151', background: '#111827', flexShrink: 0,
        height: '48px',
      }}>
        <div style={{ fontWeight: 600, fontSize: '15px', color: '#e5e7eb' }}>
          MeshCore Visualizer
        </div>
        {config?.name && (
          <div style={{ fontSize: '12px', color: '#9ca3af' }}>— {config.name}</div>
        )}

        {/* History loaded indicator */}
        {historyCount !== null && (
          <div style={{
            fontSize: '11px', color: '#22c55e', background: 'rgba(34,197,94,0.1)',
            border: '1px solid rgba(34,197,94,0.3)', borderRadius: '4px',
            padding: '2px 8px',
          }}>
            ↩ Loaded {historyCount} stored packet{historyCount !== 1 ? 's' : ''}
          </div>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: statusColor, flexShrink: 0 }} />
            <span style={{ color: statusColor }}>{statusLabel}</span>
            {connectionState === 'error' && (
              <span style={{ color: '#ef4444', fontSize: '11px' }}> — retrying…</span>
            )}
          </div>

          <button
            onClick={() => setShowConfig((s) => !s)}
            style={{
              padding: '4px 10px', fontSize: '12px', background: 'rgba(55,65,81,0.5)',
              color: '#e5e7eb', border: '1px solid #374151', borderRadius: '4px', cursor: 'pointer',
            }}
          >
            ⚙ Config
          </button>

          {isLive ? (
            <button
              onClick={handleDisconnect}
              style={{
                padding: '4px 10px', fontSize: '12px', background: 'rgba(239,68,68,0.15)',
                color: '#ef4444', border: '1px solid rgba(239,68,68,0.4)', borderRadius: '4px', cursor: 'pointer',
              }}
            >
              Disconnect
            </button>
          ) : (
            <button
              onClick={handleConnect}
              style={{
                padding: '4px 10px', fontSize: '12px', background: 'rgba(34,197,94,0.15)',
                color: '#22c55e', border: '1px solid rgba(34,197,94,0.4)', borderRadius: '4px', cursor: 'pointer',
              }}
            >
              Connect
            </button>
          )}
        </div>
      </div>

      {/* Config panel */}
      {showConfig && (
        <div style={{
          padding: '12px 16px', borderBottom: '1px solid #374151', background: '#1f2937',
          display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0, flexWrap: 'wrap',
        }}>
          <label style={{ fontSize: '13px', color: '#9ca3af', whiteSpace: 'nowrap' }}>
            Backend WebSocket URL:
          </label>
          <input
            type="text"
            value={wsUrlInput}
            onChange={(e) => setWsUrlInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
            placeholder={defaultWsUrl()}
            style={{
              flex: 1, minWidth: '220px', maxWidth: '360px', padding: '4px 8px', fontSize: '13px',
              background: '#111827', border: '1px solid #374151', borderRadius: '4px',
              color: '#e5e7eb', fontFamily: 'monospace',
            }}
          />
          <button
            onClick={handleConnect}
            style={{
              padding: '4px 14px', fontSize: '13px', background: 'rgba(59,130,246,0.2)',
              color: '#3b82f6', border: '1px solid rgba(59,130,246,0.4)', borderRadius: '4px', cursor: 'pointer',
            }}
          >
            Connect
          </button>
          {errorMsg && <span style={{ fontSize: '12px', color: '#ef4444' }}>{errorMsg}</span>}
        </div>
      )}

      {/* Main area */}
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        {connectionState === 'disconnected' && packets.length === 0 ? (
          /* Landing screen — shown only when truly empty */
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            height: '100%', gap: '16px', color: '#9ca3af',
          }}>
            <div style={{ fontSize: '48px' }}>📡</div>
            <div style={{ fontSize: '18px', fontWeight: 500, color: '#e5e7eb' }}>
              MeshCore Mesh Visualizer
            </div>
            <div style={{ fontSize: '14px', textAlign: 'center', maxWidth: '440px', lineHeight: 1.6 }}>
              Connect to a backend server to visualize your mesh network in real-time 3D.
              Packet history is persisted — any device on your network sees the same graph.
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
              <input
                type="text"
                value={wsUrlInput}
                onChange={(e) => setWsUrlInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
                placeholder={defaultWsUrl()}
                style={{
                  width: '280px', padding: '8px 12px', fontSize: '14px',
                  background: '#1f2937', border: '1px solid #374151', borderRadius: '6px',
                  color: '#e5e7eb', fontFamily: 'monospace',
                }}
              />
              <button
                onClick={handleConnect}
                style={{
                  padding: '8px 20px', fontSize: '14px', background: 'rgba(59,130,246,0.2)',
                  color: '#3b82f6', border: '1px solid rgba(59,130,246,0.4)',
                  borderRadius: '6px', cursor: 'pointer', fontWeight: 500,
                }}
              >
                Connect
              </button>
            </div>
            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
              Start the backend with:{' '}
              <code style={{ background: '#1f2937', padding: '2px 6px', borderRadius: '4px' }}>
                python backend/server.py --serial /dev/ttyUSB0
              </code>
            </div>
          </div>
        ) : (
          <PacketVisualizer3D
            packets={packets}
            contacts={contacts}
            config={config}
            repeaterAdvertPaths={advertPaths}
          />
        )}
      </div>
    </div>
  );
}
