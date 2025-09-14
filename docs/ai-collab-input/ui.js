// DOM rendering and UI management

/**
 * Get DOM elements
 */
export function getElements() {
  return {
    editor: document.getElementById('editor'),
    aiContent: document.getElementById('aiContent'),
    aiLoading: document.getElementById('aiLoading'),
    aiPane: document.getElementById('aiPane'),
    hint: document.getElementById('hint'),
    dial: document.getElementById('dial'),
    dialValue: document.getElementById('dialValue')
  };
}

/**
 * Update the hint visibility
 */
export function updateHint(elements, visible) {
  elements.hint.style.display = visible ? 'block' : 'none';
}

/**
 * Update the AI content display
 */
export function updateAiContent(elements, text) {
  elements.aiContent.textContent = text;
}

/**
 * Update loading state visual indicators
 */
export function updateLoadingState(elements, isLoading, isError = false) {
  elements.aiLoading.hidden = !isLoading && !isError;
  
  if (isLoading) {
    elements.aiLoading.textContent = 'Thinking…';
    elements.aiPane.classList.add('loading');
    elements.aiPane.classList.remove('error');
  } else if (isError) {
    elements.aiLoading.textContent = 'Error. Retry';
    elements.aiPane.classList.remove('loading');
    elements.aiPane.classList.add('error');
  } else {
    elements.aiPane.classList.remove('loading', 'error');
  }
}

/**
 * Update dial display
 */
export function updateDialDisplay(elements, value) {
  elements.dialValue.textContent = value;
  elements.dial.value = value;
}

/**
 * Render the complete UI state
 */
export function render(elements, state) {
  // Update hint visibility
  updateHint(elements, state.hintVisible);
  
  // Update AI content
  updateAiContent(elements, state.aiText);
  
  // Update loading state
  const isLoading = state.status === 'loading';
  const isError = state.status === 'error';
  updateLoadingState(elements, isLoading, isError);
  
  // Update dial
  updateDialDisplay(elements, state.currentDial);
}
