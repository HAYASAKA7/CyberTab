// Background proxy for cross-origin suggestion requests.
// Listens for messages from the page and performs the fetch (host_permissions required in manifest).

// Track failed instances with cooldown + response cache
const instanceCooldowns = {};
const instanceCache = {}; // Cache for successful responses
const COOLDOWN_MS = 3000; // 3 seconds
const CACHE_TTL = 300000; // 5 minutes cache validity

function isInstanceOnCooldown(url) {
  const instance = new URL(url).hostname;
  if (!instanceCooldowns[instance]) return false;
  
  const now = Date.now();
  if (now - instanceCooldowns[instance] > COOLDOWN_MS) {
    delete instanceCooldowns[instance];
    return false;
  }
  return true;
}

function markInstanceFailed(url) {
  const instance = new URL(url).hostname;
  instanceCooldowns[instance] = Date.now();
}

function getCachedResponse(url) {
  const cached = instanceCache[url];
  if (!cached) return null;
  
  const now = Date.now();
  if (now - cached.time > CACHE_TTL) {
    delete instanceCache[url];
    return null;
  }
  return cached.data;
}

function setCachedResponse(url, data) {
  instanceCache[url] = {
    data: data,
    time: Date.now()
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'fetchSuggestions' || !message.url) {
    sendResponse({ ok: false });
    return;
  }

  const cached = getCachedResponse(message.url);
  if (cached) {
    console.log(`[${message.url}] Using cached response`);
    sendResponse({ ok: true, data: cached, fromCache: true });
    return;
  }

  if (isInstanceOnCooldown(message.url)) {
    if (cached) {
      sendResponse({ ok: true, data: cached, fromCache: true });
      return;
    }
    sendResponse({ ok: false, error: 'Instance on cooldown' });
    return;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 增加到 15s

  fetch(message.url, { 
    method: 'GET', 
    cache: 'no-store',
    signal: controller.signal,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
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
        markInstanceFailed(message.url);
        const cached = getCachedResponse(message.url);
        if (cached) {
          sendResponse({ ok: true, data: cached, fromCache: true });
        } else {
          sendResponse({ ok: false, status: resp.status });
        }
        return;
      }

      let data;
      
      try {
        data = await resp.text();
        console.log(`[${message.url}] Response length: ${data.length}`);
        
        if (!data || data.trim().length === 0) {
          markInstanceFailed(message.url);
          const cached = getCachedResponse(message.url);
          if (cached) {
            console.log(`[${message.url}] Got empty response, using cached data`);
            sendResponse({ ok: true, data: cached, fromCache: true });
          } else {
            sendResponse({ ok: false, error: 'Empty response body and no cache' });
          }
          return;
        }
        
        // Cache the successful response
        setCachedResponse(message.url, data);
        sendResponse({ ok: true, data });
      } catch (parseError) {
        console.error('Parse error:', parseError);
        markInstanceFailed(message.url);
        const cached = getCachedResponse(message.url);
        sendResponse({ 
          ok: cached ? true : false, 
          data: cached || undefined,
          fromCache: !!cached,
          error: cached ? undefined : parseError.message 
        });
      }
    })
    .catch(err => {
      clearTimeout(timeoutId);
      console.error('Fetch error:', err);
      markInstanceFailed(message.url);
      const cached = getCachedResponse(message.url);
      sendResponse({ 
        ok: cached ? true : false, 
        data: cached || undefined,
        fromCache: !!cached,
        error: cached ? undefined : err.message 
      });
    });

  return true;
});