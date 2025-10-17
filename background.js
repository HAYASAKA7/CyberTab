// Background proxy for cross-origin suggestion requests.
// Listens for messages from the page and performs the fetch (host_permissions required in manifest).
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'fetchSuggestions' || !message.url) return;
  fetch(message.url, { method: 'GET', cache: 'no-store' })
    .then(async resp => {
      if (!resp.ok) {
        sendResponse({ ok: false });
        return;
      }
      const contentType = resp.headers.get('content-type') || '';
      let data;
      if (contentType.includes('application/json')) data = await resp.json();
      else data = await resp.text();
      sendResponse({ ok: true, data });
    })
    .catch(() => sendResponse({ ok: false }));
  // Keep the message channel open for async response
  return true;
});