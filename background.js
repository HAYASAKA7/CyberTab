// Background proxy for cross-origin suggestion requests.
// Listens for messages from the page and performs the fetch (host_permissions required in manifest).
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'fetchSuggestions' || !message.url) {
    sendResponse({ ok: false });
    return;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  fetch(message.url, { 
    method: 'GET', 
    cache: 'no-store',
    signal: controller.signal,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/rss+xml, application/xml, text/xml, application/json, text/html, */*'
    },
    redirect: 'follow'
  })
    .then(async resp => {
      clearTimeout(timeoutId);

      if (resp.redirected && message.url.includes('nitter')) {
        const finalUrl = resp.url;
        if (!finalUrl.includes('nitter') && !finalUrl.includes('/rss')) {
          sendResponse({ ok: false, error: `Redirected to unexpected URL: ${finalUrl}` });
          return;
        }
      }

      if (!resp.ok) {
        sendResponse({ ok: false });
        return;
      }
      const contentType = resp.headers.get('content-type') || '';
      let data;
      
      try {
        if (contentType.includes('application/json')) {
          data = await resp.json();
        } else {
          data = await resp.text();
        }
        sendResponse({ ok: true, data });
      } catch (parseError) {
        const fallbackData = await resp.text();
        sendResponse({ ok: true, data: fallbackData });
      }
    })
    .catch(err => {
      console.error('Fetch error:', err);
      sendResponse({ ok: false, error: err.message });
    });

  // Keep the message channel open for async response
  return true;
});