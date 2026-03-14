import type { RawPacket } from '../types';

/**
 * Returns a stable key for deduplicating raw packet observations.
 * Uses observation_id when available (unique per RF arrival), otherwise falls back to id.
 */
export function getRawPacketObservationKey(packet: RawPacket): string {
  if (packet.observation_id !== undefined) {
    return `obs:${packet.observation_id}`;
  }
  return `id:${packet.id}`;
}
