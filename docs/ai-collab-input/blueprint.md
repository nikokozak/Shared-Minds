I'm developing a small interactive web-sketch, illustrating how interaction with an LLM can be a generative endeavor. 

## Technical

- Vanilla JS, HTML
- Single index.html file
- One or more JS files, but must all be std imports, no build system

## LLM API

- We are using a school-provided Proxy to communicate with Replicate, which hosts the LLM we will decide to use (open to suggestions).
- Instructions for using this proxy can be found in the `Proxy for Replicate` file in this same folder.

## Concept / UI

- We are aiming for a very minimal but pleasant UI (somewhat like OmWriter).
- The concept is as follows:

The screen is split. We write in the left half of the screen. The LLM writes on the right side of the screen. As we write, the LLM begins to write as well, writing content that is as dissimilar to ours in position as possible (i.e. dogs are good | dogs are bad). We try to keep the proportions and semantic connection somewhat intact, so it is "evident" that the rewritten content is sourced from ours.

In "phone" mode, instead of split left/right, we split up/down, and after every paragraph we create a new "section", so that the screen looks like:

----------
My content
__________
AI content
----------
My new content
----------
New AI content
----------
and so on...


## Decisions and Spec v1

- We will detect a new paragraph on ENTER (single newline). Double newline is optional and not required.
- No responsive/phone-specific layout is required for this sketch; we will stick to a simple split view on desktop.
- We will trigger AI responses on: end of sentence, every 5 words, or after 5 seconds of inactivity.
- We will send full context with every request (so the AI can rewrite/adjust consistently each time). No streaming.
- Model: `meta/meta-llama-3-70b-instruct` via Replicate, accessed through the school proxy.
- Safety filtering: none for this sketch.
- No persistence/exports/analytics.
- UI includes an initial hint that disappears on typing and a loading indicator while waiting for AI.
- Include a “Divergence Dial” (0–100) controlling how oppositional the counterpoint is.

### Interaction Triggers

- Paragraph detection: on single ENTER. We maintain one AI paragraph per user paragraph.
- Send criteria (evaluate on keyup):
  - End-of-sentence: detect terminal punctuation `[.!?]` followed by space or newline.
  - Word-count tick: every 5 new words in the current paragraph.
  - Idle: 5 seconds with no input.
- On any trigger, send the entire accumulated user text.

### Divergence Dial (0–100)

- 0–20: mild counterpoint, soft caveats.
- 21–60: clear opposing stance with retained topic anchors.
- 61–100: strong opposition; push on assumptions and amplify counter-claims.
- Mapping to generation:
  - Temperature: `0.2 + 0.6 * (dial / 100)` → `[0.2..0.8]`
  - Instruction strength (in prompt): select a template variant by bucket above.

### Prompt Template (no streaming)

- We instruct the AI to flip stance/valence while preserving topical anchors and not exceeding the user’s sentence count.

System prompt:

"""
You are a counterpoint writer.
Write a response that takes the OPPOSITE stance to the user's text while:
- Preserving the main topics and references so the connection is evident
- Matching paragraph count and NOT exceeding the number of sentences per paragraph
- Staying within ±20% length of the user's paragraph(s)
- Avoiding direct antonym swaps; argue from different premises and values
Tone: clear, concise, neutral unless instructed otherwise.
"""

User prompt (constructed per request):

"""
Context so far:
{FULL_USER_TEXT}

Respond with the contrapuntal version. Divergence level: {DIAL_0_100}.
"""

Notes:
- We strictly cap sentence counts: if the user wrote 1 sentence in the active paragraph, respond with 1.
- If multiple paragraphs exist, mirror count and line breaks.

### API Integration

- Proxy endpoint (from PDF): `https://itp-ima-replicate-proxy.web.app/api/create_n_get`
- Examples page: `https://itp-ima-replicate-proxy.web.app/examples.html`
- HTTP: `POST`
- Headers:
  - `Content-Type: application/json`
  - No Authorization header required (proxy non-authorized mode)
