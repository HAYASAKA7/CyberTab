// UI event binding module

export class UIManager {
  constructor(managers) {
    this.managers = managers;
  }

  initialize() {
    this.setupAddModal();
    this.setupResetButton();
    this.setupSearchUI();
    this.setupRightSidebarUI();
    this.setupKeyboardShortcuts();
    this.setupContextMenus();
    this.setupTweetDetailModal();
    this.setupCustomMouseEffects();
  }

  setupAddModal() {
    const addBtn = document.getElementById("addBtn");
    const modal = document.getElementById("modal");
    const favForm = document.getElementById("favForm");
    const cancelBtn = document.getElementById("cancel");
    const favLocalIconBtn = document.getElementById("favLocalIconBtn");
    const favLocalIconInput = document.getElementById("favLocalIcon");
    const favLocalIconName = document.getElementById("favLocalIconName");

    if (addBtn) {
      addBtn.addEventListener("click", () => {
        if (!modal) {
          console.warn("modal element not found");
          return;
        }
        modal.classList.remove("hidden");
        modal.setAttribute("aria-hidden", "false");
        const nameInput = document.getElementById("favName");
        if (nameInput) nameInput.focus();
        this.managers.sidebar.closeLeftSidebar();
      });
    }

    if (cancelBtn) {
      cancelBtn.addEventListener("click", () => {
        if (!modal) return;
        modal.classList.add("hidden");
        modal.setAttribute("aria-hidden", "true");
        favForm.reset();
        if (favLocalIconName) favLocalIconName.textContent = "";
      });
    }

    if (favForm) {
      favForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const name = document.getElementById("favName").value.trim();
        let url = document.getElementById("favURL").value.trim();
        const localIconFile = favLocalIconInput.files[0];
        
        if (!/^https?:\/\//.test(url)) url = "https://" + url;

        if (this.managers.storage.items.some(it => it.url === url)) {
          alert(this.managers.i18n.getMessage("quickLinkDuplicate") || "This link already exists!");
          return;
        }
        
        let finalIcon = "";
        if (localIconFile) {
          finalIcon = await this.managers.icon.readFileAsDataURL(localIconFile);
        } else {
          const favicon = await this.managers.icon.fetchFavicon(url);
          if (favicon) finalIcon = favicon;
        }
        
        let col = 0, row = 0;
        while (this.managers.layout.isPositionOccupied(this.managers.storage.items, col, row)) {
          col++;
          if (col > 10) {
            col = 0;
            row++;
          }
        }
        
        this.managers.storage.items.push({
          id: this.managers.storage.uid(),
          name,
          url,
          col,
          row,
          icon: finalIcon
        });
        this.managers.storage.save();
        this.managers.tile.renderAll();
        this.managers.tile.autoAlignTiles();
        modal.classList.add("hidden");
        modal.setAttribute("aria-hidden", "true");
        favForm.reset();
        if (favLocalIconName) favLocalIconName.textContent = "";
      });
    }
  }

  setupResetButton() {
    const resetBtn = document.getElementById("resetBtn");
    if (resetBtn) {
      resetBtn.addEventListener("click", async () => {
        const confirmMessage = this.managers.i18n.getMessage("resetConfirm") || 
                              "Reset to defaults?";
        if (!confirm(confirmMessage)) return;
        
        this.managers.storage.items = this.managers.storage.getDefaultItems();
        await this.managers.bookmark.loadBookmarks(this.managers.storage.bookmarkSyncCount);
        this.managers.storage.save();
        this.managers.tile.renderAll();
        this.managers.tile.autoAlignTiles();
        this.managers.tile.fetchMissingFavicons();
        this.managers.sidebar.closeLeftSidebar();
      });
    }
  }

  setupSearchUI() {
    const searchForm = document.getElementById("searchForm");
    const searchInput = document.getElementById("searchInput");
    const suggestionsBox = document.getElementById("suggestions");
    const clearBtn = document.getElementById("clearSearch");
    const engineToggle = document.getElementById("engineToggle");

    if (searchInput && clearBtn) {
      const searchFormEl = searchForm || document.querySelector(".search-box");
      
      searchInput.addEventListener("input", (e) => {
        const query = e.target.value;
        if (this.managers.suggestion && this.managers.suggestion.debouncedRemoteSuggestions) {
          this.managers.suggestion.debouncedRemoteSuggestions(query);
        }
      });

      searchInput.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          if (this.managers.suggestion) {
            this.managers.suggestion.moveSuggestion(1);
          }
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          if (this.managers.suggestion) {
            this.managers.suggestion.moveSuggestion(-1);
          }
        } else if (e.key === "Enter") {
          e.preventDefault();
          if (this.managers.suggestion && this.managers.suggestion.acceptActiveSuggestion()) {
          } else {
            searchForm.dispatchEvent(new Event("submit"));
          }
        }
      });

      searchInput.addEventListener("blur", () => {
        setTimeout(() => {
          if (suggestionsBox) {
            suggestionsBox.style.display = "none";
            suggestionsBox.setAttribute("aria-hidden", "true");
          }
        }, 200);
      });
    }

    if (suggestionsBox) {
      suggestionsBox.addEventListener("mousedown", (e) => {
        e.preventDefault(); // Prevent losing focus on input
      });
    }

    if (searchForm) {
      searchForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const q = (searchInput || {}).value || "";
        if (!q.trim()) return;
        this.managers.search.performSearch(q);
        if (searchInput) {
          searchInput.value = "";
          searchInput.blur();
        }
        if (suggestionsBox) {
          suggestionsBox.style.display = "none";
          suggestionsBox.setAttribute("aria-hidden", "true");
        }
      });
    }

    if (engineToggle) {
      engineToggle.addEventListener("click", () => {
        this.managers.search.toggleEngine();
      });
    }
  }

  setupRightSidebarUI() {
    const rightSidebarSettingsBtn = document.getElementById("rightSidebarSettings");
    const rightSidebarSettingsModal = document.getElementById("rightSidebarSettingsModal");
    const rightSidebarSettingsClose = document.getElementById("rightSidebarSettingsClose");
    const addQuickLinkBtn = document.getElementById("addQuickLinkBtn");
    const quickLinkUrlInput = document.getElementById("quickLinkUrl");

    if (rightSidebarSettingsBtn) {
      rightSidebarSettingsBtn.addEventListener("click", () => {
        this.managers.twitter.renderQuickLinks();
        
        rightSidebarSettingsModal.classList.remove("hidden");
        rightSidebarSettingsModal.setAttribute("aria-hidden", "false");

        const rightSidebar = document.getElementById("rightSidebar");
        rightSidebar.classList.add("disabled");
        rightSidebar.dataset.lockOpen = "true";

        if (quickLinkUrlInput) quickLinkUrlInput.focus();
      });
    }

    if (rightSidebarSettingsClose) {
      rightSidebarSettingsClose.addEventListener("click", () => {
        rightSidebarSettingsModal.classList.add("hidden");
        rightSidebarSettingsModal.setAttribute("aria-hidden", "true");

        const rightSidebar = document.getElementById("rightSidebar");
        rightSidebar.classList.remove("disabled");
        delete rightSidebar.dataset.lockOpen;

        if (rightSidebarSettingsBtn) rightSidebarSettingsBtn.focus();
      });
    }

    if (addQuickLinkBtn && quickLinkUrlInput) {
      const handleAddQuickLink = () => {
        const url = quickLinkUrlInput.value.trim();
        if (url) {
          const success = this.managers.twitter.addQuickLink(url);
          if (success) {
            quickLinkUrlInput.value = "";
            quickLinkUrlInput.focus();
          } else {
            const msg = this.managers.i18n.getMessage("quickLinkDuplicate") || 
                       "This link already exists!";
            alert(msg);
          }
        }
      };

      addQuickLinkBtn.addEventListener("click", handleAddQuickLink);
      
      quickLinkUrlInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          handleAddQuickLink();
        }
      });
    }
  }

  setupKeyboardShortcuts() {
    document.addEventListener("keydown", (e) => {
      const modal = document.getElementById("modal");
      const settingsModal = document.getElementById("settingsModal");
      const searchInput = document.getElementById("searchInput");

      // "/" to focus search
      if (e.key === "/" && !modal.classList.contains("hidden") && 
          !settingsModal.classList.contains("hidden")) return;
      if (e.key === "/" && document.activeElement !== searchInput) {
        e.preventDefault();
        searchInput.focus();
      }

      // Escape to close modals
      if (e.key === "Escape") {
        const imageLightbox = document.querySelector('.image-lightbox');
        if (imageLightbox) return; // Let lightbox handle it

        this.managers.contextMenu.hideContextMenu();
        this.managers.sidebar.closeLeftSidebar();

        const rightSidebarSettingsModal = document.getElementById("rightSidebarSettingsModal");
        if (rightSidebarSettingsModal && !rightSidebarSettingsModal.classList.contains("hidden")) {
          rightSidebarSettingsModal.classList.add("hidden");
          rightSidebarSettingsModal.setAttribute("aria-hidden", "true");
          
          const rightSidebar = document.getElementById("rightSidebar");
          rightSidebar.classList.remove("disabled");
          delete rightSidebar.dataset.lockOpen;
        }

        const tweetDetailModal = document.getElementById("tweetDetailModal");
        if (tweetDetailModal && !tweetDetailModal.classList.contains("hidden")) {
          this.closeTweetDetailModal();
        }
      }
    });
  }

  setupContextMenus() {
    document.addEventListener("contextmenu", (e) => {
      if (e.target.closest(".context-menu")) return;
      if (e.target.closest(".tile")) return;
      if (e.target.closest("#board")) return;
      this.managers.contextMenu.hideContextMenu();
    });

    const board = document.getElementById("board");
    if (board) {
      board.addEventListener("contextmenu", (e) => {
        if (!e.target.closest(".tile")) {
          e.preventDefault();
          this.managers.contextMenu.showBoardContextMenu(
            e.clientX,
            e.clientY,
            this.managers.storage.autoAlign
          );
        }
      });
    }

    const menuToggle = document.getElementById("menuToggle");
    const sidebarOverlay = document.getElementById("sidebarOverlay");
    
    if (menuToggle) {
      menuToggle.addEventListener("click", () => {
        this.managers.sidebar.toggleLeftSidebar();
      });
    }
    
    if (sidebarOverlay) {
      sidebarOverlay.addEventListener("click", () => {
        this.managers.sidebar.closeLeftSidebar();
        this.managers.sidebar.closeRightSidebar();
      });
    }
  }

  setupTweetDetailModal() {
    const tweetDetailClose = document.getElementById("tweetDetailClose");
    if (tweetDetailClose) {
      tweetDetailClose.addEventListener("click", () => {
        this.closeTweetDetailModal();
      });
    }

    const tweetDetailModal = document.getElementById("tweetDetailModal");
    if (tweetDetailModal) {
      tweetDetailModal.addEventListener("click", (e) => {
        if (e.target === tweetDetailModal) {
          this.closeTweetDetailModal();
        }
      });
    }
  }

  closeTweetDetailModal() {
    const modal = document.getElementById("tweetDetailModal");
    const rightSidebar = document.getElementById("rightSidebar");

    if (rightSidebar) {
      rightSidebar.classList.remove("disabled");
      delete rightSidebar.dataset.lockOpen;
    }

    // Reset scroll position
    const content = modal && modal.querySelector('.tweet-detail-content');
    if (content) content.scrollTop = 0;

    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
  }

  setupCustomMouseEffects() {
    // Hide/show mouse effects based on storage setting
    this.updateMouseEffectsVisibility();
  }

  updateMouseEffectsVisibility() {
    const isEnabled = this.managers.storage.customMouseEnabled;
    const isTrailEnabled = this.managers.storage.customMouseTrailEnabled;
    const cursor = document.querySelector('.cyber-cursor-anim');
    const trail = document.querySelectorAll('.neon-mouse-dot');
    const body = document.body;
    
    // If both are disabled, show system cursor
    if (!isEnabled && !isTrailEnabled) {
      if (cursor && cursor.parentNode) {
        cursor.remove();
      }
      // Remove the class that hides system cursor
      body.classList.remove('custom-cursor-enabled');
      if (window.setTrailVisible) {
        window.setTrailVisible(false);
      }
      trail.forEach(dot => {
        dot.style.display = 'none';
      });
    } else {
      // Control custom cursor visibility
      if (isEnabled) {
        if (cursor && !cursor.parentNode) {
          document.body.appendChild(cursor);
        }
        // Add class to hide system cursor
        body.classList.add('custom-cursor-enabled');
      } else {
        if (cursor && cursor.parentNode) {
          cursor.remove();
        }
        // Remove class to show system cursor
        body.classList.remove('custom-cursor-enabled');
      }
      
      // Control trail visibility
      if (window.setTrailVisible) {
        window.setTrailVisible(isTrailEnabled);
      }
      
      // Update trail dots display
      trail.forEach(dot => {
        dot.style.display = isTrailEnabled ? '' : 'none';
      });
    }
  }
}

