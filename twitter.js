// Twitter/X management module

export class TwitterManager {
  constructor(storageManager, i18nManager) {
    this.storageManager = storageManager;
    this.i18nManager = i18nManager;
    this.autoRefreshInterval = null;
  }

  addQuickLink(input) {
    if (!input || !input.trim()) return false;
    
    let username = input.trim();
    
    if (username.startsWith('@')) {
      username = username.slice(1);
    }
    
    const urlMatch = username.match(/(?:x\.com|twitter\.com)\/([^\/\?]+)/i);
    if (urlMatch) {
      username = urlMatch[1];
    }
    
    username = username.replace(/[^a-zA-Z0-9_]/g, '');
    
    if (!username) return false;
    
    if (this.storageManager.quickLinks.some(link => 
      link.username.toLowerCase() === username.toLowerCase()
    )) {
      return false;
    }
    
    const newLink = {
      id: this.storageManager.uid(),
      username: username,
      handle: `@${username}`,
      avatar: '',
      tweets: [],
      lastUpdate: null,
      addedAt: Date.now()
    };
    
    this.storageManager.quickLinks.push(newLink);
    this.storageManager.saveQuickLinks();
    this.renderQuickLinks();
    this.renderTwitterCards();
    
    this.fetchTwitterAccount(newLink.id);
    
    return true;
  }

  deleteQuickLink(id) {
    this.storageManager.quickLinks = this.storageManager.quickLinks.filter(link => link.id !== id);
    this.storageManager.saveQuickLinks();
    this.renderQuickLinks();
  }

  renderQuickLinks() {
    const listEl = document.getElementById("quickLinksList");
    if (!listEl) return;

    const emptyText = this.i18nManager.getMessage("twitterAccountsEmpty") || "No Twitter accounts yet";
    listEl.setAttribute("data-empty-text", emptyText);
    
    if (this.storageManager.quickLinks.length === 0) {
      listEl.innerHTML = "";
      return;
    }
    
    const deleteTitle = this.i18nManager.getMessage("deleteButtonTitle") || "Delete";
    listEl.innerHTML = this.storageManager.quickLinks.map(link => {
      const safeUsername = (link.username || '').replace(/[<>"']/g, '');
      const safeHandle = (link.handle || '').replace(/[<>"']/g, '');
      return `
        <div class="quick-link-item" data-link-id="${link.id}">
          <span class="quick-link-item-url" title="https://x.com/${safeUsername}">${safeHandle}</span>
          <span class="quick-link-item-delete" data-action="delete" data-i18n-title="deleteButtonTitle" title="${deleteTitle}">🗑️</span>
        </div>
      `;
    }).join("");
    
    listEl.querySelectorAll(".quick-link-item").forEach(el => {
      const linkId = el.dataset.linkId;
      
      el.addEventListener("click", (e) => {
        if (e.target.dataset.action === "delete") return;
        const link = this.storageManager.quickLinks.find(l => l.id === linkId);
        if (link) {
          window.open(`https://x.com/${link.username}`, '_blank');
        }
      });
      
      const deleteBtn = el.querySelector("[data-action='delete']");
      if (deleteBtn) {
        deleteBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.deleteQuickLink(linkId);
          this.renderTwitterCards();
        });
      }
    });
  }

  renderTwitterCards() {
    const container = document.getElementById("twitterCardsContainer");
    if (!container) return;

    container.querySelectorAll('[data-avatar-img]').forEach(img => {
      img.addEventListener('error', () => {
        img.style.display = 'none';
      });
    });
    
    const defaultCard = container.querySelector('.default-card');

    const sortedLinks = this.storageManager.quickLinks.slice().sort((a, b) => {
        const getLatestTweetTime = (tweets) => {
          return tweets
            .filter(tweet => !tweet.isPinned) // Ignore pinned tweets for sorting
            .reduce((latest, tweet) => Math.max(latest, tweet.time), 0);
        };

    const aTime = a.tweets && a.tweets.length ? getLatestTweetTime(a.tweets) : 0;
    const bTime = b.tweets && b.tweets.length ? getLatestTweetTime(b.tweets) : 0;

    return bTime - aTime;
    });
    
    if (sortedLinks.length === 0) {
      container.innerHTML = '';
      if (defaultCard) {
        container.appendChild(defaultCard);
      } else {
        container.innerHTML = `
          <div class="right-sidebar-card default-card">
            <div class="right-sidebar-placeholder">
              <span class="placeholder-icon">✨</span>
            </div>
          </div>
        `;
      }
      return;
    }
    
    container.innerHTML = sortedLinks.map(link => this.createTwitterCardHTML(link)).join('');
    
    container.querySelectorAll('.twitter-refresh-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.classList.contains('loading')) return;
        const accountId = btn.dataset.accountId;
        this.fetchTwitterAccount(accountId);
      });
    });
    
