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
      
      const showClear = () => {
        if (searchInput && String(searchInput.value || "").trim().length > 0) {
          clearBtn.classList.add("visible");
        }
      };
      
      const hideClearIfEmpty = () => {
        if (!searchInput.value && document.activeElement !== searchInput) {
          clearBtn.classList.remove("visible");
        }
      };

      if (searchFormEl) {
        searchFormEl.addEventListener("pointerenter", showClear);
        searchFormEl.addEventListener("pointerleave", () => setTimeout(hideClearIfEmpty, 120));
      }

      clearBtn.addEventListener("pointerenter", showClear);
      clearBtn.addEventListener("pointerleave", () => setTimeout(hideClearIfEmpty, 120));

      searchInput.addEventListener("focus", showClear);
      searchInput.addEventListener("blur", () => setTimeout(hideClearIfEmpty, 120));
      searchInput.addEventListener("input", () => {
        if (searchInput.value) showClear();
        else if (document.activeElement !== searchInput) clearBtn.classList.remove("visible");
      });

      clearBtn.addEventListener("click", (e) => {
        e.preventDefault();
        searchInput.value = "";
        if (suggestionsBox) {
          suggestionsBox.style.display = "none";
          suggestionsBox.setAttribute("aria-hidden", "true");
        }
        clearBtn.classList.remove("visible");
        searchInput.focus();
        const ev = new Event('input', { bubbles: true });
        searchInput.dispatchEvent(ev);
      });
    }

    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        const v = e.target.value || "";
        this.managers.suggestion.debouncedRemoteSuggestions(v);
      });
      
      searchInput.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          this.managers.suggestion.moveSuggestion(1);
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          this.managers.suggestion.moveSuggestion(-1);
        } else if (e.key === "Enter" && suggestionsBox && 
                   suggestionsBox.style.display !== "none") {
          if (this.managers.suggestion.acceptActiveSuggestion()) {
            e.preventDefault();
          }
        } else if (e.key === "Tab") {
          e.preventDefault();
          this.managers.search.toggleEngine();
        }
      });

      searchInput.addEventListener("blur", () => {
        setTimeout(() => {
          if (suggestionsBox) {
            suggestionsBox.style.display = "none";
            suggestionsBox.setAttribute("aria-hidden", "true");
          }
        }, 150);
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

    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
  }
}