// Settings modal management module

export class SettingsManager {
  constructor(storageManager, i18nManager, callbacks) {
    this.storageManager = storageManager;
    this.i18nManager = i18nManager;
    this.callbacks = callbacks;
  }

  initializeUI() {
    const settingsBtn = document.getElementById("settingsBtn");
    const settingsModal = document.getElementById("settingsModal");
    const settingsCancel = document.getElementById("settingsCancel");
    const settingsApply = document.getElementById("settingsApply");
    const exportBtn = document.getElementById("exportBtn");
    const importBtn = document.getElementById("importBtn");
    const importFile = document.getElementById("importFile");
    const languageSelect = document.getElementById("languageSelect");
    const bookmarkSyncInput = document.getElementById("bookmarkSyncCount");
    const customMouseCheckbox = document.getElementById("customMouseEnabled");
    const customMouseTrailCheckbox = document.getElementById("customMouseTrailEnabled");

    // Set initial values
    if (languageSelect) {
      languageSelect.value = this.storageManager.currentLanguage;
    }

    if (bookmarkSyncInput) {
      bookmarkSyncInput.value = this.storageManager.bookmarkSyncCount;
    }

    if (customMouseCheckbox) {
      customMouseCheckbox.checked = this.storageManager.customMouseEnabled;
    }

    if (customMouseTrailCheckbox) {
      customMouseTrailCheckbox.checked = this.storageManager.customMouseTrailEnabled;
    }

    // Settings button
    if (settingsBtn) {
      settingsBtn.addEventListener("click", () => {
        settingsModal.classList.remove("hidden");
        settingsModal.setAttribute("aria-hidden", "false");
        if (this.callbacks.onCloseSidebar) {
          this.callbacks.onCloseSidebar();
        }
      });
    }

    // Cancel button
    if (settingsCancel) {
      settingsCancel.addEventListener("click", () => {
        settingsModal.classList.add("hidden");
        settingsModal.setAttribute("aria-hidden", "true");
      });
    }

    // Apply button
    if (settingsApply) {
      settingsApply.addEventListener("click", async () => {
        // Update bookmark sync count
        if (bookmarkSyncInput) {
          const v = parseInt(bookmarkSyncInput.value, 10);
          this.storageManager.bookmarkSyncCount = (isNaN(v) || v < 0) ? 0 : Math.min(50, v);
          this.storageManager.saveBookmarkSyncCount();
          
          if (this.callbacks.onLoadBookmarks) {
            await this.callbacks.onLoadBookmarks(this.storageManager.bookmarkSyncCount);
          }
          if (this.callbacks.onRenderAll) {
            this.callbacks.onRenderAll();
          }
          if (this.callbacks.onAutoAlign) {
            this.callbacks.onAutoAlign();
          }
        }

        // Update custom mouse setting
        if (customMouseCheckbox) {
          this.storageManager.customMouseEnabled = customMouseCheckbox.checked;
          this.storageManager.saveCustomMouseEnabled();
          if (this.callbacks.onCustomMouseChange) {
            this.callbacks.onCustomMouseChange();
          }
        }

        // Update custom mouse trail setting
        if (customMouseTrailCheckbox) {
          this.storageManager.customMouseTrailEnabled = customMouseTrailCheckbox.checked;
          this.storageManager.saveCustomMouseTrailEnabled();
          if (this.callbacks.onCustomMouseTrailChange) {
            this.callbacks.onCustomMouseTrailChange();
          }
        }

        // Apply background
        if (this.callbacks.onApplyBackground) {
          this.callbacks.onApplyBackground();
        }

        // Update language
        if (languageSelect) {
          const selectedLang = languageSelect.value;
          this.storageManager.currentLanguage = selectedLang;
          this.storageManager.saveLanguage();
          this.i18nManager.setLanguage(selectedLang);
          window.location.reload();
        }
      });
    }

    // Export button
    if (exportBtn) {
      exportBtn.addEventListener("click", () => {
        this.storageManager.exportSettings();
      });
    }

    // Import button
    if (importBtn) {
      importBtn.addEventListener("click", () => {
        importFile.click();
      });
    }

    if (importFile) {
      importFile.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (file) {
          this.storageManager.importSettings(file, {
            onRenderAll: this.callbacks.onRenderAll,
            onUpdateEngineUI: this.callbacks.onUpdateEngineUI,
            onLocalizePage: this.callbacks.onLocalizePage
          });
          e.target.value = "";
        }
      });
    }
  }

  showEditIconModal(itemId) {
    const modal = document.getElementById("editIconModal");
    if (!modal) {
      console.warn("editIconModal not found in DOM");
      return;
    }
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
    modal.dataset.itemId = itemId;
    
    const editLocalIconInput = document.getElementById("editLocalIcon");
    if (editLocalIconInput) {
      editLocalIconInput.value = "";
    }
  }

  initializeEditIconModal(onApplyIconChange) {
    const useDefaultIcon = document.getElementById("useDefaultIcon");
    const useWebsiteIcon = document.getElementById("useWebsiteIcon");
    const useLocalIconBtn = document.getElementById("useLocalIcon");
    const editLocalIconInput = document.getElementById("editLocalIcon");
    const editIconApply = document.getElementById("editIconApply");
    const editIconCancel = document.getElementById("editIconCancel");

    if (useLocalIconBtn && editLocalIconInput) {
      useLocalIconBtn.onclick = () => editLocalIconInput.click();
      editLocalIconInput.onchange = () => {
        editIconApply.click();
      };
    }

    if (useDefaultIcon) {
      useDefaultIcon.addEventListener("click", () => {
        const itemId = document.getElementById("editIconModal").dataset.itemId;
        onApplyIconChange(itemId, "default");
        document.getElementById("editIconModal").classList.add("hidden");
      });
    }

    if (useWebsiteIcon) {
      useWebsiteIcon.addEventListener("click", async () => {
        const itemId = document.getElementById("editIconModal").dataset.itemId;
        const ok = await onApplyIconChange(itemId, "website");
        if (!ok) {
          const msg = this.i18nManager.getMessage("faviconFetchFailed") || 
                     "Failed to fetch website icon. Using default.";
          alert(msg);
          return;
        }
        document.getElementById("editIconModal").classList.add("hidden");
      });
    }

    if (editIconApply) {
      editIconApply.addEventListener("click", async () => {
        const itemId = document.getElementById("editIconModal").dataset.itemId;
        const file = editLocalIconInput.files[0];
        if (file) {
          const ok = await onApplyIconChange(itemId, "local");
          if (!ok) {
            const msg = this.i18nManager.getMessage("faviconFetchFailed") || 
                       "Failed to apply local icon.";
            alert(msg);
            return;
          }
        }
        document.getElementById("editIconModal").classList.add("hidden");
      });
    }

    if (editIconCancel) {
      editIconCancel.addEventListener("click", () => {
        document.getElementById("editIconModal").classList.add("hidden");
      });
    }
  }
}