// Neon mouse trail
let lastX = 0, lastY = 0;
let lastCursorX = window.innerWidth / 2;
let lastCursorY = window.innerHeight / 2;
(function neonMouseTrail() {
  const colors = ['#ff2d95', '#ff2d95'];
  const trailLength = 32;
  const trail = [];
  let trailActive = false;
  
  function createDot(x, y, i) {
    const dot = document.createElement('div');
    dot.className = 'neon-mouse-dot';
    dot.style.left = x + 'px';
    dot.style.top = y + 'px';
    dot.style.background = `linear-gradient(135deg, ${colors[i%2]}, ${colors[(i+1)%2]})`;
    dot.style.opacity = i === 0 ? '0' : ((1 - i / trailLength) * 0.35);
    dot.style.display = 'none';
    document.body.appendChild(dot);
    return dot;
  }

  function setTrailVisible(visible) {
    trailActive = visible;
    trail.forEach((p, i) => {
      if (p.el) p.el.style.display = visible ? '' : 'none';
    });
  }

  function resetTrail() {
    while (trail.length) {
      const p = trail.pop();
      if (p.el) p.el.remove();
    }
  }

  function animate() {
    if (trailActive) {
      trail.unshift({ x: lastX, y: lastY });
      if (trail.length > trailLength) {
        const old = trail.pop();
        if (old.el) old.el.remove();
      }
      trail.forEach((p, i) => {
        if (!p.el) p.el = createDot(p.x, p.y, i);
        p.el.style.left = p.x + 'px';
        p.el.style.top = p.y + 'px';
        p.el.style.opacity = i === 0 ? '0' : ((1 - i / trailLength) * 0.35);
        p.el.style.display = '';
      });
    } else {
      trail.forEach((p) => { if (p.el) p.el.style.display = 'none'; });
    }
    requestAnimationFrame(animate);
  }
  animate();

  // Track all pointer movements globally for trail
  document.addEventListener('pointermove', (e) => {
    lastX = e.clientX;
    lastY = e.clientY;
  }, true);
  
  // Also track pointerdown to catch scrollbar drags
  document.addEventListener('pointerdown', (e) => {
    lastX = e.clientX;
    lastY = e.clientY;
  }, true);

  // Get storage manager reference from window (set after managers are initialized)
  const shouldShowTrail = () => {
    if (!window.storageManagerRef) return false;
    return window.storageManagerRef.customMouseTrailEnabled;
  };

  // Check initial trail setting after storage is loaded
  const checkInitialTrailSetting = () => {
    if (shouldShowTrail()) {
      setTrailVisible(true);
    } else {
      setTrailVisible(false);
    }
  };
  
  // Poll for storage manager to be ready and set initial state
  const pollInterval = setInterval(() => {
    if (window.storageManagerRef) {
      clearInterval(pollInterval);
      checkInitialTrailSetting();
    }
  }, 50);

  window.addEventListener('mouseenter', () => {
    if (shouldShowTrail()) {
      setTrailVisible(true);
    }
  });
  window.addEventListener('mouseleave', () => {
    if (shouldShowTrail()) {
      setTrailVisible(false);
      resetTrail();
    }
  });

  // Expose setTrailVisible globally for external control
  window.setTrailVisible = setTrailVisible;
})();

