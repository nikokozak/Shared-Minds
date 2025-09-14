// Pure state management functions

/**
 * Initial application state
 */
export function createInitialState() {
  return {
    userText: '',
    aiText: '',
    status: 'idle', // 'idle' | 'loading' | 'done' | 'error'
    currentDial: 50,
    lastTypedAt: null,
    lastSentAt: null,
    hintVisible: true
  };
}

/**
 * Update user text and related timestamps
 */
export function updateUserText(state, text, now) {
  return {
    ...state,
    userText: text,
    lastTypedAt: now,
    hintVisible: text.trim() === ''
  };
}

/**
 * Update divergence dial value
 */
export function updateDial(state, value) {
  return {
    ...state,
    currentDial: value
  };
}

/**
 * Set loading state when sending request
 */
export function setLoading(state, now) {
  return {
    ...state,
    status: 'loading',
    lastSentAt: now
  };
}

/**
 * Set AI response and mark as done
 */
export function setAiResponse(state, aiText) {
  return {
    ...state,
    aiText,
    status: 'done'
  };
}

/**
 * Set error state
 */
export function setError(state) {
  return {
    ...state,
    status: 'error'
  };
}

/**
 * Reset to idle state
 */
export function resetToIdle(state) {
  return {
    ...state,
    status: 'idle'
  };
}
