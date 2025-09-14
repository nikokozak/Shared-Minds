// Main application bootstrap and event handling

import { getElements, render } from './ui.js';
import { 
  createInitialState, 
  setTool,
  setLoading, 
  setCaption, 
  setError 
} from './state.js';
import { captionImage } from './ai.js';

// Global state
let state = createInitialState();
let elements = null;

// Drawing state
let isDrawing = false;
let lastX = 0;
let lastY = 0;

/**
 * Get canvas coordinates from mouse event
 */
function getCanvasCoords(canvas, e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top
  };
}

/**
 * Start drawing
 */
function startDrawing(e) {
  isDrawing = true;
  const coords = getCanvasCoords(elements.canvas, e);
  lastX = coords.x;
  lastY = coords.y;
}

/**
 * Draw line
 */
function draw(e) {
  if (!isDrawing) return;
  
  const ctx = elements.canvas.getContext('2d');
  const coords = getCanvasCoords(elements.canvas, e);
  
  ctx.beginPath();
  ctx.moveTo(lastX, lastY);
  ctx.lineTo(coords.x, coords.y);
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.stroke();
  
  lastX = coords.x;
  lastY = coords.y;
}

/**
 * Stop drawing
 */
function stopDrawing() {
  isDrawing = false;
}

/**
 * Clear canvas
 */
function clearCanvas() {
  const ctx = elements.canvas.getContext('2d');
  ctx.clearRect(0, 0, elements.canvas.width, elements.canvas.height);
  
  // Clear caption too
  state = setCaption(state, '');
  render(elements, state);
}

/**
 * Convert canvas to base64 image data
 */
function canvasToDataURL() {
  return elements.canvas.toDataURL('image/png');
}

/**
 * Process image with AI
 */
async function processImage() {
  // Prevent multiple simultaneous requests
  if (state.status === 'loading') {
    return;
  }
  
  try {
    // Set loading state
    state = setLoading(state);
    render(elements, state);
    
    // Get image data
    const imageData = canvasToDataURL();
    
    // Fetch AI caption
    const caption = await captionImage(imageData);
    
    // Update state with response
    state = setCaption(state, caption);
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
 * Set up event listeners
 */
function setupEventListeners() {
  // Canvas drawing events
  elements.canvas.addEventListener('mousedown', startDrawing);
  elements.canvas.addEventListener('mousemove', draw);
  elements.canvas.addEventListener('mouseup', stopDrawing);
  elements.canvas.addEventListener('mouseout', stopDrawing);
  
  // Tool selection
  elements.clearTool.addEventListener('click', clearCanvas);
  
  // Process button
  elements.processBtn.addEventListener('click', processImage);
  
  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      processImage();
    }
  });
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
