document.getElementById('extractBtn').addEventListener('click', async () => {
  const button = document.getElementById('extractBtn');
  const status = document.getElementById('status');
  
  button.disabled = true;
  button.textContent = 'Extracting...';
  status.style.display = 'none';
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab.url.includes('youtube.com/watch')) {
      showStatus('Please open a YouTube video page', 'error');
      return;
    }
    
    // Send message to content script
    chrome.tabs.sendMessage(tab.id, { action: 'extractTranscript' }, (response) => {
      if (chrome.runtime.lastError) {
        showStatus('Error: Please refresh the page and try again', 'error');
        button.disabled = false;
        button.textContent = 'Extract Transcript';
        return;
      }
      
      if (response.success) {
        downloadTranscript(response.text, response.videoTitle);
        showStatus(`Downloaded ${response.segmentCount} segments!`, 'success');
      } else {
        showStatus(response.message, 'error');
      }
      
      button.disabled = false;
      button.textContent = 'Extract Transcript';
    });
  } catch (error) {
    showStatus('Error: ' + error.message, 'error');
    button.disabled = false;
    button.textContent = 'Extract Transcript';
  }
});

function downloadTranscript(text, videoTitle) {
  const sanitizedTitle = videoTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const filename = `${sanitizedTitle}_transcript.txt`;
  
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  
  URL.revokeObjectURL(url);
}

function showStatus(message, type) {
  const status = document.getElementById('status');
  status.textContent = message;
  status.className = type;
  status.style.display = 'block';
}