(function enableCursorFollowDuringDrag() {
  let dragging = false;
  let isDraggingScrollbar = false;

  function updateCursorAndTrail(e) {
    lastX = e.clientX;
    lastY = e.clientY;
    lastCursorX = e.clientX;
    lastCursorY = e.clientY;
    const cursor = document.querySelector('.cyber-cursor-anim');
    if (cursor) {
      cursor.style.left = (e.clientX - 16) + 'px';
      cursor.style.top = (e.clientY - 16) + 'px';
    }
  }

  function onPointerMove(e) {
    updateCursorAndTrail(e);
  }

  function onPointerUp() {
    dragging = false;
    isDraggingScrollbar = false;
    document.removeEventListener('pointermove', onPointerMove, true);
    document.removeEventListener('pointerup', onPointerUp, true);
  }

  // Detect scrollbar dragging by checking if target is scrollbar-related or custom scrollbar
  document.addEventListener('pointerdown', e => {
    const tile = e.target.closest('.tile');
    const target = e.target;
    
    // Check if clicking on custom scrollbar thumb
    const isCustomScrollbar = target.classList?.contains('custom-scrollbar-thumb');
    
    // Check if clicking on native scrollbar (scrollbar has specific targets in different browsers)
    const isNativeScrollbar = 
      target.tagName === 'DIV' && 
      (e.clientX > window.innerWidth - 20 || // Scrollbar thumb area
       target.closest('.scrollbar') ||
       target.closest('::-webkit-scrollbar') ||
       (e.target === document.documentElement || e.target === document.body) &&
       e.clientX > window.innerWidth - 25);
    
    if ((tile && e.button === 0) || isCustomScrollbar || isNativeScrollbar) {
      dragging = true;
      isDraggingScrollbar = isCustomScrollbar || isNativeScrollbar;
      updateCursorAndTrail(e);
      document.addEventListener('pointermove', onPointerMove, true);
      document.addEventListener('pointerup', onPointerUp, true);
    }
  });
})();

