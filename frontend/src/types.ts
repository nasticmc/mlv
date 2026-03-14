export interface RadioConfig {
  public_key: string;
  name: string;
  lat: number;
  lon: number;
  tx_power: number;
  max_tx_power: number;
  path_hash_mode: number;
  path_hash_mode_supported: boolean;
}

export interface Contact {
  public_key: string;
  name: string | null;
  type: number;
  flags: number;
  last_path: string | null;
  last_path_len: number;
  last_advert: number | null;
  lat: number | null;
  lon: number | null;
  last_seen: number | null;
  on_radio: boolean;
}

export interface ContactAdvertPath {
  path: string;
  path_len: number;
  next_hop: string | null;
  first_seen: number;
  last_seen: number;
  heard_count: number;
}

export interface ContactAdvertPathSummary {
  public_key: string;
  paths: ContactAdvertPath[];
}

export interface MessagePath {
  path: string;
  received_at: number;
  path_len?: number | null;
}

export interface RawPacket {
  id: number;
  observation_id?: number;
  timestamp: number;
  data: string; // hex
  payload_type: string;
  snr: number | null;
  rssi: number | null;
  decrypted: boolean;
  decrypted_info: {
    channel_name: string | null;
    sender: string | null;
    channel_key: string | null;
    contact_key: string | null;
  } | null;
}

/** Contact type constants */
export const CONTACT_TYPE_REPEATER = 2;

// WebSocket message types from backend
export interface WsStateUpdate {
  type: 'state_update';
  config: RadioConfig | null;
  contacts: Contact[];
  advert_paths: ContactAdvertPathSummary[];
}

export interface WsPacket {
  type: 'packet';
  packet: RawPacket;
}

export interface WsHistory {
  type: 'history';
  /** Full packet history replay sent once on connect, oldest-first. */
  packets: RawPacket[];
}

export interface WsConnected {
  type: 'connected';
  message: string;
}

export interface WsError {
  type: 'error';
  message: string;
}

export type WsMessage = WsStateUpdate | WsPacket | WsHistory | WsConnected | WsError;
