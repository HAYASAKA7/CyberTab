// Suggestion management module

export class SuggestionManager {
  constructor() {
    this.debounceTimer = null;
    this.callbacks = null;
  }

  setCallbacks(callbacks) {
    this.callbacks = callbacks;
    // Create debounced version after callbacks are set
    this.debouncedRemoteSuggestions = this.debounce(
      (query) => this.updateSuggestionsFromRemote(query, this.callbacks?.onPerformSearch),
      180
    );
  }

  debounce(fn, wait) {
    return (...args) => {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  async fetchThirdPartySuggestions(query) {
    if (!query || !query.trim()) return [];
    const q = encodeURIComponent(query.trim());
    
    try {
      // 1. DuckDuckGo
      try {
        const url = `https://ac.duckduckgo.com/ac/?q=${q}&type=list`;
        const resp = await new Promise(resolve => {
          chrome.runtime.sendMessage({ type: 'fetchSuggestions', url }, resolve);
        });

        if (resp && resp.ok && resp.data) {
          let data = resp.data;
          if (typeof data === 'string') {
            try {
              data = JSON.parse(data);
            } catch (e) {
              data = data.split('\n').filter(Boolean);
            }
          }
          
          if (Array.isArray(data)) {
            let suggestions = [];
            
            if (data.length >= 2 && Array.isArray(data[1])) {
              suggestions = data[1];
            } else {
              suggestions = data;
            }
            
            const filtered = suggestions
              .map(item => {
                if (typeof item === 'string') {
                  return item.trim();
                } else if (item && typeof item === 'object') {
                  return (item.phrase || item.value || item.text || "").trim();
                }
                return "";
              })
              .filter(s => s && s.length > 0 && s !== query);
            
            if (filtered.length > 0) {
              return filtered.slice(0, 8);
            }
          }
        }
      } catch (e) {
        console.debug("DuckDuckGo suggestions failed:", e);
      }

      // 2. Google Suggest
      try {
        const url = `https://suggestqueries.google.com/complete/search?client=chrome&q=${q}`;
        const resp = await new Promise(resolve => {
          chrome.runtime.sendMessage({ type: 'fetchSuggestions', url }, resolve);
        });

        if (resp && resp.ok && resp.data) {
          let data = resp.data;
          if (typeof data === 'string') {
            try {
              data = JSON.parse(data);
            } catch (e) {
              return [];
            }
          }
          
          if (Array.isArray(data) && data.length >= 2 && Array.isArray(data[1])) {
            const suggestions = data[1]
              .map(s => (typeof s === 'string' ? s.trim() : ""))
              .filter(s => s && s !== query);
            
            return suggestions.slice(0, 8);
          }
        }
      } catch (e) {
        console.debug("Google suggestions failed:", e);
      }

      // 3. Bing Suggestions
      try {
        const url = `https://api.bing.com/qsonhs.aspx?q=${q}`;
        const resp = await new Promise(resolve => {
          chrome.runtime.sendMessage({ type: 'fetchSuggestions', url }, resolve);
        });

        if (resp && resp.ok && resp.data) {
          let data = resp.data;
          if (typeof data === 'string') {
            try {
              data = JSON.parse(data);
            } catch (e) {
              return [];
            }
          }
          
          if (data && data.AS && data.AS.Results && Array.isArray(data.AS.Results)) {
            const suggestions = data.AS.Results
              .map(item => (item.Txt || "").trim())
              .filter(s => s && s !== query);
            
            if (suggestions.length > 0) {
              return suggestions.slice(0, 8);
            }
          }
        }
      } catch (e) {
        console.debug("Bing suggestions failed:", e);
      }

      return [];
    } catch (e) {
      console.debug("fetchThirdPartySuggestions error:", e);
      return [];
    }
  }

  async updateSuggestionsFromRemote(query, onPerformSearch) {
    const box = document.getElementById("suggestions");
    if (!box) return;
    const q = (query || "").trim();
    if (!q) {
      box.style.display = "none";
      box.setAttribute("aria-hidden", "true");
      return;
    }

    const results = await this.fetchThirdPartySuggestions(q);
    if (!results || results.length === 0) {
      box.style.display = "none";
      box.setAttribute("aria-hidden", "true");
      return;
    }

    box.innerHTML = "";
    results.forEach((s, idx) => {
      const div = document.createElement("div");
      div.className = "suggestion-item";
      div.setAttribute("role", "option");
      div.dataset.index = idx;
      div.innerHTML = `<span class="suggest-text">${this.escapeHtml(s)}</span>`;
      div.addEventListener("click", () => {
        const input = document.getElementById("searchInput");
        if (input) input.value = s;
        box.style.display = "none";
        box.setAttribute("aria-hidden", "true");
        if (onPerformSearch) onPerformSearch(s);
      });
      box.appendChild(div);
    });
    box.style.display = "block";
    box.setAttribute("aria-hidden", "false");
    box.dataset.activeIndex = "-1";
  }

  moveSuggestion(delta) {
    const box = document.getElementById("suggestions");
    if (!box || box.style.display === "none") return;
    const itemsEls = Array.from(box.querySelectorAll(".suggestion-item"));
    if (!itemsEls.length) return;
    let idx = parseInt(box.dataset.activeIndex || "-1", 10);
    idx = Math.max(-1, Math.min(itemsEls.length - 1, idx + delta));
    itemsEls.forEach(el => el.classList.remove("active"));
    if (idx >= 0) {
      itemsEls[idx].classList.add("active");
      itemsEls[idx].scrollIntoView({ block: "nearest" });
      box.dataset.activeIndex = String(idx);
      const input = document.getElementById("searchInput");
      if (input) input.value = itemsEls[idx].querySelector('.suggest-text').textContent;
    } else {
      box.dataset.activeIndex = "-1";
    }
  }

  acceptActiveSuggestion() {
    const box = document.getElementById("suggestions");
    if (!box || box.style.display === "none") return false;
    const idx = parseInt(box.dataset.activeIndex || "-1", 10);
    const itemsEls = Array.from(box.querySelectorAll(".suggestion-item"));
    if (idx >= 0 && itemsEls[idx]) {
      itemsEls[idx].click();
      return true;
    }
    return false;
  }

  escapeHtml(s) { 
    return (s || "").toString().replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c])); 
  }
}