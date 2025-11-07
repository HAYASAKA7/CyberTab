// CyberTab main entry point

import { StorageManager } from './modules/storage.js';
import { LayoutManager } from './modules/layout.js';
import { TileManager } from './modules/tiles.js';
import { BookmarkManager } from './modules/bookmarks.js';
import { SearchManager } from './modules/search.js';
import { SuggestionManager } from './modules/suggestions.js';
import { TwitterManager } from './modules/twitter.js';
import { SidebarManager } from './modules/sidebar.js';
import { ContextMenuManager } from './modules/contextMenu.js';
import { IconManager } from './modules/icons.js';
import { I18nManager } from './modules/i18n.js';
import { BackgroundManager } from './modules/background.js';
import { SettingsManager } from './modules/settings.js';
import { UIManager } from './modules/ui.js';
import { UpdateChecker } from './modules/update.js';
import { CustomScrollbar } from './modules/customScrollbar.js';

// Initialize all managers
const storageManager = new StorageManager();
const layoutManager = new LayoutManager();
const iconManager = new IconManager();
const i18nManager = new I18nManager();
const sidebarManager = new SidebarManager();
const searchManager = new SearchManager(storageManager);
const suggestionManager = new SuggestionManager();
const twitterManager = new TwitterManager(storageManager, i18nManager);
const backgroundManager = new BackgroundManager(storageManager);

// Tile manager with callbacks
const tileManager = new TileManager(layoutManager, iconManager, storageManager, {
  onShowContextMenu: (x, y, itemId) => {
    contextMenuManager.showContextMenu(x, y, itemId);
  }
});

// Bookmark manager with callbacks
const bookmarkManager = new BookmarkManager(storageManager, layoutManager, {
  onRenderAll: () => tileManager.renderAll(showTileContextMenu),
  onAutoAlign: () => tileManager.autoAlignTiles(),
  onFetchMissingFavicons: () => tileManager.fetchMissingFavicons()
});

// Context menu manager with callbacks
const contextMenuManager = new ContextMenuManager(i18nManager, {
  onShowEditIconModal: (itemId) => {
    settingsManager.showEditIconModal(itemId);
  },
  onDeleteItem: (itemId) => {
    const it = storageManager.items.find(it => it.id === itemId);
    if (it && it.bookmarkId) {
      bookmarkManager.markBookmarkUrlDeleted(it.url);
    }
    storageManager.items = storageManager.items.filter(it => it.id !== itemId);
    storageManager.save();
    tileManager.renderAll(showTileContextMenu);
    tileManager.autoAlignTiles();
    bookmarkManager.loadBookmarks(storageManager.bookmarkSyncCount);
  },
  onShowAddModal: () => {
    const modal = document.getElementById("modal");
    if (modal) {
      modal.classList.remove("hidden");
      modal.setAttribute("aria-hidden", "false");
      const nameInput = document.getElementById("favName");
      if (nameInput) nameInput.focus();
    }
    sidebarManager.closeLeftSidebar();
  },
  onToggleAutoAlign: () => {
    storageManager.autoAlign = !storageManager.autoAlign;
    storageManager.saveAutoAlign();
    tileManager.autoAlignTiles();
  },
  onResyncBookmarks: async () => {
    if (bookmarkManager.clearDeletedBookmarkUrls) {
      bookmarkManager.clearDeletedBookmarkUrls();
    }
    await bookmarkManager.loadBookmarks(storageManager.bookmarkSyncCount);
    tileManager.renderAll(showTileContextMenu);
    tileManager.autoAlignTiles();
    tileManager.fetchMissingFavicons();
  }
});

// Settings manager with callbacks
const settingsManager = new SettingsManager(storageManager, i18nManager, {
  onCloseSidebar: () => sidebarManager.closeLeftSidebar(),
  onLoadBookmarks: async (count) => {
    await bookmarkManager.loadBookmarks(count);
  },
  onRenderAll: () => tileManager.renderAll(showTileContextMenu),
  onAutoAlign: () => tileManager.autoAlignTiles(),
  onApplyBackground: () => backgroundManager.applyPendingBackground(),
  onUpdateEngineUI: () => searchManager.updateEngineUI(),
  onLocalizePage: () => i18nManager.localizePage(),
  onCustomMouseChange: () => uiManager ? uiManager.updateMouseEffectsVisibility() : null,
  onCustomMouseTrailChange: () => uiManager ? uiManager.updateMouseEffectsVisibility() : null
});

