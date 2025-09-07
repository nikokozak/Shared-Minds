// ============================== CANVAS TEXT INPUT ===========================
// Setup -> Input -> Middleware/Plugin -> Storage -> Render

import { prefs } from './prefs.js';
import { createRng, hashStringToSeed } from './rng.js';
import { pluginRegistry } from './plugins.js';



// ============================== UTILITY HELPERS =============================

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
    // Exclude space (finalizes) and digits (reserved for UI toggles)
    if (event.key === ' ') return false;
    if (event.key >= '0' && event.key <= '9') return false;
    return true;
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

function measureTextMetrics(ctx, text, fontPx, fontFamily) {
  ctx.save();
  ctx.font = `${fontPx}px ${fontFamily}`;
  const m = ctx.measureText(text);
  const ascent = (m.actualBoundingBoxAscent != null) ? m.actualBoundingBoxAscent : fontPx * 0.8;
  const descent = (m.actualBoundingBoxDescent != null) ? m.actualBoundingBoxDescent : fontPx * 0.2;
  const width = m.width;
  ctx.restore();
  return { width, ascent, descent };
}

function applyPluginDefaultsFromPrefs() {
  if (!Array.isArray(prefs.plugins)) return;
  const set = new Set(prefs.plugins);
  for (const p of pluginRegistry) p.active = set.has(p.name);
}

// ============================== SETUP =======================================

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



// ============================== STORAGE =====================================

/**
 * The persistent store of finalized entries.
 * { text, xN, yN, seed, fontSizePx, fontFamily, textColor, timestamp,
 *               tick?, positionOffset? }
 */
const storage = [];



// ============================== INPUT =======================================

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

  function isActive() { return active; }
  return { start, cancel, finalize, onKeyDown, getPreview, isActive };
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



// ============================== MIDDLEWARE / PLUGINS ========================

function runMiddleware(entry, env) {
  // Build active plugin chain using registry state
  const activePlugins = pluginRegistry.filter(p => p.active);
  if (!activePlugins.length) return entry;
  let result = entry;
  const rng = createRng(entry.seed);
  const pluginEnv = { ...env, rng };
  for (const p of activePlugins) {
    if (typeof p.fn === 'function') {
      result = p.fn(result, pluginEnv);
    }
  }
  return result;
}



// ============================== RENDER LOOP =================================

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

function drawPlaceholder(env) {
  if (storage.length > 0) return;
  const preview = input.getPreview();
  if (preview) return; // hide while typing
  const { ctx, state } = env;
  ctx.save();
  ctx.font = `${Math.max(14, prefs.fontSizePx)}px ${prefs.fontFamily}`;
  ctx.fillStyle = '#bbbbbb';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('provide me with a word', state.widthCss / 2, state.heightCss / 2);
  ctx.restore();
}

function drawFooterMenu(env) {
  const { ctx, state } = env;
  const items = pluginRegistry.map((p, i) => {
    const idx = i + 1;
    const status = p.active ? 'ON' : 'OFF';
    return `${idx} - ${p.label} (${status})`;
  }).join(' | ') + ' | Alt+Click delete';
  ctx.save();
  ctx.font = `${Math.max(10, Math.floor(prefs.fontSizePx * 0.6))}px ${prefs.fontFamily}`;
  ctx.fillStyle = '#888888';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  const margin = prefs.marginPx;
  ctx.fillText(items, margin, state.heightCss - margin);
  ctx.restore();
}

function draw() {
  clearCanvas(env);
  drawPlaceholder(env);
  for (const e of storage) drawEntry(env, e);
  drawPreview(env, input.getPreview());
  drawFooterMenu(env);
}

// ============================== INTERACTION / HIT-TEST ======================

function getEntryDrawPositionPx(env, entry) {
  const { state } = env;
  let xPx = entry.xN * state.widthCss;
  let yPx = entry.yN * state.heightCss;
  if (typeof entry.positionOffset === 'function') {
    const off = entry.positionOffset();
    xPx += off.x * state.widthCss;
    yPx += off.y * state.heightCss;
  }
  return { xPx, yPx };
}

function getEntryBoundingBoxPx(env, entry) {
  const { ctx } = env;
  const { xPx, yPx } = getEntryDrawPositionPx(env, entry);
  const { width, ascent, descent } = measureTextMetrics(ctx, entry.text, entry.fontSizePx, entry.fontFamily);
  return {
    left: xPx,
    top: yPx - ascent,
    right: xPx + width,
    bottom: yPx + descent
  };
}

function pointInRect(x, y, rect) {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function deleteEntryAtPoint(xCss, yCss) {
  for (let i = storage.length - 1; i >= 0; i--) {
    const entry = storage[i];
    const bbox = getEntryBoundingBoxPx(env, entry);
    if (pointInRect(xCss, yCss, bbox)) {
      storage.splice(i, 1);
      requestAnimationIfNeeded();
      draw();
      return true;
    }
  }
  return false;
}



// ============================== BOOTSTRAP ===================================

const canvas = document.getElementById('c');
const env = setupCanvas(canvas, prefs);
applyPluginDefaultsFromPrefs();
const input = createInputController(env);

document.addEventListener('keydown', input.onKeyDown);
document.addEventListener('paste', (e) => e.preventDefault());

document.addEventListener('keydown', (e) => {
  // Number key toggles for plugins only when not typing
  if (input.isActive()) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key;
  if (k >= '1' && k <= '9') {
    const idx = parseInt(k, 10) - 1;
    if (idx >= 0 && idx < pluginRegistry.length) {
      e.preventDefault();
      pluginRegistry[idx].active = !pluginRegistry[idx].active;
      draw();
    }
  }
});

canvas.addEventListener('click', (e) => {
  if (!e.altKey) return;
  const rect = canvas.getBoundingClientRect();
  const xCss = e.clientX - rect.left;
  const yCss = e.clientY - rect.top;
  deleteEntryAtPoint(xCss, yCss);
});

// Initial draw
draw();

// Expose available plugins in global for quick experimentation in console
window.canvasTextApp = { prefs, storage, pluginRegistry };


