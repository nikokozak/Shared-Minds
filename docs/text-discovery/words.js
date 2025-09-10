// ============================== WORDS ======================================
// A tiny built-in dictionary for seeding. You can replace with a larger list.

export const DICTIONARY = [
  'mind','share','thought','word','soup','circle','red','light','blur','find',
  'idea','dream','story','letter','phase','float','jitter','shift','fade','hold',
  'time','space','sense','look','seek','play','game','craft','build','change'
];

/**
 * Choose a random word with a length in [minLen, maxLen]. Fallback to any.
 */
export function chooseWord(rng, minLen, maxLen) {
  const filtered = DICTIONARY.filter(w => w.length >= minLen && w.length <= maxLen);
  const source = filtered.length ? filtered : DICTIONARY;
  const idx = Math.floor(rng() * source.length);
  return source[idx];
}

// ============================== TRIE ========================================
// Lightweight trie for efficient substring scanning and prefix checking.

export function buildTrie(words) {
  const root = { t: false, c: Object.create(null) };
  for (const w of words) {
    let node = root;
    for (let i = 0; i < w.length; i++) {
      const ch = w[i];
      if (!node.c[ch]) node.c[ch] = { t: false, c: Object.create(null) };
      node = node.c[ch];
    }
    node.t = true;
  }
  return root;
}



