// Storage management module

import {
  STORAGE_KEY,
  ENGINE_KEY,
  LANGUAGE_KEY,
  AUTO_ALIGN_KEY,
  BOOKMARK_SYNC_COUNT_KEY,
  BACKGROUND_KEY,
  LOCAL_ICONS_KEY,
  QUICK_LINKS_KEY,
  QUICK_LINKS_TWEETS_KEY,
  CUSTOM_MOUSE_ENABLED_KEY,
  CUSTOM_MOUSE_TRAIL_ENABLED_KEY
} from './constants.js';

export class StorageManager {
  constructor() {
    this.items = [];
    this.currentEngine = "google";
    this.currentLanguage = "auto";
    this.autoAlign = true;
    this.bookmarkSyncCount = 5;
    this.backgroundImage = "";
    this.quickLinks = [];
    this.quickLinksTweets = {};
    this.customMouseEnabled = true;
    this.customMouseTrailEnabled = false;
  }

  save() {
    const itemsForSync = this.items.map(it => ({
      ...it,
      icon: (it.icon && it.icon.startsWith('data:')) ? '' : it.icon
    }));

    const localIcons = {};
    this.items.forEach(it => {
      if (it.icon && it.icon.startsWith('data:')) {
        localIcons[it.id] = it.icon;
      }
    });
    
    chrome.storage.sync.set({ [STORAGE_KEY]: itemsForSync });
    if (Object.keys(localIcons).length > 0) {
      chrome.storage.local.set({ [LOCAL_ICONS_KEY]: localIcons });
    } else {
      chrome.storage.local.remove([LOCAL_ICONS_KEY]);
    }
  }

  saveEngine() {
    chrome.storage.sync.set({ [ENGINE_KEY]: this.currentEngine });
  }

  saveLanguage() {
    chrome.storage.sync.set({ [LANGUAGE_KEY]: this.currentLanguage });
  }

  saveAutoAlign() {
    chrome.storage.sync.set({ [AUTO_ALIGN_KEY]: this.autoAlign });
  }

  saveBookmarkSyncCount() {
    chrome.storage.sync.set({ [BOOKMARK_SYNC_COUNT_KEY]: this.bookmarkSyncCount });
  }

  saveCustomMouseEnabled() {
    chrome.storage.sync.set({ [CUSTOM_MOUSE_ENABLED_KEY]: this.customMouseEnabled });
  }

  saveCustomMouseTrailEnabled() {
    chrome.storage.sync.set({ [CUSTOM_MOUSE_TRAIL_ENABLED_KEY]: this.customMouseTrailEnabled });
  }

  saveBackground() {
    if (this.backgroundImage && this.backgroundImage.startsWith('data:')) {
      chrome.storage.local.set({ [BACKGROUND_KEY]: this.backgroundImage });
      chrome.storage.sync.set({ [BACKGROUND_KEY]: "" });
    } else if (this.backgroundImage) {
      chrome.storage.sync.set({ [BACKGROUND_KEY]: this.backgroundImage });
      chrome.storage.local.set({ [BACKGROUND_KEY]: "" });
    } else {
      chrome.storage.sync.set({ [BACKGROUND_KEY]: "" });
      chrome.storage.local.set({ [BACKGROUND_KEY]: "" });
    }
  }

  saveQuickLinks() {
    // Save account data for sync storage
    const accountsForSync = this.quickLinks.map(link => ({
      id: link.id,
      username: link.username,
      handle: link.handle,
      avatar: link.avatar,
      displayName: link.displayName,
      lastUpdate: link.lastUpdate,
      addedAt: link.addedAt,
      loading: link.loading,
      error: link.error
    }));
    
    chrome.storage.sync.set({ [QUICK_LINKS_KEY]: accountsForSync });
    
    // Save tweets data locally
    const tweetsData = {};
    this.quickLinks.forEach(link => {
      if (link.tweets && link.tweets.length > 0) {
        tweetsData[link.id] = link.tweets;
      }
    });
    
    chrome.storage.local.set({ [QUICK_LINKS_TWEETS_KEY]: tweetsData });
  }

