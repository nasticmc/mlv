import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { PacketNetworkNode } from '../../networkGraph/packetNetworkGraph';

export interface GraphNode extends PacketNetworkNode {
  x?: number;
  y?: number;
  z?: number;
  fx?: number | null;
  fy?: number | null;
  fz?: number | null;
  vx?: number;
  vy?: number;
  vz?: number;
}

export interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  lastActivity: number;
  hasDirectObservation: boolean;
  hasHiddenIntermediate: boolean;
  hiddenHopLabels: string[];
}

export interface NodeMeshData {
  mesh: THREE.Mesh;
  label: CSS2DObject;
  labelDiv: HTMLDivElement;
}

export const NODE_COLORS = {
  self: 0x22c55e,
  repeater: 0x3b82f6,
  companion: 0xa855f7,
  client: 0xffffff,
  ambiguous: 0x9ca3af,
} as const;

export const NODE_LEGEND_ITEMS = [
  { label: 'Self (you)', color: '#22c55e', size: 16 },
  { label: 'Repeater', color: '#3b82f6', size: 10 },
  { label: 'Companion', color: '#a855f7', size: 10 },
  { label: 'Client', color: '#ffffff', size: 10 },
  { label: 'Ambiguous', color: '#9ca3af', size: 10 },
] as const;

export function getBaseNodeColor(node: PacketNetworkNode): number {
  if (node.id === 'self') return NODE_COLORS.self;
  if (node.isAmbiguous) return NODE_COLORS.ambiguous;
  if (node.type === 'repeater') return NODE_COLORS.repeater;
  if (node.type === 'companion') return NODE_COLORS.companion;
  return NODE_COLORS.client;
}

export function growFloat32Buffer(buf: Float32Array, minLength: number): Float32Array {
  let newLength = Math.max(12, buf.length);
  while (newLength < minLength) newLength *= 2;
  const next = new Float32Array(newLength);
  next.set(buf);
  return next;
}

export function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function formatRelativeTime(timestamp: number): string {
  const diff = Math.floor((Date.now() - timestamp) / 1000);
  if (diff < 5) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function getSceneNodeLabel(node: PacketNetworkNode): string {
  const name = node.name || node.id.slice(0, 8);
  if (node.isAmbiguous && node.probableIdentity) {
    return `~${node.probableIdentity}`;
  }
  return name;
}

export function normalizePacketTimestampMs(timestamp: number): number {
  if (!timestamp) return Date.now();
  // If timestamp looks like seconds (< year 3000 in ms), convert to ms
  if (timestamp < 9999999999) return timestamp * 1000;
  return timestamp;
}
