// ============================== TEXT DISCOVERY ==============================
// A word-finding canvas game with a circular, feathered spotlight.
// Architecture: Setup -> World Model -> Systems (letters, spotlight, capture)
// -> Render loop. Functional style with simple immutable updates where practical.

import { prefs } from './prefs.js';
import { DICTIONARY, chooseWord, buildTrie } from './words.js';



// ============================== UTILITIES ==================================

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function lerp(a, b, t) { return a + (b - a) * t; }

function randBetween(rng, a, b) { return a + (b - a) * rng(); }

function createMulberry32(seed) {
  let t = seed >>> 0;
  return function next() {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStringToSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}



// ============================== CANVAS SETUP ================================

function setupCanvas(canvas) {
  const ctx = canvas.getContext('2d');
  const state = { dpr: 1, widthCss: 0, heightCss: 0 };

  function resize() {
    const cssWidth = window.innerWidth;
    const cssHeight = window.innerHeight;
    const dpr = prefs.hidpi ? (window.devicePixelRatio || 1) : 1;
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
  window.addEventListener('resize', () => { resize(); draw(); });
  return { ctx, state };
}



// ============================== WORLD MODEL =================================

// Letter cell structure:
// { x, y, char, phase, speed, jitterSeed, fadeT, fadeDir, nextAt }
// - fadeT in [0,1], fadeDir: +1 (fading in), -1 (fading out), 0 (steady)
// - nextAt: time when to toggle fade cycle/change char

function createWorld(env) {
  const rng = createMulberry32(hashStringToSeed('text-discovery')); // stable seed per load
  const cols = prefs.gridCols;
  const cellW = Math.max(8, prefs.fontSizePx + prefs.cellPaddingPx);
  const cellH = Math.max(8, Math.floor(prefs.fontSizePx * 1.6));
  const rows = Math.max(4, Math.floor(env.state.heightCss / cellH));
  const gridW = cols * cellW;
  const gridH = rows * cellH;
  const originX = Math.floor((env.state.widthCss - gridW) / 2);
  const originY = Math.floor((env.state.heightCss - gridH) / 2);

  const letters = 'abcdefghijklmnopqrstuvwxyz';

  function randomChar() { return letters[Math.floor(rng() * letters.length)]; }

  function randomCycleSeconds() {
    const [a, b] = prefs.fadeDurationRangeSec;
    return randBetween(rng, a, b);
  }

  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const phase = rng() * Math.PI * 2;
      const speed = lerp(prefs.jitterSpeedMin, prefs.jitterSpeedMax, rng());
      const jitterSeed = rng() * 1000;
      const fadeT = 1; // start visible
      const fadeDir = 0;
      const nextAt = performance.now() + randomCycleSeconds() * 1000;
      cells.push({
        x: originX + c * cellW + Math.floor(cellW * 0.5),
        y: originY + r * cellH + Math.floor(cellH * 0.7), // baseline-ish
        char: randomChar(),
        phase, speed, jitterSeed,
        fadeT, fadeDir, nextAt,
        locked: false
      });
    }
  }

  const words = []; // active seeded words mapped to grid positions
  const sentence = []; // collected words

  return {
    rng,
    grid: { rows, cols, cellW, cellH, originX, originY },
    cells,
    words,
    sentence,
    capture: {
      active: false,
      startMs: 0,
      wordUnderSpot: null,
      progress01: 0
    },
    mouse: { x: env.state.widthCss / 2, y: env.state.heightCss / 2, down: false },
    trie: buildTrie(DICTIONARY),
    debug: { numCandidates: 0, numFiltered: 0, includeCount: 0, lastCandidate: null }
  };
}



// ============================== SYSTEMS =====================================

