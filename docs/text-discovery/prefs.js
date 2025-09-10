// ============================== PREFERENCES ================================
// Central config for the text-discovery sketch. Tweak and reload.

export const prefs = {
  // Canvas + layout
  hidpi: true,
  bgColor: '#ffffff',
  letterColor: '#111111',
  highlightColor: 'hsl(0 85% 45%)',
  outsideColor: '#000000',
  spotlightRadiusPx: 140, // radius of the circular window in CSS pixels
  spotlightFeatherPx: 40, // blur/feather width of the window edge

  // Grid
  gridCols: 24, // logical columns (auto computes rows by aspect)
  fontFamily: 'monospace',
  fontSizePx: 20,
  cellPaddingPx: 8, // extra spacing inside each cell when drawing

  // Letter behavior
  jitterAmplitudePx: 2.5,
  jitterSpeedMin: 0.6,
  jitterSpeedMax: 1.8,
  fadeDurationRangeSec: [3, 7], // how long before a cell fades out/in to change letter
  changeProbabilityPerCycle: 0.5, // chance that a cell changes letter at the end of a cycle

  // Words / capturing
  holdToCaptureSeconds: 1.2,
  minWordLength: 3,
  maxWordLength: 8,
  seedWordsPerMinute: 120, // much higher seeding rate

  // Maintain density
  minActiveWords: 20,
  maxActiveWords: 40,

  // Detection visibility threshold (ignore near-invisible letters)
  detectionAlphaThreshold: 0.25,

  // Debug overlay (toggle at runtime with the 'h' key)
  debug: false,

  // Sentence UI
  maxSentenceWords: 50
};


