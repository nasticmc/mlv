const STORAGE_KEY = 'mlv-visualizer-settings';

export interface VisualizerSettings {
  showAmbiguousPaths: boolean;
  showAmbiguousNodes: boolean;
  useAdvertPathHints: boolean;
  collapseLikelyKnownSiblingRepeaters: boolean;
  splitAmbiguousByTraffic: boolean;
  chargeStrength: number;
  observationWindowSec: number;
  letEmDrift: boolean;
  particleSpeedMultiplier: number;
  showControls: boolean;
  autoOrbit: boolean;
  pruneStaleNodes: boolean;
  pruneStaleMinutes: number;
}

const DEFAULTS: VisualizerSettings = {
  showAmbiguousPaths: true,
  showAmbiguousNodes: false,
  useAdvertPathHints: true,
  collapseLikelyKnownSiblingRepeaters: true,
  splitAmbiguousByTraffic: false,
  chargeStrength: -200,
  observationWindowSec: 5,
  letEmDrift: false,
  particleSpeedMultiplier: 1,
  showControls: true,
  autoOrbit: false,
  pruneStaleNodes: false,
  pruneStaleMinutes: 10,
};

export function getVisualizerSettings(): VisualizerSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULTS, ...JSON.parse(stored) };
    }
  } catch {
    // ignore
  }
  return { ...DEFAULTS };
}

export function saveVisualizerSettings(settings: VisualizerSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}