function updateLetters(world, dt) {
  const now = performance.now();
  for (const cell of world.cells) {
    // Always advance active fades so camouflage transitions complete
    if (cell.fadeDir !== 0) {
      const dir = cell.fadeDir;
      const rate = 1 / randBetween(world.rng, ...prefs.fadeDurationRangeSec);
      cell.fadeT = clamp(cell.fadeT + dir * rate * dt, 0, 1);
      if (cell.fadeT === 0 && dir < 0) {
        // At black: commit staged char (if any), then fade in
        cell.char = (cell._nextChar != null) ? cell._nextChar : randomGridChar(world);
        cell._nextChar = undefined;
        cell.fadeDir = +1;
      } else if (cell.fadeT === 1 && dir > 0) {
        cell.fadeDir = 0;
        cell.nextAt = now + randBetween(world.rng, ...prefs.fadeDurationRangeSec) * 1000;
      }
    } else if (!cell.locked && now >= cell.nextAt) {
      // Random mutation only for unlocked cells
      if (world.rng() < prefs.changeProbabilityPerCycle) {
        cell.fadeDir = -1;
      } else {
        cell.nextAt = now + randBetween(world.rng, ...prefs.fadeDurationRangeSec) * 1000;
      }
    }

    // Jitter phase advance
    cell.phase += cell.speed * dt;
  }
}

function randomGridChar(world) {
  return 'abcdefghijklmnopqrstuvwxyz'[Math.floor(world.rng() * 26)];
}

function getCellIndex(world, r, c) { return r * world.grid.cols + c; }

function ensureWordSeeding(world, dt) {
  // Maintain density bounds first
  while (world.words.length > (prefs.maxActiveWords || Infinity)) {
    dropOldestWord(world);
  }
  // Ensure minimum active words by attempting seeds
  let guard = 0;
  while (world.words.length < (prefs.minActiveWords || 0) && guard++ < 20) {
    if (!seedOneWord(world)) break;
  }
  // Then probabilistic extra seeding if under max
  const targetPerSec = prefs.seedWordsPerMinute / 60;
  const p = clamp(targetPerSec * dt, 0, 0.75);
  if (world.words.length < (prefs.maxActiveWords || Infinity) && world.rng() < p) {
    seedOneWord(world);
  }
}

function seedOneWord(world) {
  const word = chooseWord(world.rng, prefs.minWordLength, prefs.maxWordLength);
  const attempts = 40;
  for (let a = 0; a < attempts; a++) {
    const vertical = world.rng() < 0.5; // H or V
    if (!vertical) {
      // horizontal
      const r = Math.floor(world.rng() * world.grid.rows);
      const maxCStart = world.grid.cols - word.length;
      if (maxCStart < 0) return false; // grid too small
      const c = Math.floor(world.rng() * (maxCStart + 1));
      if (!placementFree(world, r, c, word.length, 'H')) continue;
      const cells = [];
      for (let i = 0; i < word.length; i++) {
        const idx = getCellIndex(world, r, c + i);
        const cell = world.cells[idx];
        // Soft camouflage: schedule change at next fade cycle rather than popping
        if (!cell.locked) {
          cell.fadeDir = -1; // fade out
          cell._nextChar = word[i]; // stage next char; applied at fadeT==0
        } else {
          cell.char = word[i];
          cell.fadeDir = 0;
          cell.fadeT = 1;
        }
        cell.locked = true;
        cells.push({ r, c: c + i, idx });
      }
      world.words.push({ word, r, c, dir: 'H', cells });
      return true;
    } else {
      // vertical
      const c = Math.floor(world.rng() * world.grid.cols);
      const maxRStart = world.grid.rows - word.length;
      if (maxRStart < 0) return false;
      const r = Math.floor(world.rng() * (maxRStart + 1));
      if (!placementFree(world, r, c, word.length, 'V')) continue;
      const cells = [];
      for (let i = 0; i < word.length; i++) {
        const idx = getCellIndex(world, r + i, c);
        const cell = world.cells[idx];
        if (!cell.locked) {
          cell.fadeDir = -1;
          cell._nextChar = word[i];
        } else {
          cell.char = word[i];
          cell.fadeDir = 0;
          cell.fadeT = 1;
        }
        cell.locked = true;
        cells.push({ r: r + i, c, idx });
      }
      world.words.push({ word, r, c, dir: 'V', cells });
      return true;
    }
  }
  return false;
}

