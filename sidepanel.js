// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const tabName = tab.dataset.tab;
    
    // Update tab buttons
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    
    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    document.getElementById(`${tabName}Tab`).classList.add('active');
  });
});

// Playlist extraction
document.getElementById('extractPlaylistBtn').addEventListener('click', async () => {
  const playlistUrl = document.getElementById('playlistUrl').value.trim();
  const button = document.getElementById('extractPlaylistBtn');
  
  if (!playlistUrl) {
    showStatus('Please enter a playlist URL', 'error', 'playlistStatus');
    return;
  }
  
  // Validate that it's a YouTube URL
  if (!playlistUrl.includes('youtube.com') && !playlistUrl.includes('youtu.be')) {
    showStatus('Invalid URL. Please provide a valid YouTube playlist or channel URL.', 'error', 'playlistStatus');
    return;
  }
  
  // Determine if it's a playlist or channel videos page
  let targetUrl = playlistUrl;
  let isChannelVideos = false;
  
  // Check if it's a channel videos page
  if (playlistUrl.includes('/@') || playlistUrl.includes('/channel/') || playlistUrl.includes('/c/') || playlistUrl.includes('/user/')) {
    isChannelVideos = true;
    // Ensure it ends with /videos
    if (!playlistUrl.endsWith('/videos')) {
      targetUrl = playlistUrl.replace(/\/$/, '') + '/videos';
    }
  } else {
    // It's a playlist URL - extract playlist ID
    let playlistId = null;
    
    const urlPatterns = [
      /[?&]list=([^&\s]+)/i,           // ?list= or &list=
      /playlist\?list=([^&\s]+)/i,     // playlist?list=
      /^([A-Za-z0-9_-]{13,})$/,        // Just the playlist ID (13+ chars)
      /list\/([^\/\s]+)/i              // /list/
    ];
    
    for (const pattern of urlPatterns) {
      const match = playlistUrl.match(pattern);
      if (match) {
        playlistId = match[1];
        break;
      }
    }
    
    if (!playlistId) {
      showStatus('Invalid URL. Please provide a valid YouTube playlist or channel videos URL.', 'error', 'playlistStatus');
      return;
    }
    
    targetUrl = `https://www.youtube.com/playlist?list=${playlistId}`;
  }
  
  button.disabled = true;
  button.textContent = 'Extracting...';
  showStatus(isChannelVideos ? 'Navigating to channel and extracting video IDs...' : 'Navigating to playlist and extracting video IDs...', 'info', 'playlistStatus');
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // Navigate to the target URL
    await chrome.tabs.update(tab.id, { url: targetUrl });
    
    // Wait for page to load
    await sleep(3000);
    
    // Extract video IDs from playlist or channel
    chrome.tabs.sendMessage(tab.id, { action: 'extractPlaylistIds', isChannelVideos: isChannelVideos }, async (response) => {
      if (chrome.runtime.lastError) {
        showStatus('Error: Please refresh the page and try again', 'error', 'playlistStatus');
        button.disabled = false;
        button.textContent = 'Extract Video IDs from Playlist';
        return;
      }
      
      if (response.success && response.videoIds.length > 0) {
        const videoIds = response.videoIds;
        
        // Save to storage
        await chrome.storage.local.set({ savedVideoIds: videoIds });
        
        // Display results
        document.getElementById('videoCount').textContent = videoIds.length;
        document.getElementById('extractedIds').value = videoIds.join('\n');
        document.getElementById('playlistResults').style.display = 'block';
        
        showStatus(`Successfully extracted ${videoIds.length} video IDs and saved to storage!`, 'success', 'playlistStatus');
      } else {
        showStatus(response.message || 'No video IDs found in playlist', 'error', 'playlistStatus');
      }
      
      button.disabled = false;
      button.textContent = 'Extract Video IDs from Playlist';
    });
  } catch (error) {
    showStatus('Error: ' + error.message, 'error', 'playlistStatus');
    button.disabled = false;
    button.textContent = 'Extract Video IDs from Playlist';
  }
});