- Body (Replicate-style):

```json
{
  "model": "meta/meta-llama-3-70b-instruct",
  "input": {
    "prompt": "<system and user prompt combined as above>",
    "temperature": 0.2,
    "top_p": 0.9,
    "max_tokens": 400
  },
  "stream": false
}
```

Response handling:
- The proxy returns the final output; if an array is returned, join parts; if `output` is a string, use as-is. See examples page for exact schema.

Example fetch (Vanilla JS):

```js
export async function fetchCounterpoint({ fullUserText, dial }) {
  const temperature = 0.2 + 0.6 * (dial / 100);
  const system = `You are a counterpoint writer. Write a response that takes the OPPOSITE stance to the user's text while: \n- Preserving the main topics and references so the connection is evident\n- Matching paragraph count and NOT exceeding the number of sentences per paragraph\n- Staying within ±20% length of the user's paragraph(s)\n- Avoiding direct antonym swaps; argue from different premises and values\nTone: clear, concise, neutral unless instructed otherwise.`;
  const user = `Context so far:\n${fullUserText}\n\nRespond with the contrapuntal version. Divergence level: ${dial}.`;
  const prompt = `${system}\n\nUSER:\n${user}`;

  const res = await fetch('https://itp-ima-replicate-proxy.web.app/api/create_n_get', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
      // 'Authorization': `Bearer ${YOUR_TOKEN}`, // if required by proxy
    },
    body: JSON.stringify({
      model: 'meta/meta-llama-3-70b-instruct',
      input: {
        prompt,
        temperature,
        top_p: 0.9,
        max_tokens: 400
      },
      stream: false
    })
  });

  if (!res.ok) throw new Error(`Proxy error ${res.status}`);
  const data = await res.json();
  // Accept either string or array-shaped outputs
  const out = Array.isArray(data.output) ? data.output.join('') : (data.output ?? data);
  return typeof out === 'string' ? out : JSON.stringify(out);
}
```

### Minimal State Model

```ts
type Section = {
  userText: string;
  aiText: string;
  status: 'idle' | 'loading' | 'done' | 'error';
};

type AppState = {
  sections: Section[];
  currentDial: number; // 0..100
  lastSendAt: number | null; // ms
};

// Pure helpers
export const splitParagraphs = (text: string) => text.split(/\n/);
export const sentenceCount = (text: string) => (text.match(/[.!?](?=\s|$)/g) || []).length || (text.trim() ? 1 : 0);
export const shouldSend = ({ lastTypedAt, wordsInPara, endedSentence, now }) => {
  if (endedSentence) return true;
  if (wordsInPara % 5 === 0 && wordsInPara > 0) return true;
  if (lastTypedAt && now - lastTypedAt >= 5000) return true;
  return false;
};
```

### UI Notes

- Minimal split view (CSS grid). No responsive requirements.
- Subtle initial instruction in the user pane; hide on first keystroke.
- Small loading indicator appears in the AI pane after a send, disappears on response.
- Keep 1:1 paragraph alignment; do not add extra sentences beyond user counts.

### Open Items (can defer)

- None for v1.


## One-Shot Implementation Spec v2 (Authoritative)

This section is sufficient for an LLM or dev to implement the app end-to-end without further discussion.

### File Layout (Vanilla JS + ES Modules, no bundler)

- `index.html` — minimal HTML shell, includes `style.css` and ESM entry `app.js`.
- `style.css` — style tokens and layout rules.
- `app.js` — bootstraps app, wires DOM, event listeners, state, and AI calls.
- `state.js` — pure state functions; sections, dial, guards.
- `ai.js` — prompt compose + fetch to proxy.
- `ui.js` — DOM rendering: panes, loading indicator, instruction overlay, dial.
- `util.js` — text utils (word count, sentence detection), timers.

All imports must be standard ESM via `<script type="module" src="app.js"></script>`.

### HTML Structure (IDs/classes are contract)

