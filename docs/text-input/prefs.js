// Preferences for canvas text input sketch.
// Tweak these values and reload to change behavior.

export const prefs = {
  fontFamily: 'monospace',
  fontSizePx: 20,
  textColor: '#222222',
  bgColor: '#ffffff',
  marginPx: 16,
  maxLen: 20,
  hidpi: true,

  // Names of plugins to apply to finalized entries, in order.
  // Examples available: 'randomColor', 'slightJitter'
  plugins: ['randomColor', 'slightJitter'],

  // Seed generation for per-entry RNG.
  // 'time' uses current time; or provide a fixed integer seed for repeatability.
  seedStrategy: 'time'
};


