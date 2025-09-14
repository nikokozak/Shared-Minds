// AI integration and prompt management

/**
 * Get divergence instruction based on dial value
 */
function getDivergenceInstruction(dial) {
  if (dial <= 20) {
    return "offer gentle alternative framing; avoid confrontational language";
  } else if (dial <= 60) {
    return "present a clear opposing stance with concrete counterarguments";
  } else {
    return "take a strong opposing stance; challenge assumptions and propose alternative premises";
  }
}

/**
 * Build the complete prompt for the AI
 */
function buildPrompt(userText, dial) {
  const system = `SYSTEM:
You are an independent writer crafting your own text that mirrors another writer's structure but expresses contrarian views. Write as if you're a different person with opposing perspectives, experiences, and values.

CRITICAL REQUIREMENTS:
- Match the EXACT structure: same paragraph count, same sentence count per paragraph
- Mirror the writing style, tone, and complexity level
- Address the SAME specific topics and themes
- Express naturally opposing viewpoints through different assumptions and experiences
- Write with similar depth and nuance - if they're philosophical, be philosophical; if they're concrete, be concrete

DO NOT:
- Respond to or address the other writer
- Use transitional phrases like "However," "But," "On the contrary"
- Write generic opposites - be specific and substantive
- Change the subject matter or level of abstraction

DO:
- Write as your own independent voice with contrarian experiences
- Use parallel sentence structures when possible
- Reference the same specific elements (places, emotions, concepts) but from opposing angles
- Match their level of detail and introspection`;

  const bucketInstruction = getDivergenceInstruction(dial);
  
  const user = `USER:
Another writer wrote:
${userText}

Write your own independent text that mirrors their structure exactly but expresses contrarian perspectives. Divergence: ${dial} — ${bucketInstruction}

Your contrarian text:`;

  return `${system}\n\n${user}`;
}

/**
 * Calculate temperature based on dial value
 */
function getTemperature(dial) {
  return 0.2 + 0.6 * (dial / 100);
}

/**
 * Fetch counterpoint from the AI via proxy
 */
export async function fetchCounterpoint({ userText, dial }) {
  if (!userText.trim()) {
    throw new Error('No text to process');
  }

  const prompt = buildPrompt(userText, dial);
  const temperature = getTemperature(dial);

  const response = await fetch('https://itp-ima-replicate-proxy.web.app/api/create_n_get', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
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

  if (!response.ok) {
    throw new Error(`Proxy error ${response.status}`);
  }

  const data = await response.json();
  
  // Handle different response formats
  let output;
  if (Array.isArray(data.output)) {
    output = data.output.join('');
  } else if (typeof data.output === 'string') {
    output = data.output;
  } else if (typeof data === 'string') {
    output = data;
  } else {
    output = JSON.stringify(data);
  }

  return output.trim();
}
