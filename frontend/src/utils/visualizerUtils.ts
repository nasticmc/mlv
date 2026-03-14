import { MeshCoreDecoder, PayloadType } from '@michaelhart/meshcore-decoder';
import {
  CONTACT_TYPE_COMPANION,
  CONTACT_TYPE_REPEATER,
  type Contact,
  type RawPacket,
} from '../types';

// =============================================================================
// TYPES
// =============================================================================

export type NodeType = 'self' | 'repeater' | 'companion' | 'client';
type PacketLabel = 'AD' | 'GT' | 'DM' | 'ACK' | 'TR' | 'RQ' | 'RS' | '?';

export interface Particle {
  linkKey: string;
  progress: number;
  speed: number;
  color: string;
  label: PacketLabel;
  fromNodeId: string;
  toNodeId: string;
}

interface ObservedPath {
  nodes: string[];
  snr: number | null;
  timestamp: number;
}

export interface PendingPacket {
  key: string;
  label: PacketLabel;
  paths: ObservedPath[];
  firstSeen: number;
  expiresAt: number;
}

export interface ParsedPacket {
  payloadType: number;
  messageHash: string | null;
  pathBytes: string[];
  srcHash: string | null;
  dstHash: string | null;
  advertPubkey: string | null;
  advertName: string | null;
  groupTextSender: string | null;
  anonRequestPubkey: string | null;
}

interface TrafficObservation {
  source: string;
  nextHop: string | null;
  timestamp: number;
}

export interface RepeaterTrafficData {
  hopKey: string;
  observations: TrafficObservation[];
}

interface RepeaterSplitAnalysis {
  shouldSplit: boolean;
  disjointGroups: Map<string, Set<string>> | null;
}

// =============================================================================
// CONSTANTS
// =============================================================================

export const COLORS = {
  background: '#0a0a0a',
  link: '#4b5563',
  ambiguous: '#9ca3af',
  particleAD: '#f59e0b',
  particleGT: '#06b6d4',
  particleDM: '#8b5cf6',
  particleACK: '#22c55e',
  particleTR: '#f97316',
  particleRQ: '#ec4899',
  particleRS: '#14b8a6',
  particleUnknown: '#6b7280',
} as const;

export const PARTICLE_COLOR_MAP: Record<PacketLabel, string> = {
  AD: COLORS.particleAD,
  GT: COLORS.particleGT,
  DM: COLORS.particleDM,
  ACK: COLORS.particleACK,
  TR: COLORS.particleTR,
  RQ: COLORS.particleRQ,
  RS: COLORS.particleRS,
  '?': COLORS.particleUnknown,
};

export const PARTICLE_SPEED = 0.008;

const MIN_OBSERVATIONS_TO_SPLIT = 20;
const MAX_TRAFFIC_OBSERVATIONS = 200;
const TRAFFIC_OBSERVATION_MAX_AGE_MS = 30 * 60 * 1000;

export const PACKET_LEGEND_ITEMS = [
  { label: 'AD', color: COLORS.particleAD, description: 'Advertisement' },
  { label: 'GT', color: COLORS.particleGT, description: 'Group Text' },
  { label: 'DM', color: COLORS.particleDM, description: 'Direct Message' },
  { label: 'ACK', color: COLORS.particleACK, description: 'Acknowledgment' },
  { label: 'TR', color: COLORS.particleTR, description: 'Trace' },
  { label: 'RQ', color: COLORS.particleRQ, description: 'Request' },
  { label: 'RS', color: COLORS.particleRS, description: 'Response' },
  { label: '?', color: COLORS.particleUnknown, description: 'Other' },
] as const;

export interface PathStep {
  nodeId: string | null;
  markHiddenLinkWhenOmitted?: boolean;
  hiddenLabel?: string | null;
}

export function normalizeHopToken(hop: string | null | undefined): string | null {
  const normalized = hop?.trim().toLowerCase() ?? '';
  return normalized.length > 0 ? normalized : null;
}

export function buildAmbiguousRepeaterNodeId(hop: string, nextHop?: string | null): string {
  const hopKey = normalizeHopToken(hop);
  if (!hopKey) return '?';
  const nextHopKey = normalizeHopToken(nextHop);
  return nextHopKey ? `?${hopKey}:>${nextHopKey}` : `?${hopKey}`;
}

