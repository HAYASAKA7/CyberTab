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
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/119.0',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Referer': 'https://nitter.net/',
      'Upgrade-Insecure-Requests': '1'
    },
    redirect: 'follow',
    credentials: 'omit'
  })
    .then(async resp => {
      clearTimeout(timeoutId);
      console.log(`[${message.url}] Status: ${resp.status}, Content-Length: ${resp.headers.get('content-length')}`);

      if (!resp.ok) {
        sendResponse({ ok: false, status: resp.status });
        return;
      }

      let data;
      
      try {
        data = await resp.text();
        console.log(`[${message.url}] Response length: ${data.length}`);
        
        if (!data || data.trim().length === 0) {
          sendResponse({ ok: false, error: 'Empty response body' });
          return;
        }
        
        sendResponse({ ok: true, data });
      } catch (parseError) {
        console.error('Parse error:', parseError);
        sendResponse({ ok: false, error: parseError.message });
      }
    })
    .catch(err => {
      console.error('Fetch error:', err);
      sendResponse({ ok: false, error: err.message });
    });

  return true;
});