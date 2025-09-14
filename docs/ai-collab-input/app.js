// Main application bootstrap and event handling

import { getElements, render } from './ui.js';
import { 
  createInitialState, 
  updateUserText, 
  updateDial, 
  setLoading, 
  setAiResponse, 
  setError 
} from './state.js';
import { fetchCounterpoint } from './ai.js';
import { 
  countWords, 
  endsWithSentence, 
  shouldSend, 
  applySentenceGuard,
  splitParagraphs 
} from './util.js';

// Global state
let state = createInitialState();
let elements = null;

/**
 * Handle user input and trigger AI responses
 */
async function handleInput(text, now) {
  // Update state with new text
  state = updateUserText(state, text, now);
  
  // Get current paragraph for analysis
  const paragraphs = splitParagraphs(text);
  const currentParagraph = paragraphs[paragraphs.length - 1] || '';
  const wordsInPara = countWords(currentParagraph);
  const keystrokesInPara = currentParagraph.length;
  const endedSentence = endsWithSentence(currentParagraph);
  
  // Check if we should send a request
  const shouldSendRequest = shouldSend({
    wordsInPara,
    endedSentence,
    keystrokesInPara,
    lastSentAt: state.lastSentAt,
    now
  });
  
  // Render current state
  render(elements, state);
  
  // Send request if conditions are met
  if (shouldSendRequest && text.trim()) {
    await sendAiRequest(text, now);
  }
}

/**
 * Send request to AI and handle response
 */
async function sendAiRequest(userText, now) {
  // Prevent multiple simultaneous requests
  if (state.status === 'loading') {
    return;
  }
  
  try {
    // Set loading state
    state = setLoading(state, now);
    render(elements, state);
    
    // Fetch AI response
    const aiResponse = await fetchCounterpoint({
      userText,
      dial: state.currentDial
    });
    
    // Apply sentence guard to ensure proper paragraph/sentence matching
    const guardedResponse = applySentenceGuard(aiResponse, userText);
    
    // Update state with response
    state = setAiResponse(state, guardedResponse);
    render(elements, state);
    
  } catch (error) {
    console.error('AI request failed:', error);
    state = setError(state);
    render(elements, state);
    
    // Auto-retry after a delay on error
    setTimeout(() => {
      if (state.status === 'error') {
        state = { ...state, status: 'idle' };
        render(elements, state);
      }
    }, 3000);
  }
}

/**
 * Handle dial changes
 */
function handleDialChange(value) {
  state = updateDial(state, parseInt(value, 10));
  render(elements, state);
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
  // Editor input handling
  elements.editor.addEventListener('input', (e) => {
    handleInput(e.target.value, Date.now());
  });
  
  // Dial change handling
  elements.dial.addEventListener('input', (e) => {
    handleDialChange(e.target.value);
  });
  
  // Focus editor on load
  elements.editor.focus();
}

/**
 * Initialize the application
 */
function init() {
  elements = getElements();
  setupEventListeners();
  render(elements, state);
}

// Start the app when DOM is loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
