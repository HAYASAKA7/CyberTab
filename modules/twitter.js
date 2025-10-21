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
    listEl.innerHTML = this.storageManager.quickLinks.map(link => `
      <div class="quick-link-item" data-link-id="${link.id}">
        <span class="quick-link-item-url" title="https://x.com/${this.escapeHtml(link.username)}">${this.escapeHtml(link.handle)}</span>
        <span class="quick-link-item-delete" data-action="delete" data-i18n-title="deleteButtonTitle" title="${deleteTitle}">🗑️</span>
      </div>
    `).join("");
    
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
        const aTime = (a.tweets && a.tweets.length) ? a.tweets[0].time : 0;
        const bTime = (b.tweets && b.tweets.length) ? b.tweets[0].time : 0;
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
  }

  createTwitterCardHTML(link) {
    const isLoading = link.loading ? 'true' : 'false';
    const refreshTitle = this.i18nManager.getMessage("refreshButtonTitle") || "Refresh";
    
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
            ${link.avatar ? `<img src="${this.escapeHtml(link.avatar)}" class="twitter-avatar" alt="${this.escapeHtml(link.username)}" data-avatar-img>` : '<div class="twitter-avatar"></div>'}
            <div class="twitter-user-info">
              <div class="twitter-username">${this.escapeHtml(link.displayName || link.username)}</div>
              <div class="twitter-handle">${this.escapeHtml(link.handle)}</div>
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
    
    document.getElementById("tweetDetailDisplayName").textContent = link.displayName || link.username;
    document.getElementById("tweetDetailHandle").textContent = link.handle;
    
    document.getElementById("tweetDetailText").textContent = tweetText;
    document.getElementById("tweetDetailTime").textContent = tweetTime;
    
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
          for (let j = 0; j < Math.min(5, tweetElements.length); j++) {
            const tweetEl = tweetElements[j];
            
            const contentEl = tweetEl.querySelector('div.tweet-content');
            let text = contentEl ? contentEl.textContent.trim() : '';

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
                const dateStr = title.replace(' UTC', '').replace('·', '').trim();
                const parsedTime = new Date(dateStr).getTime();
                if (!isNaN(parsedTime) && parsedTime > 0) {
                  time = parsedTime;
                }
              }
            }
            
            if (text && text.length > 0) {
              tweets.push({
                text: text.slice(0, 300),
                url: url,
                time: time
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
      this.storageManager.quickLinks.forEach(link => {
        if (link.lastUpdate && Date.now() - link.lastUpdate > 300000) {
          if (fetchCallback) fetchCallback(link.id);
        }
      });
    }, 60000);
  }

  escapeHtml(s) { 
    return (s || "").toString().replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c])); 
  }
}