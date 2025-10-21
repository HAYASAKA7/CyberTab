// Bookmark management module

export class BookmarkManager {
  constructor(storageManager, layoutManager, callbacks) {
    this.storageManager = storageManager;
    this.layoutManager = layoutManager;
    this.callbacks = callbacks;
  }

  async loadBookmarks(limit) {
    limit = limit || this.storageManager.bookmarkSyncCount;
    if (!chrome.bookmarks) return;

    try {
      const tree = await new Promise(resolve => chrome.bookmarks.getTree(resolve));
      const bookmarksBar = tree[0].children.find(child => 
        child.title === 'Bookmarks bar' || child.id === '1'
      );
      
      if (bookmarksBar && bookmarksBar.children) {
        const bookmarks = bookmarksBar.children.filter(child => child.url);
        const toConsider = (limit > 0) ? bookmarks.slice(0, limit) : [];

        const allowedIds = new Set(toConsider.map(b => b.id));
        let removed = false;
        this.storageManager.items = this.storageManager.items.filter(it => {
          if (it.bookmarkId && !allowedIds.has(it.bookmarkId)) {
            removed = true;
            return false;
          }
          return true;
        });
        if (removed) {
          this.storageManager.save();
        }

        toConsider.forEach(bookmark => {
          const existing = this.storageManager.items.find(it => it.url === bookmark.url);
          if (existing) {
            if (!existing.bookmarkId) existing.bookmarkId = bookmark.id;
            return;
          }

          if (this.storageManager.items.some(it => 
            it.bookmarkId === bookmark.id || it.url === bookmark.url
          )) return;

          let col = 0, row = 0;
          while (this.layoutManager.isPositionOccupied(this.storageManager.items, col, row)) {
            col++;
            if (col > 10) { col = 0; row++; }
          }

          this.storageManager.items.push({
            id: this.storageManager.uid(),
            name: bookmark.title,
            url: bookmark.url,
            col,
            row,
            icon: "",
            bookmarkId: bookmark.id
          });
        });

        this.storageManager.save();
      }
    } catch (error) {
      console.error('Error loading bookmarks:', error);
    }
  }

  setupBookmarkSyncListeners() {
    if (!chrome.bookmarks) return;

    chrome.bookmarks.onRemoved.addListener((id, removeInfo) => {
      let removed = false;
      this.storageManager.items = this.storageManager.items.filter(it => {
        if (it.bookmarkId === id) {
          removed = true;
          return false;
        }
        return true;
      });
      if (removed) {
        this.storageManager.save();
        if (this.callbacks.onRenderAll) this.callbacks.onRenderAll();
        if (this.callbacks.onAutoAlign) this.callbacks.onAutoAlign();
      }
    });

    chrome.bookmarks.onChanged.addListener((id, changeInfo) => {
      const idx = this.storageManager.items.findIndex(it => it.bookmarkId === id);
      if (idx !== -1) {
        if (changeInfo.title !== undefined) 
          this.storageManager.items[idx].name = changeInfo.title;
        if (changeInfo.url !== undefined) {
          this.storageManager.items[idx].url = changeInfo.url;
          this.storageManager.items[idx].icon = "";
          if (this.callbacks.onFetchMissingFavicons) 
            this.callbacks.onFetchMissingFavicons();
        }
        this.storageManager.save();
        if (this.callbacks.onRenderAll) this.callbacks.onRenderAll();
      }
    });

    chrome.bookmarks.onCreated.addListener((id, bookmark) => {
      if (!bookmark.url) return;
      
      const trackedCount = this.storageManager.items.filter(it => it.bookmarkId).length;
      if (trackedCount >= this.storageManager.bookmarkSyncCount) return;

      if (this.storageManager.items.some(it => 
        it.bookmarkId === id || it.url === bookmark.url
      )) return;

      let col = 0, row = 0;
      while (this.layoutManager.isPositionOccupied(this.storageManager.items, col, row)) {
        col++;
        if (col > 10) { col = 0; row++; }
      }

      const newItem = {
        id: this.storageManager.uid(),
        name: bookmark.title || bookmark.url,
        url: bookmark.url,
        col,
        row,
        icon: "",
        bookmarkId: id
      };

      this.storageManager.items.push(newItem);
      this.storageManager.save();
      if (this.callbacks.onRenderAll) this.callbacks.onRenderAll();
      if (this.callbacks.onAutoAlign) this.callbacks.onAutoAlign();
      if (this.callbacks.onFetchMissingFavicons) this.callbacks.onFetchMissingFavicons();
    });

    chrome.bookmarks.onMoved.addListener((id, moveInfo) => {
      // no-op for now
    });
  }
}