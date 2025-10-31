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
  }

  setupAddModal() {
    const addBtn = document.getElementById("addBtn");
    const modal = document.getElementById("modal");
    const favForm = document.getElementById("favForm");
    const cancelBtn = document.getElementById("cancel");
    const favLocalIconBtn = document.getElementById("favLocalIconBtn");
    const favLocalIconInput = document.getElementById("favLocalIcon");
    const favLocalIconName = document.getElementById("favLocalIconName");

    if (favLocalIconBtn && favLocalIconInput) {
      favLocalIconBtn.addEventListener("click", () => favLocalIconInput.click());
      favLocalIconInput.addEventListener("change", (e) => {
        const f = e.target.files[0];
        favLocalIconName.textContent = f ? f.name : "";
      });
    }

    if (addBtn) {
      addBtn.addEventListener("click", () => {
        modal.classList.remove("hidden");
        modal.setAttribute("aria-hidden", "false");
        document.getElementById("favName").focus();
        this.managers.sidebar.closeLeftSidebar();
      });
    }

    if (cancelBtn) {
      cancelBtn.addEventListener("click", () => {
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
      
      // Neon mouse trail
      let lastX = 0, lastY = 0;
      (function neonMouseTrail() {
        const colors = ['#ff2d95', '#ff2d95'];
        const trailLength = 32;
        const trail = [];

        function createDot(x, y, i) {
          const dot = document.createElement('div');
          dot.className = 'neon-mouse-dot';
          dot.style.left = x + 'px';
          dot.style.top = y + 'px';
          dot.style.background = `linear-gradient(135deg, ${colors[i%2]}, ${colors[(i+1)%2]})`;
          dot.style.opacity = i === 0 ? '0' : ((1 - i / trailLength) * 0.35);
          document.body.appendChild(dot);
          return dot;
        }

        function updateCursorPos(e) {
          lastX = e.clientX;
          lastY = e.clientY;
          const cursor = document.querySelector('.cyber-cursor-anim');
          if (cursor) {
            cursor.style.left = (e.clientX - 16) + 'px';
            cursor.style.top = (e.clientY - 16) + 'px';
          }
        }
        document.addEventListener('mousemove', updateCursorPos);
        document.addEventListener('pointermove', updateCursorPos);

        function animate() {
          trail.unshift({ x: lastX, y: lastY });
          if (trail.length > trailLength) {
            const old = trail.pop();
            if (old.el) old.el.remove();
          }
          trail.forEach((p, i) => {
            if (!p.el) p.el = createDot(p.x, p.y, i);
            p.el.style.left = p.x + 'px';
            p.el.style.top = p.y + 'px';
            p.el.style.opacity = (1 - i / trailLength) * 0.35;
          });
          requestAnimationFrame(animate);
        }
        animate();
      })();
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
}

// Neon mouse trail
let lastX = 0, lastY = 0;
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
    dot.style.display = trailActive ? '' : 'none';
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

  window.addEventListener('mouseenter', () => {
    setTrailVisible(true);
  });
  window.addEventListener('mouseleave', () => {
    setTrailVisible(false);
    resetTrail();
  });
})();

(function enableCursorFollowDuringTileDrag() {
  let dragging = false;

  document.addEventListener('pointerdown', e => {
    const tile = e.target.closest('.tile');
    if (tile && e.button === 0) {
      dragging = true;
      document.addEventListener('pointermove', onPointerMove, true);
      document.addEventListener('pointerup', onPointerUp, true);
    }
  });

  function onPointerMove(e) {
    lastX = e.clientX;
    lastY = e.clientY;
    const cursor = document.querySelector('.cyber-cursor-anim');
    if (cursor) {
      cursor.style.left = (e.clientX - 16) + 'px';
      cursor.style.top = (e.clientY - 16) + 'px';
    }
  }

  function onPointerUp() {
    dragging = false;
    document.removeEventListener('pointermove', onPointerMove, true);
    document.removeEventListener('pointerup', onPointerUp, true);
  }
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
  cursor.style.display = 'none';

  window.addEventListener('mouseenter', () => {
    cursor.style.display = '';
  });
  window.addEventListener('mouseleave', () => {
    cursor.style.display = 'none';
  });

  document.addEventListener('mousemove', e => {
    cursor.style.left = (e.clientX - 16) + 'px';
    cursor.style.top = (e.clientY - 16) + 'px';
  });

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