  async load() {
    return new Promise(async resolve => {
      chrome.storage.sync.get([
        STORAGE_KEY, ENGINE_KEY, LANGUAGE_KEY, AUTO_ALIGN_KEY, 
        BOOKMARK_SYNC_COUNT_KEY, BACKGROUND_KEY, QUICK_LINKS_KEY, CUSTOM_MOUSE_ENABLED_KEY, CUSTOM_MOUSE_TRAIL_ENABLED_KEY
      ], async res => {
        this.items = res[STORAGE_KEY] || this.getDefaultItems();
        this.currentEngine = res[ENGINE_KEY] || "google";
        this.currentLanguage = res[LANGUAGE_KEY] || "auto";
        this.autoAlign = (typeof res[AUTO_ALIGN_KEY] !== "undefined") ? res[AUTO_ALIGN_KEY] : true;
        this.bookmarkSyncCount = (typeof res[BOOKMARK_SYNC_COUNT_KEY] !== "undefined") ? res[BOOKMARK_SYNC_COUNT_KEY] : 5;
        this.backgroundImage = res[BACKGROUND_KEY] || "";
        this.quickLinks = res[QUICK_LINKS_KEY] || [];
        this.customMouseEnabled = (typeof res[CUSTOM_MOUSE_ENABLED_KEY] !== "undefined") ? res[CUSTOM_MOUSE_ENABLED_KEY] : true;
        this.customMouseTrailEnabled = (typeof res[CUSTOM_MOUSE_TRAIL_ENABLED_KEY] !== "undefined") ? res[CUSTOM_MOUSE_TRAIL_ENABLED_KEY] : false;

        chrome.storage.local.get([LOCAL_ICONS_KEY, BACKGROUND_KEY], localRes => {
          const localIcons = localRes[LOCAL_ICONS_KEY] || {};
          
          this.items.forEach(it => {
            if (localIcons[it.id]) {
              it.icon = localIcons[it.id];
            }
          });

          if (localRes[BACKGROUND_KEY] && localRes[BACKGROUND_KEY].trim() !== "") {
            this.backgroundImage = localRes[BACKGROUND_KEY];
          } else if (this.backgroundImage && this.backgroundImage.trim() === "") {
            this.backgroundImage = localRes[BACKGROUND_KEY] || "";
          }

          // Load tweets for quick links
          const tweetsData = localRes[QUICK_LINKS_TWEETS_KEY] || {};
          this.quickLinks.forEach(link => {
            link.tweets = tweetsData[link.id] || [];
          });

          resolve();
        });
      });
    });
  }

  getDefaultItems() {
    return [
      { 
        id: this.uid(), 
        name: chrome.i18n.getMessage("defaultItem1") || "YouTube", 
        url: "https://www.youtube.com", 
        col: 0, 
        row: 0, 
        icon: "" 
      },
      { 
        id: this.uid(), 
        name: chrome.i18n.getMessage("defaultItem2") || "X", 
        url: "https://x.com/X.", 
        col: 1, 
        row: 0, 
        icon: "" 
      }
    ];
  }

  uid() {
    return (crypto && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).slice(2, 9);
  }

  exportSettings() {
    const data = {
      items: this.items,
      currentEngine: this.currentEngine,
      currentLanguage: this.currentLanguage,
      customMouseEnabled: this.customMouseEnabled,
      customMouseTrailEnabled: this.customMouseTrailEnabled
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cybertab-settings.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    alert(chrome.i18n.getMessage("exportSuccess") || "Settings exported successfully!");
  }

  importSettings(file, callbacks) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (data.items) this.items = data.items;
        if (data.currentEngine) this.currentEngine = data.currentEngine;
        if (data.currentLanguage) this.currentLanguage = data.currentLanguage;
        if (typeof data.customMouseEnabled !== 'undefined') this.customMouseEnabled = data.customMouseEnabled;
        if (typeof data.customMouseTrailEnabled !== 'undefined') this.customMouseTrailEnabled = data.customMouseTrailEnabled;
        this.save();
        this.saveEngine();
        this.saveLanguage();
        this.saveCustomMouseEnabled();
        this.saveCustomMouseTrailEnabled();
        
        if (callbacks) {
          if (callbacks.onRenderAll) callbacks.onRenderAll();
          if (callbacks.onUpdateEngineUI) callbacks.onUpdateEngineUI();
          if (callbacks.onLocalizePage) callbacks.onLocalizePage();
        }
        
        alert(chrome.i18n.getMessage("importSuccess") || "Settings imported successfully!");
      } catch (error) {
        alert(chrome.i18n.getMessage("importError") || "Failed to import settings. Please check the file format.");
      }
    };
    reader.readAsText(file);
  }
}