```html
<div id="app">
  <header id="toolbar">
    <label for="dial">Divergence</label>
    <input id="dial" type="range" min="0" max="100" value="50" />
    <span id="dialValue">50</span>
  </header>
  <main id="split">
    <section id="userPane">
      <div id="hint">Start typing. The right side will answer with a counterpoint.</div>
      <textarea id="editor" spellcheck="false"></textarea>
    </section>
    <section id="aiPane">
      <div id="aiContent"></div>
      <div id="aiLoading" hidden>Thinking…</div>
    </section>
  </main>
</div>
```

### Style Tokens (lock these)

```css
:root{
  --bg:#fbfbf7; --text:#222; --muted:#777; --accent:#7a6cff;
  --pane-bg:#fffefb; --border:#e8e5db;
  --font: ui-sans-serif, -apple-system, Segoe UI, Roboto, Inter, system-ui, sans-serif;
  --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  --fs-0:14px; --fs-1:16px; --fs-2:18px; --fs-3:20px;
  --lh:1.6; --space-1:8px; --space-2:12px; --space-3:16px; --space-4:24px; --space-5:32px;
  --gutter: var(--space-5);
}
html,body,#app{height:100%}
body{margin:0;background:var(--bg);color:var(--text);font-family:var(--font);font-size:var(--fs-2);line-height:var(--lh)}
#toolbar{display:flex;gap:var(--space-2);align-items:center;padding:var(--space-3) var(--gutter);border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--bg);}
#split{display:grid;grid-template-columns:1fr 1fr;gap:var(--gutter);padding:var(--gutter);}
#userPane,#aiPane{background:var(--pane-bg);border:1px solid var(--border);padding:var(--space-4);min-height:60vh;position:relative}
#editor{width:100%;min-height:60vh;border:0;outline:none;background:transparent;resize:none;font:inherit;line-height:var(--lh)}
#hint{position:absolute;top:var(--space-4);left:var(--space-4);color:var(--muted);pointer-events:none}
#aiContent{white-space:pre-wrap}
#aiLoading{position:absolute;right:var(--space-4);bottom:var(--space-4);color:var(--muted)}
input[type="range"]{accent-color:var(--accent)}
```

Interaction visuals:
- Hide `#hint` on first non-whitespace input.
- Show `#aiLoading` while awaiting response.

### State Model and Events (authoritative)

```ts
type Section = { userText: string; aiText: string; status: 'idle'|'loading'|'done'|'error' };
type AppState = { sections: Section[]; currentDial: number; lastTypedAt: number|null; lastSentAt: number|null };
```

Events and handlers:
- `onInput(text: string, now: number)`
  - Update `sections[activeIndex].userText = text` (single section model is fine; paragraphs mirrored in render).
  - Update `lastTypedAt = now`.
  - Evaluate trigger via `shouldSend` (below); if true and `cooldownOk` send request.
- `onDialChange(value: number)` update `currentDial` and optionally re-send next trigger; no immediate re-render of AI.

### Trigger Algorithms (exact)

- Word count of active paragraph: `countWords(paraText)` with regex `/[A-Za-zÀ-ÖØ-öø-ÿ0-9']+/g` length.
- End-of-sentence: test `/[.!?](?=\s|$)/` on the active paragraph tail.
- Idle: `now - lastTypedAt >= 5000`.
- Send if any is true. Add a global cooldown: `now - (lastSentAt||0) >= 800ms` to avoid bursts.

```js
export const shouldSend = ({ lastTypedAt, wordsInPara, endedSentence, now, lastSentAt }) => {
  const cooldownOk = !lastSentAt || (now - lastSentAt) >= 800;
  if (!cooldownOk) return false;
  if (endedSentence) return true;
  if (wordsInPara > 0 && wordsInPara % 5 === 0) return true;
  if (lastTypedAt && (now - lastTypedAt) >= 5000) return true;
  return false;
};
```

