// Pure state management functions

/**
 * Initial application state
 */
export function createInitialState() {
  return {
    currentTool: 'draw', // 'draw'
    caption: '',
    status: 'idle', // 'idle' | 'loading' | 'done' | 'error'
  };
}

/**
 * Set current drawing tool
 */
export function setTool(state, tool) {
  return {
    ...state,
    currentTool: tool
  };
}

/**
 * Set loading state when processing image
 */
export function setLoading(state) {
  return {
    ...state,
    status: 'loading'
  };
}

/**
 * Set caption and mark as done
 */
export function setCaption(state, caption) {
  return {
    ...state,
    caption,
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