// Download video IDs
document.getElementById('downloadIdsBtn').addEventListener('click', () => {
  const videoIds = document.getElementById('extractedIds').value;
  
  if (!videoIds) {
    alert('No video IDs to download');
    return;
  }
  
  const blob = new Blob([videoIds], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = 'video_ids.txt';
  a.click();
  
  URL.revokeObjectURL(url);
});

// Use extracted IDs for batch processing
document.getElementById('useForBatchBtn').addEventListener('click', () => {
  const videoIds = document.getElementById('extractedIds').value;
  
  if (!videoIds) {
    alert('No video IDs available');
    return;
  }
  
  // Switch to batch tab
  document.querySelector('[data-tab="batch"]').click();
  
  // Fill in the video IDs
  document.getElementById('videoIds').value = videoIds;
  
  // Update batch info
  updateBatchInfo();
});

// Load stored IDs
document.getElementById('loadStoredIdsBtn').addEventListener('click', async () => {
  const result = await chrome.storage.local.get(['savedVideoIds']);
  
  if (result.savedVideoIds && result.savedVideoIds.length > 0) {
    document.getElementById('videoIds').value = result.savedVideoIds.join('\n');
    updateBatchInfo();
    showStatus(`Loaded ${result.savedVideoIds.length} video IDs from storage`, 'success', 'batchStatus');
  } else {
    showStatus('No video IDs found in storage', 'error', 'batchStatus');
  }
});

// Clear IDs
document.getElementById('clearIdsBtn').addEventListener('click', () => {
  document.getElementById('videoIds').value = '';
  updateBatchInfo();
});

// Update batch info when video IDs or batch size changes
document.getElementById('videoIds').addEventListener('input', updateBatchInfo);
document.getElementById('batchSize').addEventListener('input', updateBatchInfo);

function updateBatchInfo() {
  const videoIdsText = document.getElementById('videoIds').value.trim();
  const batchSize = parseInt(document.getElementById('batchSize').value) || 10;
  
  if (!videoIdsText) {
    document.getElementById('batchInfo').textContent = '';
    return;
  }
  
  const videoIds = videoIdsText
    .split(/[\n,]+/)
    .map(id => id.trim().replace(/"/g, ''))
    .filter(id => id.length > 0);
  
  const totalVideos = videoIds.length;
  const numBatches = Math.ceil(totalVideos / batchSize);
  
  document.getElementById('batchInfo').textContent = `${totalVideos} videos = ${numBatches} batch${numBatches !== 1 ? 'es' : ''}`;
}

// Single video extraction
document.getElementById('extractBtn').addEventListener('click', async () => {
  const button = document.getElementById('extractBtn');
  const status = document.getElementById('status');
  const preview = document.getElementById('preview');
  const metadata = document.getElementById('metadata');
  
  button.disabled = true;
  button.textContent = 'Extracting...';
  status.style.display = 'none';
  preview.style.display = 'none';
  metadata.style.display = 'none';
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab.url.includes('youtube.com/watch')) {
      showStatus('Please open a YouTube video page', 'error', 'status');
      button.disabled = false;
      button.textContent = 'Extract Transcript';
      return;
    }
    
    showStatus('Looking for transcript... (auto-clicking if needed)', 'info', 'status');
    
    chrome.tabs.sendMessage(tab.id, { action: 'extractTranscript' }, (response) => {
      if (chrome.runtime.lastError) {
        showStatus('Error: Please refresh the page and try again', 'error', 'status');
        button.disabled = false;
        button.textContent = 'Extract Transcript';
        return;
      }
      
      if (response.success) {
        const autoClickedNote = response.autoClicked ? ' <span style="color: #28a745;">✓ Auto-clicked</span>' : '';
        metadata.innerHTML = `
          <div><strong>Channel:</strong> ${response.channelUsername || 'N/A'}</div>
          <div><strong>Video ID:</strong> ${response.videoId || 'N/A'}</div>
          <div><strong>Segments:</strong> ${response.segmentCount}</div>
          <div><strong>Characters:</strong> ${response.transcript.length}${autoClickedNote}</div>
        `;
        metadata.style.display = 'block';
        
        preview.textContent = response.transcript.substring(0, 500) + (response.transcript.length > 500 ? '...' : '');
        preview.style.display = 'block';
        
        downloadTranscriptJSON(response.channelUsername, response.videoId, response.transcript);
        
        const successMsg = response.autoClicked 
          ? 'Transcript auto-loaded and downloaded as JSON!' 
          : 'Transcript downloaded as JSON!';
        showStatus(successMsg, 'success', 'status');
      } else {
        showStatus(response.message, 'error', 'status');
      }
      
      button.disabled = false;
      button.textContent = 'Extract Transcript';
    });
  } catch (error) {
    showStatus('Error: ' + error.message, 'error', 'status');
    button.disabled = false;
    button.textContent = 'Extract Transcript';
  }
});

// Batch processing
let batchProcessing = false;
let batchStopped = false;

document.getElementById('startBatchBtn').addEventListener('click', async () => {
  const videoIdsText = document.getElementById('videoIds').value.trim();
  
  if (!videoIdsText) {
    showStatus('Please enter video IDs', 'error', 'batchStatus');
    return;
  }
  
  // Parse video IDs (support comma-separated or newline-separated)
  const videoIds = videoIdsText
    .split(/[\n,]+/)
    .map(id => id.trim().replace(/"/g, ''))
    .filter(id => id.length > 0);
  
  if (videoIds.length === 0) {
    showStatus('No valid video IDs found', 'error', 'batchStatus');
    return;
  }
  
  const batchSize = parseInt(document.getElementById('batchSize').value) || 10;
  
  await startBatchProcess(videoIds, batchSize);
});

document.getElementById('stopBatchBtn').addEventListener('click', () => {
  batchStopped = true;
  document.getElementById('stopBatchBtn').style.display = 'none';
  showStatus('Stopping after current video...', 'info', 'batchStatus');
});

async function startBatchProcess(videoIds, batchSize = 10) {
  batchProcessing = true;
  batchStopped = false;
  
  document.getElementById('startBatchBtn').disabled = true;
  document.getElementById('stopBatchBtn').style.display = 'inline-block';
  document.getElementById('videoIds').disabled = true;
  document.getElementById('batchSize').disabled = true;
  
  const progressDiv = document.getElementById('batchProgress');
  const logDiv = document.getElementById('batchLog');
  
  progressDiv.style.display = 'block';
  logDiv.style.display = 'block';
  logDiv.innerHTML = '';
  
  let processed = 0;
  let successful = 0;
  let skipped = 0;
  let failed = 0;
  
  const numBatches = Math.ceil(videoIds.length / batchSize);
  
  addLog(`Starting batch process with ${videoIds.length} videos in ${numBatches} batch${numBatches !== 1 ? 'es' : ''} (${batchSize} per batch)...`, 'log-info');
  addLog(`Using random delays (5-15 seconds) to avoid rate limiting`, 'log-info');
  
  for (let i = 0; i < videoIds.length; i++) {
    if (batchStopped) {
      addLog(`Batch process stopped by user`, 'log-error');
      break;
    }
    
    const videoId = videoIds[i];
    const progress = ((i / videoIds.length) * 100).toFixed(1);
    const currentBatch = Math.floor(i / batchSize) + 1;
    
    progressDiv.innerHTML = `
      <div>Processing: ${i + 1} / ${videoIds.length} (${progress}%) - Batch ${currentBatch}/${numBatches}</div>
      <div class="progress-bar"><div class="progress-fill" style="width: ${progress}%"></div></div>
      <div>✓ Success: ${successful} | ⊘ Skipped: ${skipped} | ✗ Failed: ${failed}</div>
    `;
    
    addLog(`[${i + 1}/${videoIds.length}] [Batch ${currentBatch}] Processing: ${videoId}`, 'log-info');
    
    try {
      const result = await processVideo(videoId);
      
      if (result.success) {
        successful++;
        addLog(`✓ ${videoId}: Downloaded (${result.segmentCount} segments)`, 'log-success');
      } else if (result.noTranscript) {
        skipped++;
        addLog(`⊘ ${videoId}: No transcript available, skipping`, 'log-skip');
      } else {
        failed++;
        addLog(`✗ ${videoId}: ${result.message}`, 'log-error');
      }
    } catch (error) {
      failed++;
      addLog(`✗ ${videoId}: ${error.message}`, 'log-error');
    }
    
    processed++;
    
    // Random delay between videos (5-15 seconds) to avoid rate limiting
    if (i < videoIds.length - 1 && !batchStopped) {
      const delaySeconds = Math.floor(Math.random() * 11) + 5; // Random between 5-15 seconds
      addLog(`⏱ Waiting ${delaySeconds} seconds before next video...`, 'log-info');
      
      // Update progress with countdown
      for (let countdown = delaySeconds; countdown > 0; countdown--) {
        if (batchStopped) break;
        progressDiv.innerHTML = `
          <div>Processing: ${i + 1} / ${videoIds.length} (${progress}%) - Next in ${countdown}s</div>
          <div class="progress-bar"><div class="progress-fill" style="width: ${progress}%"></div></div>
          <div>✓ Success: ${successful} | ⊘ Skipped: ${skipped} | ✗ Failed: ${failed}</div>
        `;
        await sleep(1000);
      }
    }
  }
  
  // Final summary
  progressDiv.innerHTML = `
    <div><strong>Batch Complete!</strong></div>
    <div class="progress-bar"><div class="progress-fill" style="width: 100%"></div></div>
    <div>✓ Success: ${successful} | ⊘ Skipped: ${skipped} | ✗ Failed: ${failed} | Total: ${processed}</div>
  `;
  
  addLog(`✅ Batch complete: ${successful} downloaded, ${skipped} skipped, ${failed} failed`, 'log-success');
  showStatus(`Batch complete: ${successful} downloaded, ${skipped} skipped, ${failed} failed`, 'success', 'batchStatus');
  
  document.getElementById('startBatchBtn').disabled = false;
  document.getElementById('stopBatchBtn').style.display = 'none';
  document.getElementById('videoIds').disabled = false;
  document.getElementById('batchSize').disabled = false;
  batchProcessing = false;
}

async function processVideo(videoId) {
  return new Promise(async (resolve) => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // Navigate to the video
    await chrome.tabs.update(tab.id, { url: `https://www.youtube.com/watch?v=${videoId}` });
    
    // Wait longer for page to load (5-7 seconds with random variation)
    const loadDelay = Math.floor(Math.random() * 3000) + 5000; // 5-7 seconds
    await sleep(loadDelay);
    
    // Try to extract transcript with retry logic
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
      attempts++;
      
      try {
        const response = await new Promise((resolveMsg) => {
          chrome.tabs.sendMessage(tab.id, { action: 'extractTranscript' }, (response) => {
            resolveMsg(response);
          });
        });
        
        if (chrome.runtime.lastError) {
          if (attempts < maxAttempts) {
            addLog(`  ⟳ Retry ${attempts}/${maxAttempts} for ${videoId}...`, 'log-info');
            await sleep(2000); // Wait 2 seconds before retry
            continue;
          }
          resolve({ success: false, message: 'Failed to communicate with page after retries' });
          return;
        }
        
        if (!response) {
          if (attempts < maxAttempts) {
            addLog(`  ⟳ Retry ${attempts}/${maxAttempts} for ${videoId} (no response)...`, 'log-info');
            await sleep(2000);
            continue;
          }
          resolve({ success: false, message: 'No response from page' });
          return;
        }
        
        if (response.success) {
          downloadTranscriptJSON(response.channelUsername, response.videoId, response.transcript);
          resolve({ 
            success: true, 
            segmentCount: response.segmentCount 
          });
          return;
        } else {
          // Check if it's a "no transcript" error
          if (response.message.includes('not find') || response.message.includes('not have') || response.message.includes('not available')) {
            resolve({ success: false, noTranscript: true, message: response.message });
          } else {
            resolve({ success: false, message: response.message });
          }
          return;
        }
      } catch (error) {
        if (attempts < maxAttempts) {
          addLog(`  ⟳ Retry ${attempts}/${maxAttempts} for ${videoId} (error)...`, 'log-info');
          await sleep(2000);
          continue;
        }
        resolve({ success: false, message: error.message });
        return;
      }
    }
  });
}

function addLog(message, className = '') {
  const logDiv = document.getElementById('batchLog');
  const entry = document.createElement('div');
  entry.textContent = message;
  if (className) entry.className = className;
  logDiv.appendChild(entry);
  logDiv.scrollTop = logDiv.scrollHeight;
}

function downloadTranscriptJSON(channelUsername, videoId, transcript) {
  const data = {
    channel_username: channelUsername,
    video_id: videoId,
    transcript: transcript
  };
  
  const jsonString = JSON.stringify(data, null, 2);
  const filename = `${videoId}_transcript.json`;
  
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  
  URL.revokeObjectURL(url);
}

function showStatus(message, type, elementId) {
  const status = document.getElementById(elementId);
  status.textContent = message;
  status.className = type;
  status.style.display = 'block';
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