export function buildAmbiguousRepeaterLabel(hop: string, nextHop?: string | null): string {
  const hopKey = normalizeHopToken(hop)?.toUpperCase();
  if (!hopKey) return '?';
  const nextHopKey = normalizeHopToken(nextHop)?.toUpperCase();
  return nextHopKey ? `${hopKey}:>${nextHopKey}` : hopKey;
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

export function parsePacket(hexData: string): ParsedPacket | null {
  try {
    const decoded = MeshCoreDecoder.decode(hexData);
    if (!decoded.isValid) return null;
    const tracePayload =
      decoded.payloadType === PayloadType.Trace && decoded.payload.decoded
        ? (decoded.payload.decoded as { pathHashes?: string[] })
        : null;

    const result: ParsedPacket = {
      payloadType: decoded.payloadType,
      messageHash: decoded.messageHash || null,
      pathBytes: tracePayload?.pathHashes || decoded.path || [],
      srcHash: null,
      dstHash: null,
      advertPubkey: null,
      advertName: null,
      groupTextSender: null,
      anonRequestPubkey: null,
    };

    if (decoded.payloadType === PayloadType.TextMessage && decoded.payload.decoded) {
      const payload = decoded.payload.decoded as { sourceHash?: string; destinationHash?: string };
      result.srcHash = payload.sourceHash || null;
      result.dstHash = payload.destinationHash || null;
    } else if (decoded.payloadType === PayloadType.Advert && decoded.payload.decoded) {
      const payload = decoded.payload.decoded as { publicKey?: string; appData?: { name?: string } };
      result.advertPubkey = payload.publicKey || null;
      result.advertName = payload.appData?.name?.trim() || null;
    } else if (decoded.payloadType === PayloadType.GroupText && decoded.payload.decoded) {
      const payload = decoded.payload.decoded as { decrypted?: { sender?: string } };
      result.groupTextSender = payload.decrypted?.sender || null;
    } else if (decoded.payloadType === PayloadType.AnonRequest && decoded.payload.decoded) {
      const payload = decoded.payload.decoded as { senderPublicKey?: string };
      result.anonRequestPubkey = payload.senderPublicKey || null;
    }

    return result;
  } catch {
    return null;
  }
}

export function getPacketLabel(payloadType: number): PacketLabel {
  switch (payloadType) {
    case PayloadType.Advert: return 'AD';
    case PayloadType.GroupText: return 'GT';
    case PayloadType.TextMessage: return 'DM';
    case PayloadType.Ack: return 'ACK';
    case PayloadType.Trace: return 'TR';
    case PayloadType.Request:
    case PayloadType.AnonRequest: return 'RQ';
    case PayloadType.Response: return 'RS';
    default: return '?';
  }
}

function hashStringSimple(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
}

export function generatePacketKey(parsed: ParsedPacket, rawPacket: RawPacket): string {
  const contentHash = (
    parsed.messageHash || hashStringSimple(rawPacket.data).toString(16).padStart(8, '0')
  ).slice(0, 8);

  if (parsed.payloadType === PayloadType.Advert && parsed.advertPubkey) {
    return `ad:${parsed.advertPubkey.slice(0, 12)}`;
  }
  if (parsed.payloadType === PayloadType.GroupText) {
    const sender = parsed.groupTextSender || rawPacket.decrypted_info?.sender || '?';
    const channel = rawPacket.decrypted_info?.channel_name || '?';
    return `gt:${channel}:${sender}:${contentHash}`;
  }
  if (parsed.payloadType === PayloadType.TextMessage) {
    return `dm:${parsed.srcHash || '?'}:${parsed.dstHash || '?'}:${contentHash}`;
  }
  if (parsed.payloadType === PayloadType.AnonRequest && parsed.anonRequestPubkey) {
    return `rq:${parsed.anonRequestPubkey.slice(0, 12)}:${contentHash}`;
  }
  return `other:${contentHash}`;
}

export function getLinkId<
  T extends { source: string | { id: string }; target: string | { id: string } },
>(link: T): { sourceId: string; targetId: string } {
  return {
    sourceId: typeof link.source === 'string' ? link.source : link.source.id,
    targetId: typeof link.target === 'string' ? link.target : link.target.id,
  };
}

export function buildLinkKey(sourceId: string, targetId: string): string {
  return [sourceId, targetId].sort().join('->');
}

export function getNodeType(contact: Contact | null | undefined): NodeType {
  if (contact?.type === CONTACT_TYPE_REPEATER) return 'repeater';
  if (contact?.type === CONTACT_TYPE_COMPANION) return 'companion';
  return 'client';
}

export function dedupeConsecutive<T>(arr: T[]): T[] {
  return arr.filter((item, i) => i === 0 || item !== arr[i - 1]);
}

export function compactPathSteps(steps: PathStep[]): {
  nodes: string[];
  dashedLinkDetails: Map<string, string[]>;
} {
  const nodes: string[] = [];
  const dashedLinkDetails = new Map<string, string[]>();
  let pendingHiddenLink = false;
  let pendingHiddenLabels: string[] = [];

  for (const step of steps) {
    if (step.nodeId) {
      const previousNodeId = nodes.length > 0 ? nodes[nodes.length - 1] : null;
      if (previousNodeId && pendingHiddenLink && previousNodeId !== step.nodeId) {
        const key = buildLinkKey(previousNodeId, step.nodeId);
        const existing = dashedLinkDetails.get(key) ?? [];
        for (const label of pendingHiddenLabels) {
          if (!existing.includes(label)) existing.push(label);
        }
        dashedLinkDetails.set(key, existing);
      }
      if (previousNodeId !== step.nodeId) nodes.push(step.nodeId);
      pendingHiddenLink = false;
      pendingHiddenLabels = [];
      continue;
    }

    if (step.markHiddenLinkWhenOmitted && nodes.length > 0) {
      pendingHiddenLink = true;
      if (step.hiddenLabel && !pendingHiddenLabels.includes(step.hiddenLabel)) {
        pendingHiddenLabels.push(step.hiddenLabel);
      }
    }
  }

  return { nodes, dashedLinkDetails };
}

export function analyzeRepeaterTraffic(data: RepeaterTrafficData): RepeaterSplitAnalysis {
  const now = Date.now();
  const recentObservations = data.observations.filter(
    (obs) => now - obs.timestamp < TRAFFIC_OBSERVATION_MAX_AGE_MS
  );

  const byNextHop = new Map<string, Set<string>>();
  for (const obs of recentObservations) {
    const hopKey = obs.nextHop ?? 'self';
    if (!byNextHop.has(hopKey)) byNextHop.set(hopKey, new Set());
    byNextHop.get(hopKey)!.add(obs.source);
  }

  if (byNextHop.size <= 1) return { shouldSplit: false, disjointGroups: null };

  const allSources = new Map<string, string[]>();
  for (const [nextHop, sources] of byNextHop) {
    for (const source of sources) {
      if (!allSources.has(source)) allSources.set(source, []);
      allSources.get(source)!.push(nextHop);
    }
  }

  for (const [, nextHops] of allSources) {
    if (nextHops.length > 1) return { shouldSplit: false, disjointGroups: null };
  }

  for (const [, sources] of byNextHop) {
    if (sources.size < MIN_OBSERVATIONS_TO_SPLIT) return { shouldSplit: false, disjointGroups: null };
  }

  return { shouldSplit: true, disjointGroups: byNextHop };
}

export function recordTrafficObservation(
  trafficData: Map<string, RepeaterTrafficData>,
  hopKey: string,
  source: string,
  nextHop: string | null
): void {
  const normalizedHopKey = normalizeHopToken(hopKey);
  if (!normalizedHopKey) return;

  const normalizedNextHop = normalizeHopToken(nextHop);
  const now = Date.now();

  if (!trafficData.has(normalizedHopKey)) {
    trafficData.set(normalizedHopKey, { hopKey: normalizedHopKey, observations: [] });
  }

  const data = trafficData.get(normalizedHopKey)!;
  data.observations.push({ source, nextHop: normalizedNextHop, timestamp: now });

  data.observations = data.observations.filter(
    (obs) => now - obs.timestamp < TRAFFIC_OBSERVATION_MAX_AGE_MS
  );

  if (data.observations.length > MAX_TRAFFIC_OBSERVATIONS) {
    data.observations = data.observations.slice(-MAX_TRAFFIC_OBSERVATIONS);
  }
}