### Paragraph/Sentence Guard (client-side acceptance)

- Split user text by single newline `\n` into paragraphs.
- For each user paragraph, compute allowed sentence count `sc = max(1, sentenceCount(userPara))`.
- After AI response arrives, for each AI paragraph, trim to `sc` sentences using regex split on `[.!?](?=\s|$)`.
- If AI returns fewer paragraphs, pad missing with empty strings; if more, drop extras.

### Divergence Dial → Parameters and Prompt Variant

- Temperature: `0.2 + 0.6 * (dial/100)` → `[0.2..0.8]`.
- Prompt addendum by bucket:
  - 0–20: "offer gentle alternative framing; avoid confrontational language"
  - 21–60: "present a clear opposing stance with concrete counterarguments"
  - 61–100: "take a strong opposing stance; challenge assumptions and propose alternative premises"

Prompt assembly (single `prompt` string sent):

```text
SYSTEM:
You are a counterpoint writer. Oppose the user's stance while:
- Preserving topic anchors and references
- Matching paragraph count and NOT exceeding sentence count per paragraph
- Staying within ±20% length of the user's paragraphs
- Avoiding trivial antonyms; argue from different premises/values
Tone: clear, concise, neutral.

USER:
Context so far:
{FULL_USER_TEXT}

Instruction: Divergence {DIAL} — {BUCKET_LINE}
Return only the counterpoint text.
```

### API Contract (proxy to Replicate)

- URL: `https://itp-ima-replicate-proxy.web.app/api/create_n_get`
- Method: `POST`
- Headers: `Content-Type: application/json`; if required, `Authorization: Bearer <TOKEN>` (see examples page).
- Body (canonical):

```json
{
  "model": "meta/meta-llama-3-70b-instruct",
  "input": {
    "prompt": "...",
    "temperature": 0.2,
    "top_p": 0.9,
    "max_tokens": 400
  },
  "stream": false
}
```

- Response: JSON. Prefer `data.output` as string; if array, join. Fallback: if `data` is already a string, use directly.
- Errors: non-2xx → throw; show loading indicator off and small inline error in `#aiLoading` ("Error. Retry").

### Rendering Rules

- Mirror paragraph count: split AI text by `\n`; render into `#aiContent` with `\n` preserved.
- Never show more sentences than user per paragraph (apply guard above).
- While waiting: `#aiLoading[hidden=false]`, dim `#aiContent` to 0.6 opacity.
- Hide hint once editor has any non-whitespace character.

### Minimal Flow (imperative outline)

1. On load: render layout; attach listeners to `#editor`, `#dial`.
2. On input: update state; compute triggers; if send → set `status='loading'`, show loader, call `fetchCounterpoint`.
3. On success: apply sentence guard, update `aiText`, set `status='done'`, hide loader.
4. On failure: set `status='error'`, hide loader, show inline error; allow next trigger to try again.

### Manual Test Checklist (must pass)

- Typing a single sentence and pressing space after period triggers a request.
- After 5 words without punctuation, triggers a request.
- After 5s idle, triggers a request.
- AI never returns 2 sentences when user paragraph has 1 (client guard trims).
- Dial at 0 vs 100 noticeably changes oppositional strength.
- Hint disappears after first keystroke and never reappears this session.
- Loading indicator shows only while awaiting; disappears after.
- Newlines in user text produce corresponding newlines in AI pane.

### Performance and Limits

- Always send full user context as requested. If payload exceeds proxy/model limits, truncate from the start to last 4000 characters while keeping paragraph boundaries (only if necessary).
- Global cooldown 800ms to avoid burst requests.

### Non-Goals

- No streaming, no persistence, no export, no analytics, no A11y advanced features.

### Open Questions (answer to finalize)

- Confirm proxy auth: is an `Authorization` header required, and what token format?
- Confirm model input keys: `max_tokens` vs `max_new_tokens` for this Llama variant on Replicate.
- Any cap on request body size at the proxy layer we should respect?