// Dynamic cursor
(function dynamicAnimatedCursor() {
  function preloadCursorFrames(frames) {
    Object.values(frames).flat().forEach(src => {
      const img = new window.Image();
      img.src = src;
    });
  }

  const cursorFrames = {
    background: Array.from({length: 10}, (_, i) => `../cursor/Background/${String(i+3).padStart(2, '0')}.png`),
    normal: Array.from({length: 20}, (_, i) => `../cursor/Normal/${String(i+1).padStart(2, '0')}.png`),
    link: Array.from({length: 11}, (_, i) => `../cursor/Link/${String(i+2).padStart(2, '0')}.png`),
    text: Array.from({length: 12}, (_, i) => `../cursor/Text/${String(i+1).padStart(2, '0')}.png`),
    busy: Array.from({length: 6}, (_, i) => `../cursor/Busy/${String(i*2+1).padStart(2, '0')}.png`),
    resize: Array.from({length: 20}, (_, i) => `../cursor/Resize/${String(i+1).padStart(2, '0')}.png`),
    others: Array.from({length: 20}, (_, i) => `../cursor/Others/${String(i+1).padStart(2, '0')}.png`),
  };
  preloadCursorFrames(cursorFrames);

  let state = 'normal';
  let frame = 0;
  let frameCount = cursorFrames[state].length;
  let lastFrame = -1;
  let lastCursorX = window.innerWidth / 2;
  let lastCursorY = window.innerHeight / 2;

  const cursor = document.createElement('div');
  cursor.className = 'cyber-cursor-anim';
  cursor.style.pointerEvents = 'none';
  cursor.style.position = 'fixed';
  cursor.style.left = '0';
  cursor.style.top = '0';
  cursor.style.width = '32px';
  cursor.style.height = '32px';
  cursor.style.zIndex = '100000';

  const cursorImg = document.createElement('img');
  cursorImg.draggable = false;
  cursorImg.style.width = '100%';
  cursorImg.style.height = '100%';
  cursorImg.style.display = 'block';
  cursorImg.style.pointerEvents = 'none';
  cursor.appendChild(cursorImg);

  document.body.appendChild(cursor);

  // Track all pointer movements including scrollbar drags
  const updateCursorPos = (e) => {
    lastCursorX = e.clientX;
    lastCursorY = e.clientY;
    cursor.style.left = (e.clientX - 16) + 'px';
    cursor.style.top = (e.clientY - 16) + 'px';
  };

  // Use capture phase to intercept all events before they bubble
  document.addEventListener('mousemove', updateCursorPos, true);
  document.addEventListener('pointermove', updateCursorPos, true);
  document.addEventListener('pointerdown', updateCursorPos, true);
  
  // Fallback for mousedown in case pointermove doesn't fire during scrollbar drag
  document.addEventListener('mousedown', updateCursorPos, true);
  
  document.addEventListener('touchmove', (e) => {
    if (e.touches.length > 0) {
      updateCursorPos(e.touches[0]);
    }
  }, true);
  
  document.addEventListener('touchstart', (e) => {
    if (e.touches.length > 0) {
      updateCursorPos(e.touches[0]);
    }
  }, true);

  // Sync cursor position during scroll or any resize
  window.addEventListener('scroll', () => {
    cursor.style.left = (lastCursorX - 16) + 'px';
    cursor.style.top = (lastCursorY - 16) + 'px';
  }, true);
  
  // Use requestAnimationFrame for smooth tracking even during system events
  let rafId;
  const trackCursorWithRAF = () => {
    cursor.style.left = (lastCursorX - 16) + 'px';
    cursor.style.top = (lastCursorY - 16) + 'px';
    rafId = requestAnimationFrame(trackCursorWithRAF);
  };
  trackCursorWithRAF();

  setInterval(() => {
    if (frame !== lastFrame) {
      cursorImg.src = cursorFrames[state][frame];
      lastFrame = frame;
    }
    frame = (frame + 1) % frameCount;
  }, 60);

  function setCursorState(newState) {
    if (state !== newState && cursorFrames[newState]) {
      state = newState;
      frame = 0;
      frameCount = cursorFrames[state].length;
      lastFrame = -1; // force update
    }
  }

  document.addEventListener('pointerover', e => {
    if (e.target.closest('.cursor-busy, body.busy')) {
      setCursorState('busy');
    } else if (e.target.closest('a, button, [role="button"], .cursor-link')) {
      setCursorState('link');
    } else if (e.target.closest('input[type="text"], textarea, [contenteditable="true"], .cursor-text')) {
      setCursorState('text');
    } else if (e.target.closest('.cursor-resize, .resizable-ew, .resizable-ns, .resizable-nesw, .resizable-nwse')) {
      setCursorState('resize');
    } else if (e.target.closest('.cursor-others')) {
      setCursorState('others');
    } else {
      setCursorState('normal');
    }
  });
  
  document.addEventListener('pointerout', e => {
    setCursorState('normal');
  });

  window.setCursorState = setCursorState;
})();