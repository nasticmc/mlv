import { PACKET_LEGEND_ITEMS } from '../../utils/visualizerUtils';
import { NODE_LEGEND_ITEMS } from './shared';

interface VisualizerControlsProps {
  showControls: boolean;
  setShowControls: (value: boolean) => void;
  showAmbiguousPaths: boolean;
  setShowAmbiguousPaths: (value: boolean) => void;
  showAmbiguousNodes: boolean;
  setShowAmbiguousNodes: (value: boolean) => void;
  useAdvertPathHints: boolean;
  setUseAdvertPathHints: (value: boolean) => void;
  collapseLikelyKnownSiblingRepeaters: boolean;
  setCollapseLikelyKnownSiblingRepeaters: (value: boolean) => void;
  splitAmbiguousByTraffic: boolean;
  setSplitAmbiguousByTraffic: (value: boolean) => void;
  observationWindowSec: number;
  setObservationWindowSec: (value: number) => void;
  pruneStaleNodes: boolean;
  setPruneStaleNodes: (value: boolean) => void;
  pruneStaleMinutes: number;
  setPruneStaleMinutes: (value: number) => void;
  letEmDrift: boolean;
  setLetEmDrift: (value: boolean) => void;
  autoOrbit: boolean;
  setAutoOrbit: (value: boolean) => void;
  chargeStrength: number;
  setChargeStrength: (value: number) => void;
  particleSpeedMultiplier: number;
  setParticleSpeedMultiplier: (value: number) => void;
  nodeCount: number;
  linkCount: number;
  onExpandContract: () => void;
  onClearAndReset: () => void;
}

const checkboxStyle = {
  width: '14px',
  height: '14px',
  cursor: 'pointer',
  accentColor: 'var(--primary)',
  flexShrink: 0,
};