    container.querySelectorAll('.twitter-tweet').forEach(tweet => {
      tweet.addEventListener('click', () => {
        const tweetUrl = tweet.dataset.url;
        const tweetText = tweet.querySelector('.twitter-tweet-text').textContent;
        const tweetTime = tweet.querySelector('.twitter-tweet-time').textContent;
        
        const accountId = tweet.closest('.right-sidebar-card').dataset.accountId;
        const link = this.storageManager.quickLinks.find(l => l.id === accountId);
        
        if (link) {
          this.showTweetDetailModal(link, tweetText, tweetTime, tweetUrl);
        }
      });
    });

    // Add click handlers to open profile on avatar, username, and handle
    container.querySelectorAll('.right-sidebar-card').forEach(card => {
      const accountId = card.dataset.accountId;
      const link = this.storageManager.quickLinks.find(l => l.id === accountId);
      if (!link) return;
      const url = `https://x.com/${link.username}`;

      // Avatar
      const avatar = card.querySelector('.twitter-avatar');
      if (avatar) {
        avatar.style.cursor = "pointer";
        avatar.onclick = e => {
          e.stopPropagation();
          window.open(url, '_blank');
        };
      }
      // Username
      const username = card.querySelector('.twitter-username');
      if (username) {
        username.style.cursor = "pointer";
        username.onclick = e => {
          e.stopPropagation();
          window.open(url, '_blank');
        };
      }
      // Handle
      const handle = card.querySelector('.twitter-handle');
      if (handle) {
        handle.style.cursor = "pointer";
        handle.onclick = e => {
          e.stopPropagation();
          window.open(url, '_blank');
        };
      }
    });
  }

  createTwitterCardHTML(link) {
    const isLoading = link.loading ? 'true' : 'false';
    const refreshTitle = this.i18nManager.getMessage("refreshButtonTitle") || "Refresh";
    
    const safeUsername = (link.username || '').replace(/[<>"']/g, '');
    const safeDisplayName = (link.displayName || link.username || '').replace(/[<>"']/g, '');
    const safeHandle = (link.handle || '').replace(/[<>"']/g, '');
    
    let contentHTML = '';
    if (link.error) {
      contentHTML = `<div class="twitter-card-error">${this.escapeHtml(link.error)}</div>`;
    } else if (link.tweets && link.tweets.length > 0) {
      contentHTML = `
        <div class="twitter-tweets">
          ${link.tweets.map(tweet => `
            <div class="twitter-tweet" data-url="${this.escapeHtml(tweet.url)}">
              <div class="twitter-tweet-text">${this.escapeHtml(tweet.text)}</div>
              <div class="twitter-tweet-time">${this.formatTwitterTime(tweet.time)}</div>
            </div>
          `).join('')}
        </div>
      `;
    } else {
      contentHTML = '<div class="twitter-card-loading">No tweets yet</div>';
    }
    
    return `
      <div class="right-sidebar-card" data-account-id="${link.id}">
        <div class="twitter-card">
          <div class="twitter-card-header">
            ${link.avatar ? `<img src="${this.escapeHtml(link.avatar)}" class="twitter-avatar" alt="${safeUsername}" data-avatar-img>` : '<div class="twitter-avatar"></div>'}
            <div class="twitter-user-info">
              <div class="twitter-username">${safeDisplayName}</div>
              <div class="twitter-handle">${safeHandle}</div>
            </div>
            <button class="twitter-refresh-btn ${isLoading === 'true' ? 'loading' : ''}" data-account-id="${link.id}" data-i18n-title="refreshButtonTitle" title="${refreshTitle}" ${isLoading === 'true' ? 'disabled' : ''}>
              🔄
            </button>
          </div>
          ${contentHTML}
        </div>
      </div>
    `;
  }

  showTweetDetailModal(link, tweetText, tweetTime, tweetUrl) {
    const modal = document.getElementById("tweetDetailModal");
    const rightSidebar = document.getElementById("rightSidebar");
    const url = `https://x.com/${link.username}`;

    if (rightSidebar) {
      rightSidebar.classList.add("disabled");
      rightSidebar.dataset.lockOpen = "true";
    }
    
    const avatarImg = document.getElementById("tweetDetailAvatar");
    if (link.avatar) {
      avatarImg.src = link.avatar;
      avatarImg.style.display = 'block';
    } else {
      avatarImg.style.display = 'none';
    }
    if (avatarImg) {
      avatarImg.style.cursor = "pointer";
      avatarImg.onclick = e => {
        e.stopPropagation();
        window.open(url, '_blank');
      };
    }
    
    const safeDisplayName = (link.displayName || link.username || '').replace(/[<>"']/g, '');
    const safeHandle = (link.handle || '').replace(/[<>"']/g, '');
    
    document.getElementById("tweetDetailDisplayName").textContent = safeDisplayName;
    document.getElementById("tweetDetailHandle").textContent = safeHandle;

    const displayNameEl = document.getElementById("tweetDetailDisplayName");
    const handleEl = document.getElementById("tweetDetailHandle");

    if (displayNameEl) {
      displayNameEl.style.cursor = "pointer";
      displayNameEl.onclick = e => {
        e.stopPropagation();
        window.open(url, '_blank');
      };
    }

    if (handleEl) {
      handleEl.style.cursor = "pointer";
      handleEl.onclick = e => {
        e.stopPropagation();
        window.open(url, '_blank');
      };
    }
    
    let tweetObj = null;
    // for (const t of link.tweets) {
    //     if (t.text === tweetText && this.formatTwitterTime(t.time) === tweetTime) {
    //     tweetObj = t;
    //     break;
    //     }
    // }
    if (tweetUrl) {
      tweetObj = link.tweets.find(t => t.url === tweetUrl);
    }
    if (!tweetObj) {
      tweetObj = link.tweets.find(
        t => t.text === tweetText && this.formatTwitterTime(t.time) === tweetTime
      );
    }

    // Text rendering
    const textEl = document.getElementById("tweetDetailText");
    
    // Clean media and retweet content
    let nextEl = textEl.nextSibling;
    while (nextEl) {
        if (
        nextEl.classList &&
        (nextEl.classList.contains("tweet-detail-media") ||
        nextEl.classList.contains("tweet-detail-video") ||
        nextEl.classList.contains("tweet-detail-retweet"))
        ) {
        const toRemove = nextEl;
        nextEl = nextEl.nextSibling;
        toRemove.remove();
        } else {
        nextEl = nextEl.nextSibling;
        }
    }

    // Linkify links in tweet text
    let displayText = this.escapeHtml(tweetText);

    if (tweetObj && tweetObj.links && tweetObj.links.length > 0) {
      const nonMediaLinks = tweetObj.links.filter(l => {
        const href = l.href || '';
        const text = l.text || '';
        
        if (text.startsWith('pic.twitter.com') || 
            text.startsWith('pic.x.com') ||
            href.includes('pic.twitter.com') || 
            href.includes('pic.x.com')) {
          return false;
        }
        
        if (href.includes('/video/') || 
            href.includes('/photo/') ||
            href.includes('/pic/')) {
          return false;
        }
        
        if (href.includes('t.co') && text.startsWith('pic.')) {
          return false;
        }
        
        return true;
      });

      nonMediaLinks.forEach(l => {
        const escapedText = this.escapeHtml(l.text);
        let actualHref = this.restoreOriginalUrl(l.href);
        
        // Fix hashtag links from Nitter
        if (actualHref.includes('chrome-extension://') && actualHref.includes('search?q=%23')) {
          const hashtagMatch = actualHref.match(/search\?q=%23(.+?)(?:&|$)/);
          if (hashtagMatch) {
            const tag = decodeURIComponent(hashtagMatch[1]);
            actualHref = `https://x.com/hashtag/${encodeURIComponent(tag)}?src=hashtag_click`;
          }
        } else {
          actualHref = this.restoreOriginalUrl(actualHref);
        }
        const escapedHref = actualHref.replace(/"/g, '&quot;');

        // Replace the link text with clickable version (keeping original display text)
        const linkPattern = escapedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        displayText = displayText.replace(
          new RegExp(linkPattern, 'g'),
          `<a href="${escapedHref}" target="_blank" rel="noopener noreferrer">${escapedText}</a>`
        );
      });
    }

    displayText = this.linkifyText(displayText, false);

    textEl.innerHTML = displayText;

    // Media rendering
    let mediaHtml = "";
    if (tweetObj && tweetObj.media && tweetObj.media.length > 0) {
      let skipFirst = tweetObj.videoUrl && tweetObj.videoPoster && tweetObj.media[0] === tweetObj.videoPoster;
      mediaHtml += `<div class="tweet-detail-media">`;
      tweetObj.media.forEach(src => {
        if (src.match(/\.(mp4|webm)$/i)) {
          mediaHtml += `<video src="${src}" controls style="max-width:100%;border-radius:10px;margin:8px 0;"></video>`;
        } else {
          mediaHtml += `<img src="${src}" class="tweet-media-img" style="max-width:100%;border-radius:10px;margin:8px 0;cursor:pointer;" />`;
        }
      });
      mediaHtml += `</div>`;
    }

    // Render video if available
    if (tweetObj && tweetObj.videoUrl) {
      mediaHtml += `
        <div class="tweet-detail-video">
          <video src="${tweetObj.videoUrl}" controls poster="${tweetObj.videoPoster || ''}" style="max-width:100%;border-radius:10px;margin:8px 0;"></video>
        </div>
      `;
    }

    // Retweets rendering
    let retweetHtml = "";
    if (tweetObj && tweetObj.isRetweet) {
      const retweetFrom = this.i18nManager.getMessage("retweetFrom") || "Retweet from";
      const originalUrl = this.restoreOriginalUrl(tweetObj.url);
      retweetHtml += `<div class="tweet-detail-retweet" data-url="${this.escapeHtml(originalUrl)}" style="margin:12px 0;padding:10px 14px;background:rgba(0,240,255,0.06);border-radius:8px;cursor:pointer;">
      <div style="font-size:13px;color:#00f0ff;font-weight:600;">${retweetFrom} ${tweetObj.retweetUser}</div>
      <div style="font-size:14px;color:#bff7ff;margin-top:4px;">${this.escapeHtml(tweetObj.retweetText)}</div>`;
      if (tweetObj.retweetMedia && tweetObj.retweetMedia.length > 0) {
      retweetHtml += `<div class="tweet-detail-media">`;
      tweetObj.retweetMedia.forEach(src => {
          if (src.match(/\.(mp4|webm)$/i)) {
          retweetHtml += `<video src="${src}" controls style="max-width:100%;border-radius:10px;margin:8px 0;"></video>`;
          } else {
          retweetHtml += `<img src="${src}" class="tweet-media-img" style="max-width:100%;border-radius:10px;margin:8px 0;cursor:pointer;" />`;
          }
      });
      retweetHtml += `</div>`;
      }
      retweetHtml += `</div>`;
    }

    textEl.insertAdjacentHTML("afterend", mediaHtml + retweetHtml);

    // Add click event to all images for enlargement
    const allImages = textEl.parentElement.querySelectorAll('.tweet-media-img');
    allImages.forEach(img => {
      img.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showImageLightbox(img.src);
      });
    });

    const retweetDiv = textEl.parentElement.querySelector('.tweet-detail-retweet');
    if (retweetDiv && tweetObj && tweetObj.url) {
      retweetDiv.addEventListener('click', (e) => {
        if (e.target.tagName.toLowerCase() === 'a') return;
        if (e.target.classList.contains('tweet-media-img')) return;
        window.open(retweetDiv.dataset.url, '_blank');
      });
    }
    
    document.getElementById("tweetDetailTime").textContent = tweetTime;
    
    const tweetDetailTimeEl = document.getElementById("tweetDetailTime");

    const oldStats = tweetDetailTimeEl.parentElement.querySelectorAll('.tweet-detail-stats');
    oldStats.forEach(el => el.remove());

    let statsHtml = "";
    if (tweetObj) {
      statsHtml = `
        <div class="tweet-detail-stats" style="display:flex;gap:24px;margin:8px 0 0 0;align-items:center;">
          <span title="Comments" style="display:flex;align-items:center;gap:4px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style="vertical-align:middle;"><path d="M12 3C6.48 3 2 6.58 2 11c0 1.85.81 3.55 2.19 4.9-.13.98-.56 2.09-1.53 3.1-.2.21-.25.52-.13.78.12.26.39.41.67.36 2.19-.37 3.77-1.19 4.74-1.8C9.7 18.97 10.83 19 12 19c5.52 0 10-3.58 10-8s-4.48-8-10-8z" fill="#9ff0ff"/></svg>
            <span>${tweetObj.comments || 0}</span>
          </span>
          <span title="Retweets" style="display:flex;align-items:center;gap:4px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style="vertical-align:middle;"><path d="M23 7l-7-7v4H6c-2.76 0-5 2.24-5 5v5h2V9c0-1.65 1.35-3 3-3h10v4l7-7zM1 17l7 7v-4h10c2.76 0 5-2.24 5-5v-5h-2v5c0 1.65-1.35 3-3 3H8v-4l-7 7z" fill="#00f0ff"/></svg>
            <span>${tweetObj.retweets || 0}</span>
          </span>
          <span title="Likes" style="display:flex;align-items:center;gap:4px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style="vertical-align:middle;"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41 1.01 4.5 2.09C13.09 4.01 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="#ff2d95"/></svg>
            <span>${tweetObj.likes || 0}</span>
          </span>
        </div>
      `;
    } else {
      statsHtml = "";
    }
    tweetDetailTimeEl.insertAdjacentHTML('afterend', statsHtml);

    const openBtn = document.getElementById("tweetDetailOpenBtn");
    openBtn.onclick = () => {
      let xUrl = "";
      
      if (tweetUrl) {
        const statusMatch = tweetUrl.match(/\/status\/(\d+)/);
        if (statusMatch && statusMatch[1]) {
          const statusId = statusMatch[1];
          xUrl = `https://x.com/${link.username}/status/${statusId}`;
        }
      }
      
      if (!xUrl) {
        xUrl = `https://x.com/${link.username}`;
      }
      
      if (xUrl) {
        window.open(xUrl, '_blank');
      }
    };

    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
  }

  showImageLightbox(imageSrc) {
    // Create lightbox overlay
    const lightbox = document.createElement('div');
    lightbox.className = 'image-lightbox';
    lightbox.innerHTML = `
      <div class="lightbox-close" title="Close">✕</div>
      <img src="${imageSrc}" class="lightbox-image" alt="Enlarged image" />
    `;
    
    document.body.appendChild(lightbox);

    // Disable tweet detail modal interaction
    const tweetDetailModal = document.getElementById("tweetDetailModal");
    if (tweetDetailModal) {
      tweetDetailModal.style.pointerEvents = 'none';
    }

    // Close function with animation
    const closeLightbox = () => {
      lightbox.classList.remove('active');
      
      // Re-enable tweet detail modal
      if (tweetDetailModal) {
        tweetDetailModal.style.pointerEvents = '';
      }
      
      setTimeout(() => {
        if (document.body.contains(lightbox)) {
          document.body.removeChild(lightbox);
        }
      }, 300);
    };
    
    // Close on click
    lightbox.addEventListener('click', (e) => {
      if (e.target === lightbox || e.target.classList.contains('lightbox-close')) {
        closeLightbox();
      }
    });
    
    // Close on Escape key
    const closeOnEscape = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        closeLightbox();
        document.removeEventListener('keydown', closeOnEscape);
      }
    };
    document.addEventListener('keydown', closeOnEscape);
    
    // Animate in
    setTimeout(() => lightbox.classList.add('active'), 10);
  }

  restoreOriginalUrl(nitterUrl) {
    if (!nitterUrl) return nitterUrl;
    
    try {
      const url = new URL(nitterUrl);
      
      // Restore YouTube links from piped.video
      if (url.hostname === 'piped.video') {
        return 'https://www.youtube.com' + url.pathname + url.search;
      }
      
      // Restore YouTube links from other Invidious instances
      if (url.hostname.includes('invidious') || url.hostname.includes('yewtu.be')) {
        return 'https://www.youtube.com' + url.pathname + url.search;
      }
      
      // Restore Twitter/X links from nitter instances
      if (url.hostname.includes('nitter')) {
        const pathMatch = url.pathname.match(/^\/([^\/]+)/);
        if (pathMatch) {
          return 'https://x.com' + url.pathname + url.search;
        }
      }
      
      // Return original URL if no mapping found
      return nitterUrl;
    } catch (e) {
      return nitterUrl;
    }
  }

  linkifyText(text, doEscape = true) {
    if (!text) return '';
    const input = doEscape ? this.escapeHtml(text) : text;
    
    // Enhanced regex to match hashtags with full Unicode support
    const tokenRegex = /((?:https?:\/\/|www\.)[^\s<"]+)|(@[a-zA-Z0-9_]{1,20})|(#[\p{L}\p{N}_]+)/gu;

    return input.replace(tokenRegex, (match, url, mention, hash) => {
      // Skip if already inside an anchor tag
      const beforeMatch = input.substring(0, input.indexOf(match));
      const openTags = (beforeMatch.match(/<a\s/gi) || []).length;
      const closeTags = (beforeMatch.match(/<\/a>/gi) || []).length;
      if (openTags > closeTags) return match;
      
      if (url) {
        let href = url;
        if (!/^https?:\/\//i.test(href)) href = 'http://' + href;
        
        // Remove trailing punctuation
        const trailingMatch = href.match(/([.,!?;:]+)$/);
        let trailing = '';
        if (trailingMatch) {
          trailing = trailingMatch[1];
          href = href.slice(0, -trailing.length);
        }

        href = this.restoreOriginalUrl(href);
        
        // Create short display version
        let displayUrl = url;
        try {
          const urlObj = new URL(href);
          let hostname = urlObj.hostname;
          let pathname = urlObj.pathname;
          
          // Replace piped.video with youtube.com in display
          if (hostname === 'piped.video') {
            hostname = 'youtube.com';
          }
          
          displayUrl = hostname + (pathname !== '/' ? pathname.slice(0, 20) + (pathname.length > 20 ? '...' : '') : '');
        } catch (e) {
          // If URL parsing fails, also replace piped.video text
          displayUrl = url.replace(/piped\.video/gi, 'youtube.com');
          displayUrl = displayUrl.slice(0, 30) + (displayUrl.length > 30 ? '...' : '');
        }
        
        return `<a href="${href.replace(/"/g, '&quot;')}" target="_blank" rel="noopener noreferrer">${this.escapeHtml(displayUrl)}</a>${trailing}`;
      } else if (mention) {
        const name = mention.slice(1);
        return `<a href="https://x.com/${encodeURIComponent(name)}" target="_blank" rel="noopener noreferrer">@${this.escapeHtml(name)}</a>`;
      } else if (hash) {
        const tag = hash.slice(1);
        return `<a href="https://x.com/hashtag/${encodeURIComponent(tag)}?src=hashtag_click" target="_blank" rel="noopener noreferrer">#${this.escapeHtml(tag)}</a>`;
      }
      return match;
    });
  }

  async fetchTwitterAccount(accountId) {
    const link = this.storageManager.quickLinks.find(l => l.id === accountId);
    if (!link) return;
    
    link.loading = true;
    link.error = null;
    link.tweets = [];
    link.avatar = ''; 
    link.displayName = link.username;
    this.renderTwitterCards();
    
    try {
      const nitterInstances = ['https://nitter.net'];
      let lastError = null;
      
      for (let i = 0; i < nitterInstances.length; i++) {
        const instance = nitterInstances[i];
        
        try {
          if (i > 0) {
            const delayMs = Math.pow(2, i - 1) * 1000;
            await new Promise(resolve => setTimeout(resolve, delayMs));
          }
          
          const url = `${instance}/${link.username}`;
          
          const response = await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error('Request timeout'));
            }, 15000);
            
            chrome.runtime.sendMessage({ type: 'fetchSuggestions', url }, (response) => {
              clearTimeout(timeout);
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve(response);
              }
            });
          });
          
          if (!response || !response.ok) {
            lastError = `Instance ${instance} failed: ${response?.error || 'unknown error'}`;
            console.debug(lastError);
            continue;
          }
          
          const htmlText = typeof response.data === 'string' ? response.data : '';

          console.log(`[Nitter HTML Response for ${link.username}]`);
          console.log(`URL: ${url}`);
          console.log(`HTML Length: ${htmlText.length} characters`);
          console.log('HTML Content:');
          console.log(htmlText);
          console.log('--- End of HTML Response ---');
          
          if (!htmlText || htmlText.trim().length === 0) {
            lastError = 'Empty response';
            console.debug(`${instance} returned empty response`);
            continue;
          }

          const parser = new DOMParser();
          const htmlDoc = parser.parseFromString(htmlText, 'text/html');
          
          const avatarEl = htmlDoc.querySelector('a.profile-card-avatar img');
          const fullnameEl = htmlDoc.querySelector('a.profile-card-fullname');
          
          if (avatarEl && avatarEl.src) {
            let avatarUrl = avatarEl.src;
            if (avatarUrl.startsWith('/pic/')) {
              avatarUrl = instance + avatarUrl;
            } else if (avatarUrl.startsWith('chrome-extension://')) {
              const match = avatarUrl.match(/\/pic\/(.+)$/);
              if (match) {
                avatarUrl = instance + '/pic/' + match[1];
              }
            } else if (avatarUrl.includes('pbs.twimg.com') || avatarUrl.includes('profile_images')) {
              avatarUrl = instance + '/pic/' + avatarUrl;
            } else if (avatarUrl.startsWith('/')) {
              avatarUrl = instance + avatarUrl;
            } else if (!avatarUrl.startsWith('http')) {
              avatarUrl = instance + '/pic/' + avatarUrl;
            }
            
            link.avatar = avatarUrl;
          }
          
          if (fullnameEl) {
            link.displayName = fullnameEl.textContent.trim();
          } else {
            link.displayName = link.username;
          }

          const tweetElements = htmlDoc.querySelectorAll('div.tweet-body');
          
          if (tweetElements.length === 0) {
            lastError = 'No tweets found';
            continue;
          }
          
          const tweets = [];
          for (let j = 0; j < Math.min(8, tweetElements.length); j++) {
            const tweetEl = tweetElements[j];

            // Retweet check
            let isRetweet = false;
            let retweetUser = "";
            let retweetText = "";
            let retweetMedia = [];

            const retweetEl = tweetEl.querySelector('.retweet-header, .retweet-info');
            if (retweetEl) {
                isRetweet = true;
                const userEl = retweetEl.querySelector('a');
                if (userEl) retweetUser = userEl.textContent.trim();
                const retweetContent = tweetEl.querySelector('.tweet-content');
                if (retweetContent) retweetText = retweetContent.textContent.trim();
                const retweetMediaEls = tweetEl.querySelectorAll('.attachments img, .attachments video');
                retweetMedia = Array.from(retweetMediaEls).map(m => {
                  let src = m.src;
                  if (src.startsWith('chrome-extension://')) {
                    const match = src.match(/\/pic\/(.+)$/);
                    if (match) {
                      src = instance + '/pic/' + match[1];
                    }
                  } else if (src.startsWith('/pic/')) {
                    src = instance + src;
                  }
                  return src;
                });
            }
            
            // Tweet contents
            const contentEl = tweetEl.querySelector('div.tweet-content');
            let text = contentEl ? contentEl.textContent.trim() : '';

            // Links in tweet
            let links = [];
            if (contentEl) {
              contentEl.querySelectorAll('a').forEach(a => {
                links.push({
                  text: a.textContent.trim(),
                  href: a.href
                });
              });
            }

            // Attachments
            const mediaEls = tweetEl.querySelectorAll('.attachments img, .attachments video');
            const media = Array.from(mediaEls).map(m => {
              let src = m.src;
              if (src.startsWith('chrome-extension://')) {
                const match = src.match(/\/pic\/(.+)$/);
                if (match) {
                  src = instance + '/pic/' + match[1];
                }
              } else if (src.startsWith('/pic/')) {
                src = instance + src;
              }
              return src;
            });

            let url = '';
            const linkEl = tweetEl.querySelector('a[href*="/status/"]');
            if (linkEl) {
              const href = linkEl.getAttribute('href');
              url = href ? (instance + href.split('#')[0]) : '';
            }
            
            let time = Date.now();
            const dateEl = tweetEl.querySelector('span.tweet-date a');
            if (dateEl) {
              const title = dateEl.getAttribute('title');
              if (title) {
                let dateStr = title.replace('·', '').replace(/\s+UTC$/, ' UTC').trim();
                let parsedTime = Date.parse(dateStr);
                if (isNaN(parsedTime)) {
                  parsedTime = Date.parse(dateStr.replace(' UTC', 'Z'));
                }
                if (!isNaN(parsedTime) && parsedTime > 0) {
                  time = parsedTime;
                }
              }
            }

            // Extract video URL if available
            let videoUrl = '';
            let videoPoster = '';
            const videoForm = tweetEl.querySelector('.attachments .gallery-video .video-container form[action="/enablehls"]');
            if (videoForm) {
              const posterImg = videoForm.closest('.video-container').querySelector('img');
              if (posterImg && posterImg.src) {
                videoPoster = posterImg.src.startsWith('/pic/')
                  ? instance + posterImg.src
                  : posterImg.src;
              }
              // Post form to /enablehls to get video stream URL
              const formData = new FormData();
              const refererInput = videoForm.querySelector('input[name="referer"]');
              if (refererInput && refererInput.value) {
                formData.append('referer', refererInput.value);

                try {
                  const enableHlsUrl = instance + '/enablehls';
                  const resp = await fetch(enableHlsUrl, {
                    method: 'POST',
                    body: formData,
                    credentials: 'include'
                  });
                  const html = await resp.text();

                  // Parse returned HTML to find video source
                  const tempDoc = new DOMParser().parseFromString(html, 'text/html');
                  const videoTag = tempDoc.querySelector('video source[src]');
                  if (videoTag) {
                    videoUrl = videoTag.getAttribute('src');
                  }
                } catch (err) {
                  console.warn('Failed to fetch video stream:', err);
                }
              }
            }

            const statEls = tweetEl.querySelectorAll('.tweet-stats .tweet-stat');
            let comments = 0, retweets = 0, quotes = 0, likes = 0;
            statEls.forEach(statEl => {
              const icon = statEl.querySelector('.icon-container > span');
              const num = parseInt(statEl.textContent.replace(/[^\d]/g, ''), 10) || 0;
              if (icon && icon.classList.contains('icon-comment')) comments = num;
              if (icon && icon.classList.contains('icon-retweet')) retweets = num;
              if (icon && icon.classList.contains('icon-quote')) quotes = num;
              if (icon && icon.classList.contains('icon-heart')) likes = num;
            });
            
            if (text && text.length > 0) {
              tweets.push({
                text: text.slice(0, 300),
                url: url,
                time: time,
                media,
                isRetweet,
                retweetUser,
                retweetText,
                retweetMedia,
                links,
                videoUrl,
                videoPoster,
                comments,
                retweets,
                quotes,
                likes
              });
            }
          }
          
          if (tweets.length === 0) {
            lastError = 'Could not parse tweets';
            continue;
          }
          
          link.tweets = tweets;
          link.lastUpdate = Date.now();
          link.loading = false;
          link.error = null;
          
          this.storageManager.saveQuickLinks();
          this.renderTwitterCards();
          return;
          
        } catch (e) {
          lastError = e.message || 'Network error';
          console.debug(`Instance ${instance} error:`, lastError);
          continue;
        }
      }
      
      throw new Error(lastError || 'All Nitter instances failed');
      
    } catch (error) {
      console.error('Fetch Twitter account error:', error);
      link.loading = false;
      link.error = error.message || 'Failed to load tweets';
      link.lastUpdate = Date.now();
      link.lastErrorRetry = Date.now();
      this.storageManager.saveQuickLinks();
      this.renderTwitterCards();
    }
  }

  formatTwitterTime(timestamp) {
    if (!timestamp || isNaN(timestamp)) 
      return this.i18nManager.getMessage("unknown") || 'Unknown';

    const now = Date.now();
    const diff = now - timestamp;
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (diff < 0) return this.i18nManager.getMessage("justNow") || 'Just now';
    if (minutes < 1) return this.i18nManager.getMessage("justNow") || 'Just now';
    
    if (minutes < 60) {
      const template = this.i18nManager.getMessage("minutesAgo") || "${minutes}m ago";
      return template.replace("${minutes}", minutes);
    }
    
    if (hours < 24) {
      const template = this.i18nManager.getMessage("hoursAgo") || "${hours}h ago";
      return template.replace("${hours}", hours);
    }
    
    if (days < 7) {
      const template = this.i18nManager.getMessage("daysAgo") || "${days}d ago";
      return template.replace("${days}", days);
    }
    
    return new Date(timestamp).toLocaleDateString();
  }

  setupTwitterAutoRefresh(fetchCallback) {
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
    }
    
    this.autoRefreshInterval = setInterval(() => {
      const now = Date.now();
      const idsToRefresh = this.storageManager.quickLinks
        .filter(link =>
          (link.lastUpdate && now - link.lastUpdate > 300000) ||
          (link.error && (!link.lastErrorRetry || now - link.lastErrorRetry > 30000))
        )
        .map(link => link.id);
      if (idsToRefresh.length && fetchCallback) fetchCallback(idsToRefresh);
    }, 120000);
  }

  escapeHtml(s) { 
    return (s || "").toString().replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c])); 
  }
}