// ============================== PLUGINS =====================================

// Each plugin has signature: (entry, env) -> entry

export function pluginRandomColor(entry, env) {
  const rng = env.rng;
  const hue = Math.floor(rng() * 360);
  const sat = 60 + Math.floor(rng() * 30);
  const light = 40 + Math.floor(rng() * 40);
  return { ...entry, textColor: `hsl(${hue} ${sat}% ${light}%)` };
}

export function pluginSlightJitter(entry, env) {
  const rng = env.rng;
  const basePhase = rng() * Math.PI * 2;
  const amplitude = 0.003; // normalized units
  const speed = 1 + rng() * 2; // radians per second

  const jitterState = { phase: basePhase };

  function tick(deltaSeconds) {
    jitterState.phase += speed * deltaSeconds;
  }

  function positionOffset() {
    const x = Math.cos(jitterState.phase) * amplitude;
    const y = Math.sin(jitterState.phase * 0.8) * amplitude;
    return { x, y };
  }

  return { ...entry, tick, positionOffset };
}

export const pluginRegistry = [
  { name: 'randomColor', label: 'Colors', fn: pluginRandomColor, active: false },
  { name: 'slightJitter', label: 'Jitter', fn: pluginSlightJitter, active: false }
];


