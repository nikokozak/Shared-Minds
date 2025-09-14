// DOM rendering and UI management

/**
 * Get DOM elements
 */
export function getElements() {
  return {
    canvas: document.getElementById('drawingCanvas'),
    clearTool: document.getElementById('clearTool'),
    processBtn: document.getElementById('processBtn'),
    caption: document.getElementById('caption'),
    loading: document.getElementById('loading'),
    captionContainer: document.getElementById('captionContainer')
  };
}

/**
 * Update tool button states (no longer needed but keeping for consistency)
 */
export function updateToolStates(elements, currentTool) {
  // No tools to update anymore
}

/**
 * Update caption display
 */
export function updateCaption(elements, text) {
  elements.caption.textContent = text;
}

/**
 * Update loading state visual indicators
 */
export function updateLoadingState(elements, isLoading, isError = false) {
  elements.loading.hidden = !isLoading && !isError;
  
  if (isLoading) {
    elements.loading.textContent = 'Analyzing image...';
    elements.captionContainer.classList.add('loading');
    elements.captionContainer.classList.remove('error');
  } else if (isError) {
    elements.loading.textContent = 'Error. Try again';
    elements.captionContainer.classList.remove('loading');
    elements.captionContainer.classList.add('error');
  } else {
    elements.captionContainer.classList.remove('loading', 'error');
  }
}

/**
 * Render the complete UI state
 */
export function render(elements, state) {
  // Update tool states
  updateToolStates(elements, state.currentTool);
  
  // Update caption
  updateCaption(elements, state.caption);
  
  // Update loading state
  const isLoading = state.status === 'loading';
  const isError = state.status === 'error';
  updateLoadingState(elements, isLoading, isError);
}