// UI manager with all managers
const uiManager = new UIManager({
  storage: storageManager,
  layout: layoutManager,
  tile: tileManager,
  bookmark: bookmarkManager,
  search: searchManager,
  suggestion: suggestionManager,
  twitter: twitterManager,
  sidebar: sidebarManager,
  contextMenu: contextMenuManager,
  icon: iconManager,
  i18n: i18nManager,
  background: backgroundManager,
  settings: settingsManager
});

// Main initialization
document.addEventListener("DOMContentLoaded", async () => {
  // Initialize custom scrollbar system first
  const customScrollbar = new CustomScrollbar();

  // Load saved data
  await storageManager.load();
  
  // Expose storage manager to window for trail visibility check
  window.storageManagerRef = storageManager;
  
  // Set language in i18n manager
  i18nManager.setLanguage(storageManager.currentLanguage);
  
  // Compute initial layout
  layoutManager.computeLayout();
  tileManager.renderAll(showTileContextMenu);
  
  // Recompute layout on resize
  window.addEventListener('resize', () => {
    layoutManager.computeLayout();
    tileManager.renderAll(showTileContextMenu);
  });
  
  // Initialize UI components
  sidebarManager.setupScrollbars();
  sidebarManager.setupRightSidebarTrigger();
  
  // Load bookmarks
  await bookmarkManager.loadBookmarks(storageManager.bookmarkSyncCount);
  bookmarkManager.setupBookmarkSyncListeners();
  
  // Initialize Twitter
  twitterManager.renderTwitterCards();
  // Fetch Twitter accounts in batches to avoid rate limits
  async function fetchQuickLinksInBatches(links) {
    // const toFetch = links.filter(link =>
    //   !link.lastUpdate || Date.now() - link.lastUpdate > 5 * 60 * 1000 || link.error
    // );
    for (const link of links) {
      await twitterManager.fetchTwitterAccount(link.id);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  fetchQuickLinksInBatches(storageManager.quickLinks);

  twitterManager.setupTwitterAutoRefresh((accountIds) => {
    //twitterManager.fetchTwitterAccount(accountId);
    const links = storageManager.quickLinks.filter(link => accountIds.includes(link.id));
    fetchQuickLinksInBatches(links);
  });
  
  // Apply background
  backgroundManager.applyBackground(storageManager.backgroundImage);
  backgroundManager.initializeUI();
  
  // Update search engine UI
  searchManager.updateEngineUI();
  
  // Localize page
  await i18nManager.localizePage();
  
  // Initialize all UI event handlers
  uiManager.initialize();
  
  // Initialize settings modal
  settingsManager.initializeUI();
  settingsManager.initializeEditIconModal(async (itemId, iconType) => {
    return await tileManager.applyIconChange(itemId, iconType);
  });
  
  // Fetch missing favicons in background
  tileManager.fetchMissingFavicons();
  
  // Setup suggestion callbacks
  suggestionManager.setCallbacks({
    onPerformSearch: (query) => searchManager.performSearch(query)
  });

  // Update checker
  const homeBtn = document.getElementById("homeBtn");
  const homeBtnDot = document.getElementById("homeBtnDot");
  const repo = "HAYASAKA7/CyberTab";
  const updateChecker = new UpdateChecker({ repo, i18nManager });

  if (homeBtn && homeBtnDot) {
    const currentVersion = chrome.runtime.getManifest().version;
    const hasUpdate = await updateChecker.check(currentVersion);
    if (hasUpdate) {
      homeBtnDot.style.display = "block";
      homeBtn.title = updateChecker.getUpdateTitle();
      homeBtn.onclick = () => window.open(updateChecker.latestReleaseUrl, "_blank");
    } else {
      homeBtnDot.style.display = "none";
      homeBtn.title = updateChecker.getHomeTitle();
      homeBtn.onclick = () => window.open(`https://github.com/${repo}`, "_blank");
    }
  }
});

function showTileContextMenu(x, y, itemId) {
  contextMenuManager.showContextMenu(x, y, itemId);
}