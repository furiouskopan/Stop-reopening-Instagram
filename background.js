let trackedUrls = {};

// Initialize data from storage
browser.storage.local.get('trackedUrls').then((result) => {
  if (result.trackedUrls) {
    trackedUrls = result.trackedUrls;
  }
});

// Function to reset daily counts at midnight
function resetDailyCounts() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  
  const timeUntilMidnight = tomorrow - now;
  
  setTimeout(() => {
    // Reset counts for all tracked URLs
    Object.keys(trackedUrls).forEach(url => {
      trackedUrls[url].dailyCount = 0;
      trackedUrls[url].isBlocked = false;
    });
    
    // Save to storage
    browser.storage.local.set({ trackedUrls });
    
    // Set up the next reset
    resetDailyCounts();
  }, timeUntilMidnight);
}

// Start the daily reset timer
resetDailyCounts();

// Helper function to extract base URL (without path, query parameters, etc.)
function getBaseUrl(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.origin;
  } catch (e) {
    return url;
  }
}

// Track completed page loads (not iframes, redirects, etc.)
browser.webNavigation.onCompleted.addListener((details) => {
  // Only count main frame loads (not iframes)
  if (details.frameId !== 0) return;
  
  const baseUrl = getBaseUrl(details.url);
  
  if (trackedUrls[baseUrl]) {
    // Check if this is a fresh page load, not a navigation within the same page
    browser.tabs.get(details.tabId).then(tab => {
      // Get previous URL for this tab if we've stored it
      browser.storage.local.get(`tab_${details.tabId}_url`).then(result => {
        const previousUrl = result[`tab_${details.tabId}_url`];
        
        // Only count if this is a fresh visit (not from a subdomain or same domain navigation)
        if (!previousUrl || getBaseUrl(previousUrl) !== baseUrl) {
          // Increment daily count
          trackedUrls[baseUrl].dailyCount += 1;
          
          // Check if we need to block
          if (trackedUrls[baseUrl].dailyCount >= trackedUrls[baseUrl].limit) {
            trackedUrls[baseUrl].isBlocked = true;
          }
          
          // Save updated counts
          browser.storage.local.set({ trackedUrls });
          
          // Show popup notification
          if (trackedUrls[baseUrl].isBlocked) {
            browser.tabs.update(details.tabId, {
              url: `blocked.html?url=${encodeURIComponent(baseUrl)}&count=${trackedUrls[baseUrl].dailyCount}&limit=${trackedUrls[baseUrl].limit}`
            });
          } else {
            browser.tabs.executeScript(details.tabId, {
              code: `
                (function() {
                  // Create popup element if it doesn't exist
                  if (!document.getElementById('page-visit-tracker-popup')) {
                    const popup = document.createElement('div');
                    popup.id = 'page-visit-tracker-popup';
                    popup.style.position = 'fixed';
                    popup.style.top = '20px';
                    popup.style.right = '20px';
                    popup.style.zIndex = '10000';
                    popup.style.backgroundColor = '#f0f0f0';
                    popup.style.border = '1px solid #ccc';
                    popup.style.borderRadius = '5px';
                    popup.style.padding = '15px';
                    popup.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
                    popup.style.fontSize = '14px';
                    popup.style.maxWidth = '300px';
                    
                    const message = document.createElement('p');
                    message.textContent = 'You have visited this page ${trackedUrls[baseUrl].dailyCount} times today. Limit: ${trackedUrls[baseUrl].limit}';
                    message.style.margin = '0 0 10px 0';
                    message.style.color = 'black';
                    
                    const closeButton = document.createElement('button');
                    closeButton.textContent = 'Close';
                    closeButton.style.padding = '5px 10px';
                    closeButton.style.border = 'none';
                    closeButton.style.borderRadius = '3px';
                    closeButton.style.backgroundColor = '#0060df';
                    closeButton.style.color = 'white';
                    closeButton.style.cursor = 'pointer';
                    closeButton.onclick = function() {
                      document.body.removeChild(popup);
                    };
                    
                    popup.appendChild(message);
                    popup.appendChild(closeButton);
                    document.body.appendChild(popup);
                    
                    // Auto-hide after 5 seconds
                    setTimeout(() => {
                      if (document.body.contains(popup)) {
                        document.body.removeChild(popup);
                      }
                    }, 5000);
                  }
                })();
              `
            });
          }
        }
        
        // Store current URL for this tab
        const storageObj = {};
        storageObj[`tab_${details.tabId}_url`] = details.url;
        browser.storage.local.set(storageObj);
      });
    });
  }
});

// Clean up tab URL storage when tab is closed
browser.tabs.onRemoved.addListener((tabId) => {
  const storageKey = `tab_${tabId}_url`;
  browser.storage.local.remove(storageKey);
});

// Block requests to blocked URLs
browser.webRequest.onBeforeRequest.addListener(
  (details) => {
    const baseUrl = getBaseUrl(details.url);
    
    // Only block main frame requests
    if (details.type !== 'main_frame') return { cancel: false };
    
    // Check if URL is tracked and blocked
    if (trackedUrls[baseUrl] && trackedUrls[baseUrl].isBlocked) {
      return {
        redirectUrl: browser.runtime.getURL(`blocked.html?url=${encodeURIComponent(baseUrl)}&count=${trackedUrls[baseUrl].dailyCount}&limit=${trackedUrls[baseUrl].limit}`)
      };
    }
    
    return { cancel: false };
  },
  { urls: ["<all_urls>"] },
  ["blocking"]
);

// Add messaging API for popup communication
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getTrackedUrls') {
    sendResponse({ trackedUrls });
  } 
  else if (message.action === 'addTrackedUrl') {
    const { url, limit } = message.data;
    const baseUrl = getBaseUrl(url);
    
    trackedUrls[baseUrl] = {
      url: baseUrl,
      limit: limit,
      dailyCount: 0,
      isBlocked: false
    };
    
    browser.storage.local.set({ trackedUrls });
    sendResponse({ success: true, trackedUrls });
  } 
  else if (message.action === 'removeTrackedUrl') {
    const { url } = message.data;
    delete trackedUrls[url];
    browser.storage.local.set({ trackedUrls });
    sendResponse({ success: true, trackedUrls });
  }
  else if (message.action === 'resetCounter') {
    const { url } = message.data;
    if (trackedUrls[url]) {
      trackedUrls[url].dailyCount = 0;
      trackedUrls[url].isBlocked = false;
      browser.storage.local.set({ trackedUrls });
      sendResponse({ success: true, trackedUrls });
    } else {
      sendResponse({ success: false, message: 'URL not found' });
    }
  }
  else if (message.action === 'updateLimit') {
    const { url, limit } = message.data;
    if (trackedUrls[url]) {
      trackedUrls[url].limit = limit;
      browser.storage.local.set({ trackedUrls });
      sendResponse({ success: true, trackedUrls });
    } else {
      sendResponse({ success: false, message: 'URL not found' });
    }
  }
});