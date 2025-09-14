// AI integration for image captioning

/**
 * Build the prompt for image captioning
 */
function buildCaptionPrompt() {
  return `What do you think this drawing represents? Be as succinct as possible. Ideally one word. If there are multiple components, then at most one sentence.`;
}

/**
 * Caption image using Claude 4 Sonnet via Replicate proxy
 */
export async function captionImage(imageDataURL) {
  if (!imageDataURL) {
    throw new Error('No image data provided');
  }
  
  console.log('Image data URL length:', imageDataURL.length);
  console.log('Image data URL prefix:', imageDataURL.substring(0, 50));

  // Strip the data URL prefix to get just the base64 data
  const base64Data = imageDataURL.replace(/^data:image\/[a-z]+;base64,/, '');
  console.log('Base64 data length:', base64Data.length);

  const response = await fetch('https://itp-ima-replicate-proxy.web.app/api/create_n_get', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'anthropic/claude-4-sonnet',
      fieldToConvertBase64ToURL: 'image',
      fileFormat: 'png',
      input: {
        image: base64Data,
        prompt: buildCaptionPrompt(),
        max_tokens: 1024
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Proxy error details:', errorText);
    throw new Error(`Proxy error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  console.log('API response:', data);
  
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
