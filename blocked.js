const urlParams = new URLSearchParams(window.location.search);
const site = urlParams.get('site');
const limit = urlParams.get('limit');

// Update page content
document.getElementById('site-name').textContent = site || 'this site';
document.getElementById('limit-number').textContent = limit || 'a certain number of';

// Button event handlers
document.getElementById('settings-btn').addEventListener('click', () => {
  browser.runtime.openOptionsPage();
});

document.getElementById('override-btn').addEventListener('click', () => {
  // Get the original URL from browser history and navigate back to it
  browser.tabs.getCurrent(tab => {
    browser.webNavigation.getFrame({
      tabId: tab.id,
      frameId: 0
    }).then(frameInfo => {
      if (frameInfo && frameInfo.url) {
        window.location.href = site;
      }
    });
  });
});