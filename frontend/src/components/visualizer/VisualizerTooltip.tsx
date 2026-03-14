import type { PacketNetworkNode } from '../../networkGraph/packetNetworkGraph';
import { formatRelativeTime } from './shared';

interface VisualizerTooltipProps {
  activeNodeId: string | null;
  canonicalNodes: Map<string, PacketNetworkNode>;
  canonicalNeighborIds: Map<string, string[]>;
  renderedNodeIds: Set<string>;
}

export function VisualizerTooltip({
  activeNodeId,
  canonicalNodes,
  canonicalNeighborIds,
  renderedNodeIds,
}: VisualizerTooltipProps) {
  if (!activeNodeId) return null;

  const node = canonicalNodes.get(activeNodeId);
  if (!node) return null;

  const neighborIds = canonicalNeighborIds.get(activeNodeId) ?? [];

  const tooltipStyle: React.CSSProperties = {
    position: 'absolute',
    top: '1rem',
    right: '1rem',
    background: 'rgba(10,10,10,0.9)',
    backdropFilter: 'blur(4px)',
    borderRadius: '8px',
    padding: '12px',
    fontSize: '12px',
    border: '1px solid var(--border)',
    zIndex: 10,
    color: 'var(--foreground)',
    maxWidth: '260px',
    maxHeight: 'calc(100% - 2rem)',
    overflowY: 'auto',
  };

  const mutedStyle: React.CSSProperties = { color: 'var(--muted-foreground)' };
  const sectionStyle: React.CSSProperties = { marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border)' };

  const displayName = node.name || 'Unknown node';
  const typeLabel =
    node.type === 'self'
      ? 'Self'
      : node.type === 'repeater'
        ? 'Repeater'
        : 'Companion / Client';
  const typeColor =
    node.type === 'self'
      ? '#22c55e'
      : node.type === 'repeater'
        ? '#3b82f6'
        : '#ffffff';

  return (
    <div style={tooltipStyle}>
      <div style={{ fontWeight: 600, fontSize: '13px' }}>
        {node.isAmbiguous && <span style={{ ...mutedStyle, marginRight: '4px' }}>~</span>}
        {displayName}
      </div>
      {node.id !== 'self' && (
        <div style={{ ...mutedStyle, fontFamily: 'monospace', fontSize: '10px', marginTop: '2px' }}>
          {node.id.slice(0, 12)}
        </div>
      )}
      <div style={{ marginTop: '4px' }}>
        <span style={{ color: typeColor, fontWeight: 500 }}>{typeLabel}</span>
        {node.isAmbiguous && <span style={{ ...mutedStyle, marginLeft: '6px' }}>(ambiguous)</span>}
      </div>

      {node.probableIdentity && (
        <div style={{ marginTop: '4px' }}>
          <span style={mutedStyle}>Probably: </span>
          <span>{node.probableIdentity}</span>
        </div>
      )}

      {node.ambiguousNames && node.ambiguousNames.length > 0 && (
        <div style={{ marginTop: '4px' }}>
          <span style={mutedStyle}>Could be: </span>
          <span>{node.ambiguousNames.join(', ')}</span>
        </div>
      )}

      {node.id !== 'self' && (
        <div style={{ marginTop: '4px' }}>
          <span style={mutedStyle}>Last active: </span>
          <span>{formatRelativeTime(node.lastActivity)}</span>
        </div>
      )}

      {node.lastActivityReason && (
        <div style={{ ...mutedStyle, marginTop: '2px', fontSize: '11px' }}>
          {node.lastActivityReason}
        </div>
      )}

      {neighborIds.length > 0 && (
        <div style={sectionStyle}>
          <div style={{ ...mutedStyle, marginBottom: '4px', fontWeight: 500 }}>Neighbors</div>
          {neighborIds.map((neighborId) => {
            const neighbor = canonicalNodes.get(neighborId);
            const isHidden = !renderedNodeIds.has(neighborId);
            const neighborName = neighbor?.name || 'Unknown node';
            return (
              <div key={neighborId} style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '3px' }}>
                {isHidden && <span style={{ ...mutedStyle, fontSize: '10px' }}>[hidden]</span>}
                <span style={neighbor?.isAmbiguous ? { ...mutedStyle } : {}}>
                  {neighbor?.isAmbiguous ? `~${neighborName}` : neighborName}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
