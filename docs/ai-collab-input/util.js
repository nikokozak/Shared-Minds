// Text processing utilities

/**
 * Count words in text using regex for alphanumeric sequences
 */
export function countWords(text) {
  const matches = text.match(/[A-Za-zÀ-ÖØ-öø-ÿ0-9']+/g);
  return matches ? matches.length : 0;
}

/**
 * Count sentences in text using terminal punctuation
 */
export function sentenceCount(text) {
  const matches = text.match(/[.!?](?=\s|$)/g);
  return matches ? matches.length : (text.trim() ? 1 : 0);
}

/**
 * Check if text ends with a sentence
 */
export function endsWithSentence(text) {
  return /[.!?]$/.test(text);
}

/**
 * Split text into paragraphs by single newline
 */
export function splitParagraphs(text) {
  return text.split(/\n/);
}

/**
 * Trim AI response to match user sentence count per paragraph
 */
export function applySentenceGuard(aiText, userText) {
  const userParas = splitParagraphs(userText);
  const aiParas = splitParagraphs(aiText);
  
  const guardedParas = userParas.map((userPara, i) => {
    const maxSentences = Math.max(1, sentenceCount(userPara));
    const aiPara = aiParas[i] || '';
    
    if (!aiPara) return '';
    
    // Split AI paragraph into sentences
    const sentences = aiPara.split(/([.!?](?=\s|$))/).reduce((acc, part, i) => {
      if (i % 2 === 0) {
        acc.push(part);
      } else {
        acc[acc.length - 1] += part;
      }
      return acc;
    }, []).filter(s => s.trim());
    
    // Take only the allowed number of sentences
    return sentences.slice(0, maxSentences).join('');
  });
  
  return guardedParas.join('\n');
}

/**
 * Determine if we should send a request based on current state
 */
export function shouldSend({ wordsInPara, endedSentence, keystrokesInPara, lastSentAt, now }) {
  const cooldownOk = !lastSentAt || (now - lastSentAt) >= 2000; // Increased cooldown
  if (!cooldownOk) return false;
  
  if (endedSentence) return true;
  // Trigger after ~60 keystrokes (longer threshold)
  if (keystrokesInPara > 0 && keystrokesInPara % 60 === 0) return true;
  
  return false;
}