export function VisualizerControls({
  showControls,
  setShowControls,
  showAmbiguousPaths,
  setShowAmbiguousPaths,
  showAmbiguousNodes,
  setShowAmbiguousNodes,
  useAdvertPathHints,
  setUseAdvertPathHints,
  collapseLikelyKnownSiblingRepeaters,
  setCollapseLikelyKnownSiblingRepeaters,
  splitAmbiguousByTraffic,
  setSplitAmbiguousByTraffic,
  observationWindowSec,
  setObservationWindowSec,
  pruneStaleNodes,
  setPruneStaleNodes,
  pruneStaleMinutes,
  setPruneStaleMinutes,
  letEmDrift,
  setLetEmDrift,
  autoOrbit,
  setAutoOrbit,
  chargeStrength,
  setChargeStrength,
  particleSpeedMultiplier,
  setParticleSpeedMultiplier,
  nodeCount,
  linkCount,
  onExpandContract,
  onClearAndReset,
}: VisualizerControlsProps) {
  const panelStyle: React.CSSProperties = {
    position: 'absolute',
    top: '1rem',
    left: '1rem',
    background: 'rgba(10,10,10,0.85)',
    backdropFilter: 'blur(4px)',
    borderRadius: '8px',
    padding: '12px',
    fontSize: '12px',
    border: '1px solid var(--border)',
    zIndex: 10,
    color: 'var(--foreground)',
    opacity: showControls ? 1 : 0.4,
    transition: 'opacity 0.2s',
  };

  const legendStyle: React.CSSProperties = {
    position: 'absolute',
    bottom: '1rem',
    left: '1rem',
    background: 'rgba(10,10,10,0.85)',
    backdropFilter: 'blur(4px)',
    borderRadius: '8px',
    padding: '12px',
    fontSize: '12px',
    border: '1px solid var(--border)',
    zIndex: 10,
    color: 'var(--foreground)',
  };

  const labelStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer',
  };

  const mutedStyle: React.CSSProperties = { color: 'var(--muted-foreground)' };

  return (
    <>
      {showControls && (
        <div style={legendStyle}>
          <div style={{ display: 'flex', gap: '24px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ ...mutedStyle, fontWeight: 500, marginBottom: '2px' }}>Packets</div>
              {PACKET_LEGEND_ITEMS.map((item) => (
                <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '8px', fontWeight: 'bold', color: 'white',
                    backgroundColor: item.color, flexShrink: 0,
                  }}>
                    {item.label}
                  </div>
                  <span>{item.description}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ ...mutedStyle, fontWeight: 500, marginBottom: '2px' }}>Nodes</div>
              {NODE_LEGEND_ITEMS.map((item) => (
                <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{
                    width: item.size, height: item.size, borderRadius: '50%',
                    backgroundColor: item.color, flexShrink: 0,
                  }} />
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div
        style={panelStyle}
        onMouseEnter={(e) => { if (!showControls) (e.currentTarget as HTMLDivElement).style.opacity = '1'; }}
        onMouseLeave={(e) => { if (!showControls) (e.currentTarget as HTMLDivElement).style.opacity = '0.4'; }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={labelStyle}>
            <input type="checkbox" style={checkboxStyle} checked={showControls} onChange={(e) => setShowControls(e.target.checked)} />
            <span title="Toggle legends and controls visibility">Show controls</span>
          </label>

          {showControls && (
            <>
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '8px', marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={labelStyle}>
                  <input type="checkbox" style={checkboxStyle} checked={showAmbiguousPaths} onChange={(e) => setShowAmbiguousPaths(e.target.checked)} />
                  <span title="Show placeholder nodes for repeaters when prefix matches multiple contacts">Show ambiguous repeaters</span>
                </label>
                <label style={labelStyle}>
                  <input type="checkbox" style={checkboxStyle} checked={showAmbiguousNodes} onChange={(e) => setShowAmbiguousNodes(e.target.checked)} />
                  <span title="Show placeholder nodes for senders/recipients when only a prefix is known">Show ambiguous sender/recipient</span>
                </label>

                <details style={{ borderRadius: '4px', border: '1px solid rgba(55,65,81,0.6)', padding: '4px 8px' }}>
                  <summary style={{ cursor: 'pointer', userSelect: 'none', color: 'var(--muted-foreground)' }}>
                    Advanced
                  </summary>
                  <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ ...labelStyle, opacity: showAmbiguousPaths ? 1 : 0.5 }}>
                      <input type="checkbox" style={checkboxStyle} checked={useAdvertPathHints} onChange={(e) => setUseAdvertPathHints(e.target.checked)} disabled={!showAmbiguousPaths} />
                      <span>Use repeater advert-path identity hints</span>
                    </label>
                    <label style={{ ...labelStyle, opacity: showAmbiguousPaths && useAdvertPathHints ? 1 : 0.5 }}>
                      <input type="checkbox" style={checkboxStyle} checked={collapseLikelyKnownSiblingRepeaters} onChange={(e) => setCollapseLikelyKnownSiblingRepeaters(e.target.checked)} disabled={!showAmbiguousPaths || !useAdvertPathHints} />
                      <span>Collapse likely sibling repeaters</span>
                    </label>
                    <label style={{ ...labelStyle, opacity: showAmbiguousPaths ? 1 : 0.5 }}>
                      <input type="checkbox" style={checkboxStyle} checked={splitAmbiguousByTraffic} onChange={(e) => setSplitAmbiguousByTraffic(e.target.checked)} disabled={!showAmbiguousPaths} />
                      <span>Heuristically group repeaters by traffic pattern</span>
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={mutedStyle}>Ack/echo listen window:</span>
                      <input
                        type="number" min="1" max="60" value={observationWindowSec}
                        onChange={(e) => setObservationWindowSec(Math.max(1, Math.min(60, parseInt(e.target.value, 10) || 1)))}
                        style={{ width: '48px', padding: '2px 4px', background: 'var(--background)', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '12px', textAlign: 'center', color: 'var(--foreground)' }}
                      />
                      <span style={mutedStyle}>sec</span>
                    </div>
                  </div>
                </details>

                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '8px', marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={labelStyle}>
                    <input type="checkbox" style={checkboxStyle} checked={pruneStaleNodes} onChange={(e) => setPruneStaleNodes(e.target.checked)} />
                    <span title="Remove nodes with no recent traffic">Only show recently active nodes</span>
                  </label>
                  {pruneStaleNodes && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: '22px' }}>
                      <span style={mutedStyle}>Window:</span>
                      <input
                        type="number" min={1} max={60} value={pruneStaleMinutes}
                        onChange={(e) => { const v = parseInt(e.target.value, 10); if (!isNaN(v) && v >= 1 && v <= 60) setPruneStaleMinutes(v); }}
                        style={{ width: '52px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--background)', padding: '2px 4px', fontSize: '12px', color: 'var(--foreground)' }}
                      />
                      <span style={mutedStyle}>min</span>
                    </div>
                  )}
                  <label style={labelStyle}>
                    <input type="checkbox" style={checkboxStyle} checked={letEmDrift} onChange={(e) => setLetEmDrift(e.target.checked)} />
                    <span title="Continuously reorganize graph layout">Let 'em drift</span>
                  </label>
                  <label style={labelStyle}>
                    <input type="checkbox" style={checkboxStyle} checked={autoOrbit} onChange={(e) => setAutoOrbit(e.target.checked)} />
                    <span title="Automatically orbit the camera">Orbit the mesh</span>
                  </label>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                    <span style={mutedStyle}>Repulsion: {Math.abs(chargeStrength)}</span>
                    <input
                      type="range" min="50" max="2500" value={Math.abs(chargeStrength)}
                      onChange={(e) => setChargeStrength(-parseInt(e.target.value, 10))}
                      style={{ width: '100%', accentColor: 'var(--primary)' }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                    <span style={mutedStyle}>Packet speed: {particleSpeedMultiplier}x</span>
                    <input
                      type="range" min="1" max="5" step="0.5" value={particleSpeedMultiplier}
                      onChange={(e) => setParticleSpeedMultiplier(parseFloat(e.target.value))}
                      style={{ width: '100%', accentColor: 'var(--primary)' }}
                    />
                  </div>
                </div>

                <button
                  onClick={onExpandContract}
                  style={{ marginTop: '4px', padding: '6px 12px', background: 'rgba(59,130,246,0.2)', color: 'var(--primary)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: '4px', fontSize: '12px', cursor: 'pointer' }}
                  title="Expand nodes apart then contract back"
                >
                  Oooh Big Stretch!
                </button>
                <button
                  onClick={onClearAndReset}
                  style={{ padding: '6px 12px', background: 'rgba(245,158,11,0.1)', color: 'var(--warning)', border: '1px solid rgba(245,158,11,0.4)', borderRadius: '4px', fontSize: '12px', cursor: 'pointer' }}
                  title="Clear all nodes and links from the visualization"
                >
                  Clear &amp; Reset
                </button>
              </div>

              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '8px', marginTop: '4px' }}>
                <div>Nodes: {nodeCount}</div>
                <div>Links: {linkCount}</div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
