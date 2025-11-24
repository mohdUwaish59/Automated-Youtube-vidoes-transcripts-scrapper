// Listen for messages from side panel
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extractTranscript') {
    extractTranscriptWithAutoClick().then(result => {
      sendResponse(result);
    });
    return true; // Keep the message channel open for async response
  }
  
  if (request.action === 'extractPlaylistIds') {
    extractPlaylistVideoIds(request.isChannelVideos).then(result => {
      sendResponse(result);
    });
    return true;
  }
  
  return true;
});

async function extractTranscriptWithAutoClick() {
  // Get video metadata first
  const videoTitle = document.querySelector('h1.ytd-watch-metadata yt-formatted-string')?.textContent || 'transcript';
  const urlParams = new URLSearchParams(window.location.search);
  const videoId = urlParams.get('v') || '';
  
  // Get channel username
  let channelUsername = '';
  const channelLink = document.querySelector('ytd-channel-name a') || 
                      document.querySelector('ytd-video-owner-renderer a');
  
  if (channelLink) {
    const href = channelLink.getAttribute('href');
    if (href) {
      const match = href.match(/\/@([^\/]+)|\/c\/([^\/]+)|\/channel\/([^\/]+)/);
      if (match) {
        channelUsername = match[1] || match[2] || match[3] || '';
      }
    }
  }
  
  if (!channelUsername) {
    const channelNameElement = document.querySelector('ytd-channel-name yt-formatted-string a') ||
                                document.querySelector('#channel-name a');
    if (channelNameElement) {
      channelUsername = channelNameElement.textContent?.trim() || '';
    }
  }
  
  // Check if transcript is already loaded
  let segments = document.querySelectorAll('ytd-transcript-segment-renderer');
  
  // If no segments found, try to click the "Show transcript" button
  if (segments.length === 0) {
    const transcriptButton = findTranscriptButton();
    
    if (transcriptButton) {
      // Click the button
      transcriptButton.click();
      
      // Wait for transcript to load (with timeout)
      const maxWaitTime = 5000; // 5 seconds
      const startTime = Date.now();
      
      while (Date.now() - startTime < maxWaitTime) {
        await sleep(300); // Wait 300ms between checks
        segments = document.querySelectorAll('ytd-transcript-segment-renderer');
        
        if (segments.length > 0) {
          break; // Transcript loaded!
        }
      }
      
      if (segments.length === 0) {
        return {
          success: false,
          message: 'Transcript button clicked but transcript did not load. The video may not have a transcript available.',
          videoTitle,
          videoId,
          channelUsername,
          autoClicked: true
        };
      }
    } else {
      return {
        success: false,
        message: 'No transcript found and could not find "Show transcript" button. The video may not have a transcript available.',
        videoTitle,
        videoId,
        channelUsername
      };
    }
  }
  
  // Extract text without timestamps and make it continuous
  let plainText = '';
  
  segments.forEach((segment, index) => {
    const text = segment.querySelector('.segment-text')?.textContent?.trim();
    
    if (text) {
      if (index > 0) {
        plainText += ' ';
      }
      plainText += text;
    }
  });
  
  return {
    success: true,
    transcript: plainText,
    videoTitle,
    videoId,
    channelUsername,
    segmentCount: segments.length,
    autoClicked: segments.length > 0 && !document.querySelector('ytd-transcript-segment-renderer')
  };
}

function findTranscriptButton() {
  // Try multiple selectors to find the "Show transcript" button
  
  // Method 1: Look for button with aria-label="Show transcript"
  let button = document.querySelector('button[aria-label="Show transcript"]');
  if (button) return button;
  
  // Method 2: Look in the video description transcript section
  const transcriptSection = document.querySelector('ytd-video-description-transcript-section-renderer');
  if (transcriptSection) {
    button = transcriptSection.querySelector('button');
    if (button) return button;
  }
  
  // Method 3: Look for button with text "Show transcript"
  const buttons = document.querySelectorAll('button');
  for (const btn of buttons) {
    const text = btn.textContent?.trim().toLowerCase();
    if (text === 'show transcript' || text === 'transcript') {
      return btn;
    }
  }
  
  // Method 4: Look in engagement panels for transcript tab
  const transcriptTab = document.querySelector('[aria-label="Transcript"]');
  if (transcriptTab) return transcriptTab;
  
  return null;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function extractPlaylistVideoIds(isChannelVideos = false) {
  try {
    // Wait a bit for page to fully load
    await sleep(1000);
    
    // Scroll to load all videos in the playlist or channel
    let previousCount = 0;
    let currentCount = 0;
    let scrollAttempts = 0;
    const maxScrollAttempts = 30; // Increased for channels with many videos
    
    // Different selectors for playlist vs channel videos
    const videoSelector = isChannelVideos ? 'ytd-rich-item-renderer' : 'ytd-playlist-video-renderer';
    
    while (scrollAttempts < maxScrollAttempts) {
      // Get current video count
      const videoElements = document.querySelectorAll(videoSelector);
      currentCount = videoElements.length;
      
      if (currentCount > 0 && currentCount === previousCount) {
        // No new videos loaded, we're done
        break;
      }
      
      previousCount = currentCount;
      
      // Scroll to bottom
      window.scrollTo(0, document.documentElement.scrollHeight);
      
      // Wait for new videos to load
      await sleep(1000);
      
      scrollAttempts++;
    }
    
    // Extract video IDs
    const videoIds = [];
    const videoElements = document.querySelectorAll(videoSelector);
    
    videoElements.forEach(element => {
      // Different link selectors for playlist vs channel
      const link = isChannelVideos 
        ? element.querySelector('a#video-title-link') || element.querySelector('a#thumbnail')
        : element.querySelector('a#video-title');
        
      if (link) {
        const href = link.getAttribute('href');
        if (href) {
          const match = href.match(/[?&\/]v=([^&]+)|\/shorts\/([^?&]+)|\/watch\/([^?&]+)/);
          if (match) {
            const videoId = match[1] || match[2] || match[3];
            if (videoId && !videoIds.includes(videoId)) {
              videoIds.push(videoId);
            }
          }
        }
      }
    });
    
    if (videoIds.length === 0) {
      return {
        success: false,
        message: isChannelVideos 
          ? 'No videos found on channel. Make sure the channel has public videos.'
          : 'No videos found in playlist. Make sure the playlist is public and contains videos.'
      };
    }
    
    return {
      success: true,
      videoIds: videoIds,
      count: videoIds.length
    };
  } catch (error) {
    return {
      success: false,
      message: 'Error extracting playlist: ' + error.message
    };
  }
}
