// popup.js
document.addEventListener('DOMContentLoaded', async () => {
    // Get active tab URL to potentially pre-fill the form
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const currentUrl = tabs[0].url;
    
    // Don't pre-fill browser internal pages
    if (!currentUrl.startsWith('moz-extension:') && 
        !currentUrl.startsWith('about:') && 
        !currentUrl.startsWith('chrome:')) {
      const baseUrl = getBaseUrl(currentUrl);
      document.getElementById('url').value = baseUrl;
      
      // Check if current URL is already being tracked
      const response = await browser.runtime.sendMessage({ action: 'getTrackedUrls' });
      const { trackedUrls } = response;
      
      if (trackedUrls[baseUrl]) {
        const urlInfo = trackedUrls[baseUrl];
        const currentUrlInfo = document.getElementById('current-url-info');
        currentUrlInfo.innerHTML = `
          <strong>Current page:</strong> ${baseUrl}<br>
          <strong>Visits today:</strong> ${urlInfo.dailyCount} / ${urlInfo.limit}<br>
          <strong>Status:</strong> ${urlInfo.isBlocked ? '<span style="color: red">Blocked</span>' : '<span style="color: green">Allowed</span>'}
        `;
      } else {
        document.getElementById('current-url-info').innerHTML = '';
      }
    }
    
    // Add URL form handler
    document.getElementById('add-button').addEventListener('click', async () => {
      const url = document.getElementById('url').value.trim();
      const limit = parseInt(document.getElementById('limit').value, 10);
      
      if (!url || !limit || limit < 1) {
        alert('Please enter a valid URL and limit');
        return;
      }
      
      try {
        new URL(url); // Validate URL format
      } catch (e) {
        alert('Please enter a valid URL with protocol (e.g., https://example.com)');
        return;
      }
      
      await browser.runtime.sendMessage({
        action: 'addTrackedUrl',
        data: { url, limit }
      });
      
      // Clear form
      document.getElementById('url').value = '';
      document.getElementById('limit').value = '5';
      
      // Refresh list
      loadTrackedUrls();
    });
    
    // Load initial list
    loadTrackedUrls();
  });
  
  // Helper function to get base URL
  function getBaseUrl(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.origin;
    } catch (e) {
      return url;
    }
  }
  
  // Function to load and display tracked URLs
  async function loadTrackedUrls() {
    const response = await browser.runtime.sendMessage({ action: 'getTrackedUrls' });
    const { trackedUrls } = response;
    const listElement = document.getElementById('tracked-urls-list');
    
    if (Object.keys(trackedUrls).length === 0) {
      listElement.innerHTML = '<div class="no-urls">No URLs being tracked yet</div>';
      return;
    }
    
    listElement.innerHTML = '';
    
    Object.values(trackedUrls).forEach(urlInfo => {
      const urlElement = document.createElement('div');
      urlElement.className = 'tracked-url';
      
      urlElement.innerHTML = `
        <h3>${urlInfo.url}</h3>
        <div class="stats">
          <div>Visits today: ${urlInfo.dailyCount} / ${urlInfo.limit}</div>
          <div>Status: ${urlInfo.isBlocked ? '<span style="color: red">Blocked</span>' : '<span style="color: green">Allowed</span>'}</div>
        </div>
        <div class="actions">
          <button class="reset-button" data-url="${urlInfo.url}">Reset Counter</button>
          <button class="edit-button" data-url="${urlInfo.url}" data-limit="${urlInfo.limit}">Edit Limit</button>
          <button class="remove-button" data-url="${urlInfo.url}">Remove</button>
        </div>
      `;
      
      listElement.appendChild(urlElement);
    });
    
    // Add event listeners to buttons
    document.querySelectorAll('.reset-button').forEach(button => {
      button.addEventListener('click', async () => {
        const url = button.getAttribute('data-url');
        await browser.runtime.sendMessage({
          action: 'resetCounter',
          data: { url }
        });
        loadTrackedUrls();
      });
    });
    
    document.querySelectorAll('.edit-button').forEach(button => {
      button.addEventListener('click', async () => {
        const url = button.getAttribute('data-url');
        const currentLimit = button.getAttribute('data-limit');
        const newLimit = prompt('Enter new daily visit limit:', currentLimit);
        
        if (newLimit && !isNaN(newLimit) && parseInt(newLimit, 10) > 0) {
          await browser.runtime.sendMessage({
            action: 'updateLimit',
            data: { url, limit: parseInt(newLimit, 10) }
          });
          loadTrackedUrls();
        }
      });
    });
    
    document.querySelectorAll('.remove-button').forEach(button => {
      button.addEventListener('click', async () => {
        const url = button.getAttribute('data-url');
        if (confirm(`Are you sure you want to stop tracking ${url}?`)) {
          await browser.runtime.sendMessage({
            action: 'removeTrackedUrl',
            data: { url }
          });
          loadTrackedUrls();
        }
      });
    });
  }