function placementFree(world, r, c, len, dir) {
  if (dir === 'H') {
    for (let i = 0; i < len; i++) {
      const idx = getCellIndex(world, r, c + i);
      const cell = world.cells[idx];
      if (!cell || cell.locked) return false;
    }
    return true;
  } else {
    for (let i = 0; i < len; i++) {
      const idx = getCellIndex(world, r + i, c);
      const cell = world.cells[idx];
      if (!cell || cell.locked) return false;
    }
    return true;
  }
}

function dropOldestWord(world) {
  const w = world.words.shift();
  if (!w) return;
  for (const part of w.cells) {
    const cell = world.cells[part.idx];
    if (!cell) continue;
    cell.locked = false;
  }
}

// (kept for future styles if needed)
function computeSpotlightMask(ctx, mouse) {
  const r = prefs.spotlightRadiusPx;
  const f = prefs.spotlightFeatherPx;
  const g = ctx.createRadialGradient(mouse.x, mouse.y, Math.max(1, r - f), mouse.x, mouse.y, r);
  g.addColorStop(0, 'rgba(0,0,0,1)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  return g;
}

function wordUnderSpotlight(world) {
  // Scan in-circle sequences horizontally and vertically using a trie.
  const r = prefs.spotlightRadiusPx;
  const r2 = r * r;
  // Use stable cell centers (no jitter) for containment to avoid flicker while holding
  function inside(x, y) { const dx = x - world.mouse.x; const dy = y - world.mouse.y; return (dx*dx + dy*dy) <= r2; }

  const include = new Array(world.cells.length);
  let includeCount = 0;
  for (let ri = 0; ri < world.grid.rows; ri++) {
    for (let ci = 0; ci < world.grid.cols; ci++) {
      const idx = getCellIndex(world, ri, ci);
      const cell = world.cells[idx];
      const alpha = clamp(cell.fadeT, 0, 1);
      const inCircle = inside(cell.x, cell.y) && alpha >= (prefs.detectionAlphaThreshold || 0);
      include[idx] = inCircle;
      if (inCircle) includeCount++;
    }
  }

  const candidates = [];
  // Horizontal only (simplified for stability)
  for (let rI = 0; rI < world.grid.rows; rI++) {
    scanLine(world, include, rI, 0, 0, 1, candidates);
  }

  // Filter by prefs lengths
  const filtered = candidates.filter(c => c.word.length >= prefs.minWordLength && c.word.length <= prefs.maxWordLength);
  world.debug.numCandidates = candidates.length;
  world.debug.numFiltered = filtered.length;
  world.debug.includeCount = includeCount;
  if (!filtered.length) return null;
  filtered.sort((a, b) => b.word.length - a.word.length);
  const longestLen = filtered[0].word.length;
  const longest = filtered.filter(c => c.word.length === longestLen);
  const chosen = longest[Math.floor(world.rng() * longest.length)];
  world.debug.lastCandidate = chosen;
  return chosen;
}

function scanLine(world, include, rStart, cStart, dr, dc, out) {
  const { rows, cols } = world.grid;
  const inBounds = (r, c) => r >= 0 && r < rows && c >= 0 && c < cols;
  let r = rStart, c = cStart;
  // Normalize to line start (topmost/leftmost) to avoid missing early segments
  while ((dr !== 0 || dc !== 0) && inBounds(r - dr, c - dc)) { r -= dr; c -= dc; }
  while (inBounds(r, c)) {
    // Build a contiguous included segment
    const seg = [];
    while (inBounds(r, c) && include[getCellIndex(world, r, c)]) {
      const idx = getCellIndex(world, r, c);
      seg.push({ r, c, idx, ch: world.cells[idx].char });
      r += dr; c += dc;
    }
    if (seg.length) scanSegmentWithTrie(seg, world.trie, out);
    r += dr; c += dc;
  }
}

function scanSegmentWithTrie(seg, trie, out) {
  for (let i = 0; i < seg.length; i++) {
    let node = trie; let word = '';
    for (let j = i; j < seg.length; j++) {
      const ch = seg[j].ch;
      node = node.c[ch];
      if (!node) break;
      word += ch;
      if (node.t) {
        const dir = seg[i].r === seg[j].r ? 'H' : 'V';
        const cells = seg.slice(i, j + 1);
        out.push({ word, r: seg[i].r, c: seg[i].c, dir, cells });
      }
    }
  }
}

function candidateKey(c) {
  if (!c) return '';
  const idxs = c.cells.map(p => p.idx).join('-');
  return `${c.word}:${idxs}`;
}

function updateCapture(world, dt) {
  // During active capture, freeze the candidate so timer can't reset due to tiny changes
  const detected = wordUnderSpotlight(world);
  const current = (world.capture.active && world.capture.wordUnderSpot) ? world.capture.wordUnderSpot : detected;
  const currentKey = candidateKey(current);
  if (world.mouse.down && current) {
    // Start or continue capture on structurally same candidate
    if (!world.capture.active || world.capture.key !== currentKey) {
      world.capture.active = true;
      world.capture.wordUnderSpot = current;
      world.capture.key = currentKey;
      world.capture.startMs = performance.now();
      world.capture.progress01 = 0;
    } else {
      world.capture.progress01 = clamp((performance.now() - world.capture.startMs) / (prefs.holdToCaptureSeconds * 1000), 0, 1);
      if (world.capture.progress01 >= 1) {
        finalizeCapture(world, world.capture.wordUnderSpot);
        world.capture.active = false;
        world.capture.wordUnderSpot = null;
        world.capture.key = '';
        world.capture.progress01 = 0;
      }
    }
  } else {
    world.capture.active = false;
    world.capture.wordUnderSpot = null;
    world.capture.key = '';
    world.capture.progress01 = 0;
  }
}

function finalizeCapture(world, wordObj) {
  // Remove characters by fading them out and swapping to random
  for (const part of wordObj.cells) {
    const cell = world.cells[part.idx];
    cell.locked = false;
    cell.fadeDir = -1;
    cell._nextChar = undefined; // reset staged
  }
  world.sentence.push(wordObj.word);
  if (world.sentence.length > prefs.maxSentenceWords) world.sentence.shift();
  // Remove word from active list so it can be re-seeded later
  const idx = world.words.indexOf(wordObj);
  if (idx >= 0) world.words.splice(idx, 1);
}



// ============================== RENDERING ===================================

function clear(ctx, state) {
  ctx.save();
  ctx.fillStyle = prefs.bgColor;
  ctx.fillRect(0, 0, state.widthCss, state.heightCss);
  ctx.restore();
}

function drawLetters(env, world) {
  const { ctx } = env;
  ctx.save();
  ctx.font = `${prefs.fontSizePx}px ${prefs.fontFamily}`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = prefs.letterColor;
  for (const cell of world.cells) {
    const jitterX = Math.cos(cell.phase + cell.jitterSeed) * prefs.jitterAmplitudePx;
    const jitterY = Math.sin(cell.phase * 0.8 + cell.jitterSeed) * prefs.jitterAmplitudePx;
    const x = cell.x + jitterX;
    const y = cell.y + jitterY;
    const alpha = clamp(cell.fadeT, 0, 1);
    ctx.globalAlpha = alpha;
    ctx.fillText(cell.char, x, y);
  }
  ctx.restore();
}

function applySpotlightMask(env, world) {
  const { ctx, state } = env;
  ctx.save();
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = computeSpotlightMask(ctx, world.mouse);
  ctx.fillRect(0, 0, state.widthCss, state.heightCss);
  ctx.restore();
}

function drawCaptureHighlight(env, world) {
  if (!world.capture.active || !world.capture.wordUnderSpot) {
    // Draw preview outline for current candidate for debugging
    if (prefs.debug && world.debug.lastCandidate) {
      const { ctx } = env;
      ctx.save();
      ctx.font = `${prefs.fontSizePx}px ${prefs.fontFamily}`;
      ctx.textBaseline = 'alphabetic';
      ctx.strokeStyle = 'hsl(200 90% 50%)';
      ctx.globalAlpha = 0.7;
      const previewCells = (world.capture.active && world.capture.wordUnderSpot) ? world.capture.wordUnderSpot.cells : world.debug.lastCandidate.cells;
      for (const part of previewCells) {
        const cell = world.cells[part.idx];
        const x = cell.x;
        const y = cell.y;
        // Mark baseline point
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
    return;
  }
  const { ctx } = env;
  const t = world.capture.progress01;
  ctx.save();
  ctx.font = `${prefs.fontSizePx}px ${prefs.fontFamily}`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = prefs.highlightColor;
  ctx.globalAlpha = lerp(0.1, 1, t);
  for (const part of world.capture.wordUnderSpot.cells) {
    const cell = world.cells[part.idx];
    const jitterX = Math.cos(cell.phase + cell.jitterSeed) * prefs.jitterAmplitudePx;
    const jitterY = Math.sin(cell.phase * 0.8 + cell.jitterSeed) * prefs.jitterAmplitudePx;
    ctx.fillText(cell.char, cell.x + jitterX, cell.y + jitterY);
  }
  ctx.restore();
}

function drawSentence(world) {
  const el = document.getElementById('sentence');
  const base = world.sentence.join(' ');
  el.textContent = base;
  // Update debug panel separately to avoid cluttering sentence
  const dp = document.getElementById('debugPanel');
  if (prefs.debug && dp) {
    dp.style.display = 'block';
    const d = world.debug;
    const current = d.lastCandidate ? ` word:[${d.lastCandidate.word}]` : '';
    const cap = ` cap:${world.capture.active ? 'ON' : 'off'} p:${world.capture.progress01.toFixed(2)}`;
    dp.textContent = `inside:${d.includeCount} candidates:${d.numCandidates} filtered:${d.numFiltered}${current}${cap}`;
  }
}

function draw() {
  clear(env.ctx, env.state);
  // Clip drawing to the circular window to fully hide outside
  env.ctx.save();
  env.ctx.beginPath();
  env.ctx.arc(world.mouse.x, world.mouse.y, prefs.spotlightRadiusPx, 0, Math.PI * 2);
  env.ctx.clip();
  drawLetters(env, world);
  drawCaptureHighlight(env, world);
  env.ctx.restore();
  // Paint the outside area to ensure nothing bleeds through visually
  env.ctx.save();
  env.ctx.fillStyle = prefs.outsideColor;
  env.ctx.globalCompositeOperation = 'destination-over';
  env.ctx.fillRect(0, 0, env.state.widthCss, env.state.heightCss);
  env.ctx.restore();
  drawSentence(world);
}



// ============================== MAIN LOOP ===================================

let lastMs = performance.now();
function step(now) {
  const dt = Math.min(0.05, Math.max(0, (now - lastMs) / 1000));
  lastMs = now;
  updateLetters(world, dt);
  ensureWordSeeding(world, dt);
  updateCapture(world, dt);
  draw();
  requestAnimationFrame(step);
}



// ============================== BOOTSTRAP ===================================

const canvas = document.getElementById('c');
const env = setupCanvas(canvas);
const world = createWorld(env);

canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  world.mouse.x = e.clientX - rect.left;
  world.mouse.y = e.clientY - rect.top;
});
canvas.addEventListener('mousedown', () => { world.mouse.down = true; });
canvas.addEventListener('mouseup', () => { world.mouse.down = false; });
canvas.addEventListener('mouseleave', () => { world.mouse.down = false; });

// Initial frame
draw();
requestAnimationFrame(step);

// Minimal dev exposure
window.textDiscovery = { prefs, DICTIONARY };

// Toggle debug overlays with 'h'
document.addEventListener('keydown', (e) => {
  if (e.key === 'h' || e.key === 'H') {
    prefs.debug = !prefs.debug;
    const dp = document.getElementById('debugPanel');
    if (dp) dp.style.display = prefs.debug ? 'block' : 'none';
    draw();
  }
});


