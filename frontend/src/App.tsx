import { useCallback, useEffect, useRef, useState } from 'react';
import { PacketVisualizer3D } from './components/PacketVisualizer3D';
import type {
  Contact,
  ContactAdvertPathSummary,
  RadioConfig,
  RawPacket,
  WsMessage,
} from './types';

const MAX_PACKETS = 500;
const WS_DEFAULT = 'ws://localhost:8765';
const WS_STORAGE_KEY = 'mlv-ws-url';

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

function getStoredWsUrl(): string {
  try {
    return localStorage.getItem(WS_STORAGE_KEY) || WS_DEFAULT;
  } catch {
    return WS_DEFAULT;
  }
}

function saveWsUrl(url: string) {
  try {
    localStorage.setItem(WS_STORAGE_KEY, url);
  } catch {
    // ignore
  }
}

export default function App() {
  const [wsUrl, setWsUrl] = useState(getStoredWsUrl);
  const [wsUrlInput, setWsUrlInput] = useState(getStoredWsUrl);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [packets, setPackets] = useState<RawPacket[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [config, setConfig] = useState<RadioConfig | null>(null);
  const [advertPaths, setAdvertPaths] = useState<ContactAdvertPathSummary[]>([]);
  const [showConfig, setShowConfig] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const connect = useCallback((url: string) => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    setConnectionState('connecting');
    setErrorMsg(null);

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
          } else if (msg.type === 'packet') {
            setPackets((prev) => {
              const next = [...prev, msg.packet];
              return next.length > MAX_PACKETS ? next.slice(-MAX_PACKETS) : next;
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
        if (connectionState !== 'disconnected') {
          setConnectionState('error');
          // Auto-reconnect after 5s
          reconnectTimerRef.current = setTimeout(() => {
            if (mountedRef.current) connect(url);
          }, 5000);
        }
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
    setWsUrl(url);
    connect(url);
    setShowConfig(false);
  };

  const handleDisconnect = () => {
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
          <div style={{ fontSize: '12px', color: '#9ca3af' }}>
            — {config.name}
          </div>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Status indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: statusColor, flexShrink: 0 }} />
            <span style={{ color: statusColor }}>{statusLabel}</span>
            {connectionState === 'error' && (
              <span style={{ color: '#ef4444', fontSize: '11px' }}>
                {' '}— retrying…
              </span>
            )}
          </div>

          {/* Config toggle */}
          <button
            onClick={() => setShowConfig((s) => !s)}
            style={{
              padding: '4px 10px', fontSize: '12px', background: 'rgba(55,65,81,0.5)',
              color: '#e5e7eb', border: '1px solid #374151', borderRadius: '4px', cursor: 'pointer',
            }}
          >
            ⚙ Config
          </button>

          {connectionState === 'connected' || connectionState === 'connecting' ? (
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
              onClick={() => connect(wsUrl)}
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
          display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0,
        }}>
          <label style={{ fontSize: '13px', color: '#9ca3af', whiteSpace: 'nowrap' }}>
            Backend WebSocket URL:
          </label>
          <input
            type="text"
            value={wsUrlInput}
            onChange={(e) => setWsUrlInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
            placeholder={WS_DEFAULT}
            style={{
              flex: 1, maxWidth: '360px', padding: '4px 8px', fontSize: '13px',
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
          {errorMsg && (
            <span style={{ fontSize: '12px', color: '#ef4444' }}>{errorMsg}</span>
          )}
        </div>
      )}

      {/* Main visualizer */}
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        {connectionState === 'disconnected' ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            height: '100%', gap: '16px', color: '#9ca3af',
          }}>
            <div style={{ fontSize: '48px' }}>📡</div>
            <div style={{ fontSize: '18px', fontWeight: 500, color: '#e5e7eb' }}>
              MeshCore Mesh Visualizer
            </div>
            <div style={{ fontSize: '14px', textAlign: 'center', maxWidth: '400px', lineHeight: 1.6 }}>
              Connect to a backend server to visualize your mesh network in real-time 3D.
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
              <input
                type="text"
                value={wsUrlInput}
                onChange={(e) => setWsUrlInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
                placeholder={WS_DEFAULT}
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
              Start the backend with: <code style={{ background: '#1f2937', padding: '2px 6px', borderRadius: '4px' }}>python backend/server.py</code>
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
