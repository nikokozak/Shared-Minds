// Canvas Text Input – functional architecture
// Setup -> Input -> Middleware/Plugin -> Storage -> Render

import { prefs } from './prefs.js';

// --------------------------- Utilities ---------------------------

/**
 * Create a seeded pseudo-random generator using mulberry32.
 * @param {number} seed
 * @returns {() => number} function that returns [0,1)
 */
function createRng(seed) {
  let t = seed >>> 0;
  return function next() {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministically convert a string to a 32-bit int seed.
 */
function hashStringToSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Get a seed per entry based on prefs.
 */
function generateSeed() {
  if (typeof prefs.seedStrategy === 'number') return prefs.seedStrategy >>> 0;
  if (prefs.seedStrategy === 'time') return (Date.now() & 0xffffffff) >>> 0;
  if (typeof prefs.seedStrategy === 'string') return hashStringToSeed(prefs.seedStrategy);
  return (Math.random() * 0xffffffff) >>> 0;
}

/**
 * Return true if key looks like a printable character.
 */
function isPrintableKey(event) {
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  if (event.key.length === 1) {
    // Exclude space; we use it to finalize.
    return event.key !== ' ';
  }
  return false;
}

/**
 * Measure text width in device pixels given ctx and font string.
 */
function measureTextWidth(ctx, text, fontPx, fontFamily) {
  ctx.save();
  ctx.font = `${fontPx}px ${fontFamily}`;
  const width = ctx.measureText(text).width;
  ctx.restore();
  return width;
}

// --------------------------- Plugins ---------------------------

/**
 * Plugin: assign a random color to the entry's textColor.
 */
function pluginRandomColor(entry, env) {
  const rng = env.rng;
  const hue = Math.floor(rng() * 360);
  const sat = 60 + Math.floor(rng() * 30);
  const light = 40 + Math.floor(rng() * 40);
  return { ...entry, textColor: `hsl(${hue} ${sat}% ${light}%)` };
}

/**
 * Plugin: add a slight jitter animation by attaching a tick function.
 * The tick mutates a small per-entry offset, and render uses it.
 */
function pluginSlightJitter(entry, env) {
  const rng = env.rng;
  const basePhase = rng() * Math.PI * 2;
  const amplitude = 0.003; // in normalized units
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

const availablePlugins = {
  randomColor: pluginRandomColor,
  slightJitter: pluginSlightJitter
};

// --------------------------- Setup ---------------------------

function setupCanvas(canvas, prefs) {
  const ctx = canvas.getContext('2d');
  const state = { dpr: 1, widthCss: 0, heightCss: 0 };

  function resize() {
    const margin = prefs.marginPx;
    const cssWidth = window.innerWidth;
    const cssHeight = window.innerHeight;
    const dpr = prefs.hidpi ? window.devicePixelRatio || 1 : 1;

    canvas.style.width = cssWidth + 'px';
    canvas.style.height = cssHeight + 'px';
    canvas.width = Math.max(1, Math.floor(cssWidth * dpr));
    canvas.height = Math.max(1, Math.floor(cssHeight * dpr));

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    state.dpr = dpr;
    state.widthCss = cssWidth;
    state.heightCss = cssHeight;
  }

  resize();
  window.addEventListener('resize', () => {
    const beforeHadAnimation = hasAnimatedEntries();
    resize();
    draw();
    if (beforeHadAnimation) requestAnimationIfNeeded();
  });

  return { ctx, canvas, state };

  function hasAnimatedEntries() {
    return storage.some(e => typeof e.tick === 'function');
  }
}

// --------------------------- Storage ---------------------------

/**
 * The persistent store of finalized entries.
 * Each entry: { text, xN, yN, seed, fontSizePx, fontFamily, textColor, timestamp,
 *               tick?, positionOffset? }
 */
const storage = [];

// --------------------------- Input ---------------------------

function createInputController(env) {
  let buffer = '';
  let active = false;
  let seed = 0;
  let rng = () => Math.random();
  let position = { xN: 0.5, yN: 0.5 };

  function start() {
    active = true;
    buffer = '';
    seed = generateSeed();
    rng = createRng(seed);
    position = chooseRandomPosition(env, rng);
    draw();
  }

  function cancel() {
    if (!active) return;
    active = false;
    buffer = '';
    draw();
  }

  function finalize() {
    if (!active) return;
    if (!buffer) { cancel(); return; }
    const entry = createEntryFromBuffer(buffer, position, seed, env);
    const processed = runMiddleware(entry, env);
    storage.push(processed);
    active = false;
    buffer = '';
    draw();
    requestAnimationIfNeeded();
  }

  function onKeyDown(e) {
    if (e.key === ' '){
      e.preventDefault();
      if (!active) return; // space does not start input
      finalize();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
      return;
    }
    if (e.key === 'Backspace') {
      if (!active) return;
      e.preventDefault();
      buffer = buffer.slice(0, -1);
      draw();
      return;
    }
    if (isPrintableKey(e)) {
      if (!active) start();
      if (buffer.length >= prefs.maxLen) return; // enforce max length
      buffer += e.key;
      draw();
      return;
    }
  }

  function getPreview() {
    if (!active) return null;
    return { text: buffer, xN: position.xN, yN: position.yN, seed, fontSizePx: prefs.fontSizePx, fontFamily: prefs.fontFamily, textColor: prefs.textColor };
  }

  return { start, cancel, finalize, onKeyDown, getPreview };
}

/**
 * Compute a random normalized position that ensures a worst-case length fits inside margins.
 */
function chooseRandomPosition(env, rng) {
  const { ctx, state } = env;
  // Worst-case width: assume monospace and maxLen characters.
  const testString = 'M'.repeat(prefs.maxLen);
  const worstWidthPx = measureTextWidth(ctx, testString, prefs.fontSizePx, prefs.fontFamily);
  const marginPx = prefs.marginPx;

  const usableWidthPx = Math.max(0, state.widthCss - worstWidthPx - marginPx * 2);
  const usableHeightPx = Math.max(0, state.heightCss - prefs.fontSizePx - marginPx * 2);

  const xPx = marginPx + rng() * (usableWidthPx || 0);
  const yPx = marginPx + rng() * (usableHeightPx || 0) + prefs.fontSizePx; // baseline inside

  return { xN: xPx / state.widthCss, yN: yPx / state.heightCss };
}

/**
 * Create an entry object from current buffer.
 */
function createEntryFromBuffer(text, position, seed, env) {
  return {
    text,
    xN: position.xN,
    yN: position.yN,
    seed,
    fontSizePx: prefs.fontSizePx,
    fontFamily: prefs.fontFamily,
    textColor: prefs.textColor,
    timestamp: Date.now()
  };
}

// --------------------------- Middleware/Plugins ---------------------------

function runMiddleware(entry, env) {
  console.log('runMiddleware', entry, env);
  console.log('prefs.plugins', prefs.plugins);
  if (!prefs.plugins || !prefs.plugins.length) return entry;
  let result = entry;
  const rng = createRng(entry.seed);
  const pluginEnv = { ...env, rng };
  for (const name of prefs.plugins) {
    const pluginFn = availablePlugins[name];
    if (typeof pluginFn === 'function') {
      result = pluginFn(result, pluginEnv);
    }
  }
  return result;
}

// --------------------------- Render ---------------------------

let animationHandle = null;
let lastFrameMs = 0;

function requestAnimationIfNeeded() {
  const needsAnimation = storage.some(e => typeof e.tick === 'function');
  if (needsAnimation && animationHandle == null) {
    lastFrameMs = performance.now();
    animationHandle = requestAnimationFrame(step);
  }
  if (!needsAnimation && animationHandle != null) {
    cancelAnimationFrame(animationHandle);
    animationHandle = null;
  }
}

function step(nowMs) {
  const deltaSeconds = Math.max(0, (nowMs - lastFrameMs) / 1000);
  lastFrameMs = nowMs;
  for (const e of storage) {
    if (typeof e.tick === 'function') {
      e.tick(deltaSeconds);
    }
  }
  draw();
  animationHandle = requestAnimationFrame(step);
}

function clearCanvas(env) {
  const { ctx, state } = env;
  ctx.save();
  ctx.fillStyle = prefs.bgColor;
  ctx.fillRect(0, 0, state.widthCss, state.heightCss);
  ctx.restore();
}

function drawEntry(env, entry) {
  const { ctx, state } = env;
  const xBasePx = entry.xN * state.widthCss;
  const yBasePx = entry.yN * state.heightCss;
  let xPx = xBasePx;
  let yPx = yBasePx;

  if (typeof entry.positionOffset === 'function') {
    const off = entry.positionOffset();
    xPx += off.x * state.widthCss;
    yPx += off.y * state.heightCss;
  }

  ctx.save();
  ctx.font = `${entry.fontSizePx}px ${entry.fontFamily}`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = entry.textColor;
  ctx.fillText(entry.text, xPx, yPx);
  ctx.restore();
}

function drawPreview(env, preview) {
  if (!preview) return;
  const ghost = { ...preview, textColor: '#aaaaaa' };
  drawEntry(env, ghost);
}

function draw() {
  clearCanvas(env);
  for (const e of storage) drawEntry(env, e);
  drawPreview(env, input.getPreview());
}

// --------------------------- Bootstrap ---------------------------

const canvas = document.getElementById('c');
const env = setupCanvas(canvas, prefs);
const input = createInputController(env);

document.addEventListener('keydown', input.onKeyDown);
document.addEventListener('paste', (e) => e.preventDefault());

// Initial draw
draw();

// Expose available plugins in global for quick experimentation in console
window.canvasTextApp = { prefs, storage, availablePlugins };


