// Minimal CyberWeTab new-tab extension logic.
// - draggable tiles that snap to grid (Windows desktop style)
// - auto-generated letter icons from URL/name
// - persistent storage via chrome.storage.sync
// - search box with Bing/Google toggle
// - right-click context menu for delete
// - internationalization support
// - collapsible sidebar menu
// - manual language settings
// - export/import settings

const GRID = 140; // snap grid (tile width + gap)
const SIDE_MARGIN = 32 * 8; // left/right margin
const TOP_OFFSET = 32; // top offset
const TILE_SIZE = 120; // tile width/height
const STORAGE_KEY = "cyber_tab_items";
const ENGINE_KEY = "cyber_tab_engine";
const LANGUAGE_KEY = "cyber_tab_language";
const AUTO_ALIGN_KEY = "cyber_tab_auto_align";
const BOOKMARK_SYNC_COUNT_KEY = "cyber_tab_bookmark_sync_count";
const BACKGROUND_KEY = "cyber_tab_background_image";

let items = []; // saved tiles: {id,name,url,col,row,icon,bookmarkId?}
let currentEngine = "bing"; // "google" or "bing"
let currentLanguage = "auto"; // "auto", "en", "zh_CN", "jp"
let autoAlign = true; // whether to auto-align tiles
let bookmarkSyncCount = 5; // how many bookmarks to import/sync from bookmarks bar
let backgroundImage = ""; // background image data URL
let contextMenu = null; // reference to context menu element
let messagesMapCache = null; // cache for localized messages

// Dynamic layout state (computed at runtime based on board width)
let currentMaxCols = 11;
let currentLeftOffset = SIDE_MARGIN;

// Compute columns and left offset so tiles auto-wrap and keep horizontal margins.
function computeLayout() {
  const board = document.getElementById("board");
  const bw = board ? Math.max(0, board.clientWidth) : window.innerWidth;
  const minEdge = 64; // minimum empty space at each side (adjustable)
  const usable = Math.max(0, bw - minEdge * 2);
  // GRID includes tile + gap; ensure at least one column
  const cols = Math.max(1, Math.floor(usable / GRID));
  // Cap to a sensible maximum (previously 11)
  currentMaxCols = Math.max(1, Math.min(11, cols));
  // Center the grid within the board while ensuring at least minEdge on each side
  const totalGridWidth = currentMaxCols * GRID;
  const centeredLeft = Math.round((bw - totalGridWidth) / 2);
  currentLeftOffset = Math.max(minEdge, centeredLeft);
}

function uid(){
  return (crypto && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).slice(2,9);
}

function extensionAsset(name) {
  return chrome.runtime.getURL(`icons/${name}`);
}

function save() {
  chrome.storage.sync.set({ [STORAGE_KEY]: items });
}

function saveEngine() {
  chrome.storage.sync.set({ [ENGINE_KEY]: currentEngine });
}

function saveLanguage() {
  chrome.storage.sync.set({ [LANGUAGE_KEY]: currentLanguage });
}

function saveAutoAlign() {
  chrome.storage.sync.set({ [AUTO_ALIGN_KEY]: autoAlign });
}
function saveBookmarkSyncCount() {
  chrome.storage.sync.set({ [BOOKMARK_SYNC_COUNT_KEY]: bookmarkSyncCount });
}

function saveBackground() {
  chrome.storage.sync.set({ [BACKGROUND_KEY]: backgroundImage });
}

function load() {
  return new Promise(async resolve => {
    chrome.storage.sync.get([STORAGE_KEY, ENGINE_KEY, LANGUAGE_KEY, AUTO_ALIGN_KEY, BOOKMARK_SYNC_COUNT_KEY, BACKGROUND_KEY], async res => {
      items = res[STORAGE_KEY] || defaultItems();
      currentEngine = res[ENGINE_KEY] || "google";
      currentLanguage = res[LANGUAGE_KEY] || "auto";
      autoAlign = (typeof res[AUTO_ALIGN_KEY] !== "undefined") ? res[AUTO_ALIGN_KEY] : true;
      bookmarkSyncCount = (typeof res[BOOKMARK_SYNC_COUNT_KEY] !== "undefined") ? res[BOOKMARK_SYNC_COUNT_KEY] : 5;
      backgroundImage = res[BACKGROUND_KEY] || "";

      await loadBookmarks(bookmarkSyncCount); // Load bookmarks after loading stored items
      setupBookmarkSyncListeners(); // start syncing browser bookmarks -> extension items
      renderAll();
      applyBackground(backgroundImage);
      updateEngineUI();
      await localizePage(); // Localize after loading settings
      resolve();

      // Kick off background favicon fetch for items without icons
      fetchMissingFavicons();
    });
  });
}

function getMessageFor(key, substitutions) {
  if (messagesMapCache && messagesMapCache[key] !== undefined) return messagesMapCache[key];
  try {
    return chrome.i18n.getMessage(key, substitutions) || "";
  } catch (e) {
    return "";
  }
}

function applyBackground(src) {
  if (!src) {
    document.documentElement.style.setProperty('--custom-bg-image', 'none');
    backgroundImage = "";
    return;
  }
  // Use CSS url(...) and ensure proper quoting for data URLs
  const escaped = src.replace(/"/g, '\\"');
  document.documentElement.style.setProperty('--custom-bg-image', `url("${escaped}") center/cover no-repeat`);
  backgroundImage = src;
}

function defaultItems(){
  return [
    { id: uid(), name: chrome.i18n.getMessage("defaultItem1") || "YouTube", url: "https://www.youtube.com", col: 0, row: 0, icon: "" },
    { id: uid(), name: chrome.i18n.getMessage("defaultItem2") || "X", url: "https://x.com/X.", col: 1, row: 0, icon: "" }
  ];
}

function renderAll(){
  const board = document.getElementById("board");
  board.innerHTML = "";
  items.forEach(it => board.appendChild(makeTile(it)));
  if (autoAlign) autoAlignTiles();
}

// Calculate grid position from col/row
function getPosition(col, row) {
  // use computed left offset so the grid is centered with side gutters
  const left = currentLeftOffset + col * GRID;
  const top = TOP_OFFSET + row * GRID;
  return { left, top };
}

// Calculate col/row from pixel position
function getGridPosition(left, top) {
  // Translate pixel left into grid col using currentLeftOffset
  const col = Math.round((left - currentLeftOffset) / GRID);
  const row = Math.round((top - TOP_OFFSET) / GRID);
  return {
    col: Math.max(0, col),
    row: Math.max(0, row)
  };
}

// Check if position is occupied by another tile
function isPositionOccupied(col, row, excludeId) {
  return items.some(it => it.col === col && it.row === row && it.id !== excludeId);
}

// Find nearest free position
function findNearestFreePosition(targetCol, targetRow, excludeId) {
  // Try target position first
  if (!isPositionOccupied(targetCol, targetRow, excludeId)) {
    return { col: targetCol, row: targetRow };
  }
  
  // Search in expanding squares around target
  for (let radius = 1; radius < 20; radius++) {
    for (let dRow = -radius; dRow <= radius; dRow++) {
      for (let dCol = -radius; dCol <= radius; dCol++) {
        if (Math.abs(dRow) === radius || Math.abs(dCol) === radius) {
          const col = targetCol + dCol;
          const row = targetRow + dRow;
          if (col >= 0 && row >= 0 && !isPositionOccupied(col, row, excludeId)) {
            return { col, row };
          }
        }
      }
    }
  }
  
  return { col: targetCol, row: targetRow };
}

// Fetch favicon URL (return URL string if found, null otherwise)
async function fetchFavicon(url) {
  try {
    const urlObj = new URL(url);
    const baseUrl = `${urlObj.protocol}//${urlObj.host}`;
    const host = urlObj.host;

    // UA detection: prefer chrome://favicon only on Chrome desktop
    const ua = navigator.userAgent || "";
    const isEdge = ua.includes("Edg/");
    const isOpera = ua.includes("OPR/");
    const isChrome = ua.includes("Chrome") && !isEdge && !isOpera;

    // 1) chrome://favicon only on real Chrome (closest to bookmarks)
    if (isChrome) {
      try {
        const chromeFav = `chrome://favicon/128/${encodeURIComponent(url)}`;
        await testImageLoad(chromeFav, 1200);
        return chromeFav;
      } catch (e) {
        // fallthrough to other strategies
      }
    }

    // 2) Reliable third-party services (fast, no CORS)
    const thirdParty = [
      `https://www.google.com/s2/favicons?domain=${host}&sz=128`,
      `https://icons.duckduckgo.com/ip3/${host}.ico`
    ];
    for (const candidate of thirdParty) {
      try {
        await testImageLoad(candidate, 1500);
        return candidate;
      } catch (e) { /* try next */ }
    }

    // 3) Try standard site-hosted locations
    const siteCandidates = [
      `${baseUrl}/favicon.ico`,
      `${baseUrl}/apple-touch-icon.png`,
      `${baseUrl}/favicon.png`
    ];
    for (const candidate of siteCandidates) {
      try {
        await testImageLoad(candidate, 1800);
        return candidate;
      } catch (e) { /* try next */ }
    }

    // 4) Best-effort: fetch page and parse link/manifest (may fail due to CORS)
    try {
      const resp = await fetch(baseUrl, { method: "GET", mode: "cors" });
      if (resp.ok) {
        const html = await resp.text();
        const linkMatch = html.match(/<link[^>]+rel=["'](?:shortcut icon|icon|apple-touch-icon)["'][^>]*>/i);
        if (linkMatch) {
          const hrefMatch = linkMatch[0].match(/href=["']([^"']+)["']/i);
          if (hrefMatch && hrefMatch[1]) {
            const href = new URL(hrefMatch[1], baseUrl).href;
            try {
              await testImageLoad(href, 1800);
              return href;
            } catch (e) { /* ignore */ }
          }
        }
        const manifestMatch = html.match(/<link[^>]+rel=["']manifest["'][^>]*>/i);
        if (manifestMatch) {
          const hrefMatch = manifestMatch[0].match(/href=["']([^"']+)["']/i);
          if (hrefMatch && hrefMatch[1]) {
            const manifestUrl = new URL(hrefMatch[1], baseUrl).href;
            try {
              const mresp = await fetch(manifestUrl, { method: "GET", mode: "cors" });
              if (mresp.ok) {
                const manifest = await mresp.json();
                if (manifest.icons && manifest.icons.length) {
                  manifest.icons.sort((a,b) => {
                    const aSz = parseInt((a.sizes||"0").split("x")[0]) || 0;
                    const bSz = parseInt((b.sizes||"0").split("x")[0]) || 0;
                    return bSz - aSz;
                  });
                  for (const icon of manifest.icons) {
                    const iconUrl = new URL(icon.src, manifestUrl).href;
                    try {
                      await testImageLoad(iconUrl, 2000);
                      return iconUrl;
                    } catch (e) { /* try next */ }
                  }
                }
              }
            } catch (e) { /* ignore manifest errors/CORS */ }
          }
        }
      }
    } catch (e) {
      // network/CORS - ignore
    }

    return null;
  } catch (e) {
    return null;
  }
}

// Lightweight image load tester (no crossOrigin to avoid CORS console errors)
function testImageLoad(src, timeout = 2000) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    let timer = setTimeout(() => {
      img.onload = img.onerror = null;
      reject(new Error('timeout'));
    }, timeout);

    img.onload = () => {
      clearTimeout(timer);
      img.onload = img.onerror = null;
      resolve(true);
    };
    img.onerror = () => {
      clearTimeout(timer);
      img.onload = img.onerror = null;
      reject(new Error('error'));
    };
    img.src = src;
  });
}

// Read file as data URL
function readFileAsDataURL(file) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

// Update makeTile to handle icons with fallback for failed favicon loads
function makeTile(it) {
  const el = document.createElement("div");
  el.className = "tile";
  const pos = getPosition(it.col, it.row);
  el.style.left = pos.left + "px";
  el.style.top = pos.top + "px";
  el.dataset.id = it.id;

  const iconText = generateIconText(it.url, it.name, it.icon);
  const bg = colorFromString(it.url || it.name);

  el.innerHTML = `<div class="icon">${iconText}</div>
                  <div class="title">${escapeHtml(it.name)}</div>`;

  const iconEl = el.querySelector(".icon");
  if (it.icon && (it.icon.startsWith('http') || it.icon.startsWith('data:'))) {
    // Use provided icon (favicon URL or local data URL)
    iconEl.innerHTML = "";
    iconEl.style.background = "transparent";
    iconEl.style.color = "transparent";
    iconEl.style.textShadow = "none";

    const img = document.createElement('img');
    img.src = it.icon;
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.borderRadius = '14px';
    img.style.objectFit = 'cover';

    // On error, restore generated text/icon appearance
    img.onerror = () => {
      iconEl.innerHTML = iconText;
      iconEl.style.background = bg;
      iconEl.style.color = '#041218';
      iconEl.style.textShadow = '0 2px 8px rgba(0,0,0,0.4)';
    };

    iconEl.appendChild(img);
  } else {
    // Use generated text/icon and background
    iconEl.innerHTML = iconText;
    iconEl.style.background = bg;
    iconEl.style.color = '#041218';
    iconEl.style.textShadow = '0 2px 8px rgba(0,0,0,0.4)';
  }

  // Right-click context menu
  el.addEventListener("contextmenu", e => {
    e.preventDefault();
    showContextMenu(e.clientX, e.clientY, it.id);
  });

  // drag logic (pointer events)
  let startX, startY, origLeft, origTop;
  let dragThreshold = 5; // minimum movement to consider as drag
  let hasMoved = false;
  let wasDragged = false; // track if this was a drag operation
  
  el.addEventListener("pointerdown", e => {
    if (e.button !== 0) return; // only left button
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    startX = e.clientX; 
    startY = e.clientY;
    origLeft = el.offsetLeft; 
    origTop = el.offsetTop;
    hasMoved = false;
    wasDragged = false;
    el.dataset.dragging = "0";
    el.style.transition = "none";
    el.style.zIndex = "1000";
  });
  
  el.addEventListener("pointermove", e => {
    if (el.dataset.dragging === undefined) return;
    
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    
    // Check if moved beyond threshold
    if (!hasMoved && (Math.abs(dx) > dragThreshold || Math.abs(dy) > dragThreshold)) {
      hasMoved = true;
      wasDragged = true;
      el.dataset.dragging = "1";
    }
    
    if (hasMoved) {
      const nx = Math.max(8, origLeft + dx);
      const ny = Math.max(8, origTop + dy);
      el.style.left = nx + "px"; 
      el.style.top = ny + "px";
    }
  });
  
  el.addEventListener("pointerup", e => {
    if (el.dataset.dragging === undefined) return;
    
    const isDragging = el.dataset.dragging === "1";
    el.releasePointerCapture(e.pointerId);
    delete el.dataset.dragging;
    el.style.zIndex = "";
    
    if (isDragging) {
      // Calculate final position
      const gridPos = getGridPosition(el.offsetLeft, el.offsetTop);
      const it = items.find(i => i.id === el.dataset.id);
      
      if (autoAlign) {
        // Insert logic: move the dragged tile to the target position and shift subsequent tiles
        computeLayout();
        const targetIndex = gridPos.row * currentMaxCols + gridPos.col;
        
        // Sort items by their current grid index
        items.sort((a, b) => (a.row * currentMaxCols + a.col) - (b.row * currentMaxCols + b.col));
        
        // Remove the dragged item from its current position
        const currentIndex = items.indexOf(it);
        items.splice(currentIndex, 1);
        
        // Insert at the target index (or at the end if beyond)
        const insertIndex = Math.min(targetIndex, items.length);
        items.splice(insertIndex, 0, it);
        
        // Reassign compact positions
        let col = 0;
        let row = 0;
        items.forEach(item => {
          item.col = col;
          item.row = row;
          col++;
          if (col >= currentMaxCols) {
            col = 0;
            row++;
          }
        });
      } else {
        // Insert-with-shift behavior (like mobile app icon move):
        // If dropping onto an occupied tile, insert the dragged item at that tile's index
        // and shift that tile and subsequent tiles one position forward.
        const targetTile = items.find(t => t.col === gridPos.col && t.row === gridPos.row && t.id !== el.dataset.id);
        if (targetTile) {
          // Create a row-major sorted list
          const sorted = items.slice().sort((a,b) => (a.row*currentMaxCols + a.col) - (b.row*currentMaxCols + b.col));

          // Find index of target in sorted list
          const targetIndex = sorted.findIndex(s => s.id === targetTile.id);
          // Remove dragged item if present in sorted list
          const draggedIndex = sorted.findIndex(s => s.id === it.id);
          if (draggedIndex !== -1) sorted.splice(draggedIndex, 1);
          // Insert dragged item at targetIndex
          const insertIndex = Math.min(Math.max(0, targetIndex), sorted.length);
          sorted.splice(insertIndex, 0, it);

          // Reassign compact positions for the whole list and update DOM immediately
          let col = 0, row = 0;
          for (const s of sorted) {
            s.col = col;
            s.row = row;
            const elTile = document.querySelector(`[data-id="${s.id}"]`);
            if (elTile) {
              const pos = getPosition(s.col, s.row);
              elTile.style.transition = ""; // immediate move (CSS handles transitions)
              elTile.style.left = pos.left + "px";
              elTile.style.top = pos.top + "px";
            }
            col++;
            if (col >= currentMaxCols) { col = 0; row++; }
          }

          // Replace items array with the newly ordered list
          items = sorted;
        } else {
          // Drop on empty spot: find nearest free position as before
          const freePos = findNearestFreePosition(gridPos.col, gridPos.row, it.id);
          it.col = freePos.col;
          it.row = freePos.row;
        }
      }
      
      const finalPos = getPosition(it.col, it.row);
      el.style.transition = ""; // restore transition
      el.style.left = finalPos.left + "px"; 
      el.style.top = finalPos.top + "px";
      
      // Update storage
      save();
      
      // Auto-align if enabled (compact the layout)
      autoAlignTiles();
    } else {
      el.style.transition = "";
    }
    
    // Reset wasDragged flag after a short delay to allow click handler to read it
    setTimeout(() => {
      wasDragged = false;
    }, 200);
  });
  
  // open url on click (but avoid triggering when dragging)
  el.addEventListener("click", e => {
    e.preventDefault();
    // Only open URL if it wasn't a drag operation
    if (!wasDragged) {
      window.open(it.url, "_blank");
    }
  });
  
  return el;
}

// Context menu
function showContextMenu(x, y, itemId) {
  hideContextMenu();
  
  const menu = document.createElement("div");
  menu.className = "context-menu";
  menu.innerHTML = `
    <div class="context-item" data-action="edit-icon" data-i18n="editIconMenuItem">
      <span class="context-icon">🎨</span>
      <span></span>
    </div>
    <div class="context-item" data-action="delete" data-i18n="deleteMenuItem">
      <span class="context-icon">🗑️</span>
      <span></span>
    </div>
  `;
  
  const editText = getMessageFor("editIconMenuItem") || "Edit Icon";
  const deleteText = getMessageFor("deleteMenuItem") || "Delete";
  const editSpan = menu.querySelector('[data-i18n="editIconMenuItem"] span:last-child');
  const deleteSpan = menu.querySelector('[data-i18n="deleteMenuItem"] span:last-child');
  if (editSpan) editSpan.textContent = editText;
  if (deleteSpan) deleteSpan.textContent = deleteText;

  document.body.appendChild(menu);
  contextMenu = menu;
  
  // Position menu
  const menuRect = menu.getBoundingClientRect();
  const maxX = window.innerWidth - menuRect.width - 10;
  const maxY = window.innerHeight - menuRect.height - 10;
  
  menu.style.left = Math.min(x, maxX) + "px";
  menu.style.top = Math.min(y, maxY) + "px";
  
  // Show with animation
  setTimeout(() => menu.classList.add("show"), 10);
  
  // Handle actions
  menu.querySelector('[data-action="edit-icon"]').addEventListener("click", () => {
    showEditIconModal(itemId);
    hideContextMenu();
  });
  
  menu.querySelector('[data-action="delete"]').addEventListener("click", () => {
    items = items.filter(it => it.id !== itemId);
    save();
    renderAll();
    autoAlignTiles(); // Auto-align after deletion
    hideContextMenu();
  });
  
  // Close on click outside
  setTimeout(() => {
    document.addEventListener("click", hideContextMenu, { once: true });
  }, 10);
}

function showBoardContextMenu(x, y) {
  hideContextMenu();
  
  const key = autoAlign ? "disableAutoAlign" : "enableAutoAlign";
  const alignText = getMessageFor(key) || (autoAlign ? "Disable Auto Align" : "Enable Auto Align");
  const alignIcon = autoAlign ? '🔒' : '🔓';
  const addText = getMessageFor("addButton") || "Add";
  
  const menu = document.createElement("div");
  menu.className = "context-menu";
  menu.innerHTML = `
    <div class="context-item" data-action="add-favorite">
      <span class="context-icon">＋</span>
      <span></span>
    </div>
    <div class="context-item" data-action="toggle-auto-align">
      <span class="context-icon">${alignIcon}</span>
      <span></span>
    </div>
  `;
  
  // Localize the dynamic texts
  const addSpan = menu.querySelector('[data-action="add-favorite"] span:last-child');
  const textSpan = menu.querySelector('[data-action="toggle-auto-align"] span:last-child');
  if (addSpan) addSpan.textContent = addText;
  if (textSpan) textSpan.textContent = alignText;
  
  document.body.appendChild(menu);
  contextMenu = menu;
  
  // Position menu
  const menuRect = menu.getBoundingClientRect();
  const maxX = window.innerWidth - menuRect.width - 10;
  const maxY = window.innerHeight - menuRect.height - 10;
  
  menu.style.left = Math.min(x, maxX) + "px";
  menu.style.top = Math.min(y, maxY) + "px";
  
  // Show with animation
  setTimeout(() => menu.classList.add("show"), 10);
  
  // Handle actions
  menu.querySelector('[data-action="add-favorite"]').addEventListener("click", () => {
    const modal = document.getElementById("modal");
    if (modal) {
      modal.classList.remove("hidden");
      modal.setAttribute("aria-hidden", "false");
      const nameInput = document.getElementById("favName");
      if (nameInput) nameInput.focus();
    }
    closeSidebar();
    hideContextMenu();
  });
  
  menu.querySelector('[data-action="toggle-auto-align"]').addEventListener("click", () => {
    autoAlign = !autoAlign;
    saveAutoAlign();
    autoAlignTiles(); // Apply immediately if enabled
    hideContextMenu();
  });
  
  // Close on click outside (prevents premature hiding)
  setTimeout(() => {
    const closeHandler = (e) => {
      if (!menu.contains(e.target)) {
        hideContextMenu();
      }
    };
    document.addEventListener("click", closeHandler, { once: true });
  }, 10);
}

function hideContextMenu() {
  if (contextMenu) {
    contextMenu.classList.remove("show");
    setTimeout(() => {
      if (contextMenu && contextMenu.parentNode) {
        contextMenu.parentNode.removeChild(contextMenu);
      }
      contextMenu = null;
    }, 200);
  }
}

/* Scrollbar behavior: show compact thumb while user scrolls (wheel/touch),
   show full neon scrollbar when pointer is over the region, hide otherwise.
   The JS toggles '.scrolling' class during active wheel/touch scroll and removes it after timeout.
*/
function setupScrollbars() {
  const selectors = [
    document.getElementById('board'),
    document.querySelector('#modal .card'),
    document.querySelector('#settingsModal .card'),
    document.querySelector('#editIconModal .card')
  ].filter(Boolean);

  selectors.forEach(el => {
    // Ensure overflow styling exists (CSS handles max-height/overflow)
    el.style.webkitOverflowScrolling = 'touch';

    let scrollTimer = null;
    const SCROLL_CLASS = 'scrolling';
    const SCROLL_TIMEOUT = 700; // ms to keep compact thumb visible after last wheel/touch

    const onUserScroll = () => {
      // add 'scrolling' so compact thumb shows even if not hovered
      el.classList.add(SCROLL_CLASS);
      if (scrollTimer) clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        el.classList.remove(SCROLL_CLASS);
      }, SCROLL_TIMEOUT);
    };

    // Wheel, touchmove make scrollbar visible in compact mode
    el.addEventListener('wheel', onUserScroll, { passive: true });
    el.addEventListener('touchmove', onUserScroll, { passive: true });

    // Also when keyboard arrows/page keys scroll the element
    el.addEventListener('keydown', (e) => {
      const keys = ['ArrowDown','ArrowUp','PageDown','PageUp','Home','End'];
      if (keys.includes(e.key)) onUserScroll();
    });

    // When pointer enters, remove any lingering 'scrolling' (hover shows full scrollbar by CSS)
    el.addEventListener('pointerenter', () => {
      if (scrollTimer) { clearTimeout(scrollTimer); scrollTimer = null; }
      el.classList.remove(SCROLL_CLASS);
    });
    // When pointer leaves, ensure compact hides after timeout if no wheel
    el.addEventListener('pointerleave', () => {
      if (scrollTimer) clearTimeout(scrollTimer);
      // small delay to avoid jarring hide
      scrollTimer = setTimeout(() => el.classList.remove(SCROLL_CLASS), 120);
    });
  });
}

// generate initials like "YT" from url/name, use user-provided icon if it looks like emoji/char
function generateIconText(url, name, providedIcon){
  const hasIcon = (providedIcon || "").trim();
  if (hasIcon && /[^\w\s]/u.test(hasIcon)) return hasIcon.slice(0,2);

  let host = "";
  try {
    host = new URL(url).hostname;
  } catch (e) {
    host = (name || url || "").toString();
  }
  host = host.replace(/^(www|m)\./i, "").split(":")[0];

  const parts = host.split(/[\.\-_]/).filter(Boolean);
  if (parts.length >= 2) {
    const a = parts[0][0] || "";
    const b = parts[1][0] || "";
    return (a + b).toUpperCase();
  }
  const token = parts[0] || (name || "").replace(/\s+/g, "");
  if (!token) return "🔗";
  const first = token.charAt(0) || "";
  const last = token.charAt(token.length - 1) || "";
  return (first + (token.length > 1 ? last : "")).toUpperCase();
}

// deterministic two-color gradient based on string
function colorFromString(s){
  let h = 0;
  for (let i = 0; i < (s || "").length; i++){
    h = (h * 31 + s.charCodeAt(i)) % 360;
  }
  const h2 = (h + 60) % 360;
  return `linear-gradient(135deg, hsl(${h}deg 85% 60%), hsl(${h2}deg 80% 50%))`;
}

function escapeHtml(s){ return (s||"").toString().replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[c])); }

// Search engine functions
function updateEngineUI() {
  const engineNameEl = document.querySelector(".engine-name");
  const engineIconEl = document.querySelector(".engine-icon");
  if (currentEngine === "bing") {
    engineNameEl.textContent = "Bing";
    engineIconEl.textContent = "🔎";
  } else if (currentEngine === "baidu"){
    engineNameEl.textContent = "Baidu";
    engineIconEl.textContent = "🔎";
  }else {
    engineNameEl.textContent = "Google";
    engineIconEl.textContent = "🔎";
  }
}

function toggleEngine() {
  if (currentEngine === "google") currentEngine = "bing";
  else if (currentEngine === "bing") currentEngine = "baidu";
  else currentEngine = "google";
  saveEngine();
  updateEngineUI();
}

function performSearch(query) {
  if (!query.trim()) return;
  
  const encodedQuery = encodeURIComponent(query.trim());
  let searchUrl;
  
  if (currentEngine === "bing") {
    searchUrl = `https://www.bing.com/search?q=${encodedQuery}`;
  } else if (currentEngine === "baidu") {
    searchUrl = `https://www.baidu.com/s?wd=${encodedQuery}`;
  } else {
    searchUrl = `https://www.google.com/search?q=${encodedQuery}`;
  }
  
  window.open(searchUrl, "_blank");
}

// --- Third-party suggestions (Google Suggest) ---
// Debounce helper
function debounce(fn, wait) {
  let t = null;
  return function(...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

  // Fetch suggestions from Google Suggest API (no local history used)
async function fetchThirdPartySuggestions(query) {
  if (!query || !query.trim()) return [];
  const q = encodeURIComponent(query.trim());
  const url = `https://ac.duckduckgo.com/ac/?q=${q}&type=list`;

  try {
    // Proxy the request to the background service worker to avoid CORS issues.
    const resp = await new Promise(resolve => {
      chrome.runtime.sendMessage({ type: 'fetchSuggestions', url }, resolve);
    });

    if (!resp || !resp.ok) return [];

    let data = resp.data;
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch (e) {
      }
    }
    if (Array.isArray(data)) {
      const suggestions = data
        .map(item => (typeof item === 'string' ? item : (item.phrase || item.value || "")))
        .filter(Boolean);
      return suggestions.slice(0, 8);
    }

    return [];
  } catch (e) {
    return [];
  }
}


// UI functions for suggestions
async function updateSuggestionsFromRemote(query) {
  const box = document.getElementById("suggestions");
  if (!box) return;
  const q = (query || "").trim();
  if (!q) {
    box.style.display = "none";
    box.setAttribute("aria-hidden", "true");
    return;
  }

  const results = await fetchThirdPartySuggestions(q);
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
    div.innerHTML = `<span class="suggest-text">${escapeHtml(s)}</span>`;
    div.addEventListener("click", () => {
      const input = document.getElementById("searchInput");
      if (input) input.value = s;
      box.style.display = "none";
      box.setAttribute("aria-hidden", "true");
      // record no history; directly perform search using existing [`performSearch`](newtab.js)
      performSearch(s);
    });
    box.appendChild(div);
  });
  box.style.display = "block";
  box.setAttribute("aria-hidden", "false");
  box.dataset.activeIndex = "-1";
}

function moveSuggestion(delta) {
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
    // reflect in input field for preview (but do not persist)
    const input = document.getElementById("searchInput");
    if (input) input.value = itemsEls[idx].querySelector('.suggest-text').textContent;
  } else {
    box.dataset.activeIndex = "-1";
  }
}

function acceptActiveSuggestion() {
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

const debouncedRemoteSuggestions = debounce(updateSuggestionsFromRemote, 180);

// Language functions
function getEffectiveLocale() {
  if (currentLanguage === "auto") {
    return chrome.i18n.getUILanguage();
  }
  return currentLanguage;
}

function setLanguage(lang) {
  currentLanguage = lang;
  saveLanguage();
  // Reload the page to apply new language
  window.location.reload();
}

// Internationalization helper
async function localizePage() {
  // Load messages.json for a specific locale (returns map key->message or null)
  async function loadMessagesForLocale(locale) {
    try {
      const url = chrome.runtime.getURL(`_locales/${locale}/messages.json`);
      const resp = await fetch(url);
      if (!resp.ok) return null;
      const json = await resp.json();
      const map = {};
      for (const k in json) {
        if (json[k] && typeof json[k].message === 'string') map[k] = json[k].message;
      }
      return map;
    } catch (e) {
      return null;
    }
  }

  // If user selected a specific language, try to load that messages.json
  let messagesMap = null;
  if (currentLanguage && currentLanguage !== "auto") {
    messagesMap = await loadMessagesForLocale(currentLanguage);
  }

  messagesMapCache = messagesMap || null;

  // Fallback getter: prefer loaded messagesMap, otherwise use chrome.i18n
  function getMessage(key, substitutions) {
    if (messagesMap && messagesMap[key] !== undefined) return messagesMap[key];
    try {
      return chrome.i18n.getMessage(key, substitutions) || "";
    } catch (e) {
      return "";
    }
  }

  // Localize elements with data-i18n attribute
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const message = getMessage(key);
    if (message) el.textContent = message;
  });

  // Localize placeholders
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    const message = getMessage(key);
    if (message) el.placeholder = message;
  });

  // Localize titles
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    const message = getMessage(key);
    if (message) el.title = message;
  });

  // Localize select options
  document.querySelectorAll('option[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const message = getMessage(key);
    if (message) el.textContent = message;
  });

  return Promise.resolve();
}

// Sidebar functions
function toggleSidebar() {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebarOverlay");
  const toggle = document.getElementById("menuToggle");
  
  const isOpen = sidebar.classList.contains("open");
  
  if (isOpen) {
    sidebar.classList.remove("open");
    overlay.classList.remove("active");
    toggle.classList.remove("active");
  } else {
    sidebar.classList.add("open");
    overlay.classList.add("active");
    toggle.classList.add("active");
  }
}

function closeSidebar() {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebarOverlay");
  const toggle = document.getElementById("menuToggle");
  
  sidebar.classList.remove("open");
  overlay.classList.remove("active");
  toggle.classList.remove("active");
}

/* UI wiring */
document.addEventListener("DOMContentLoaded", async () => {
  // Load saved items, engine, and language, then localize
  await load();
  // compute initial layout and position tiles
  computeLayout();
  renderAll();
  // Recompute layout on resize and reflow tiles
  window.addEventListener('resize', () => {
    computeLayout();
    renderAll();
  });
  
  // Initialize custom scrollbar behavior
  setupScrollbars();

  // Set language select value after loading
  const languageSelect = document.getElementById("languageSelect");
  if (languageSelect) {
    languageSelect.value = currentLanguage;
  }

  // Set bookmark sync count input after loading
  const bookmarkSyncInput = document.getElementById("bookmarkSyncCount");
  if (bookmarkSyncInput) {
    bookmarkSyncInput.value = bookmarkSyncCount;
  }

  //  Set focus to search input (not available now)
  const searchInput = document.getElementById("searchInput");
  const suggestionsBox = document.getElementById("suggestions");
  const clearBtn = document.getElementById("clearSearch");

  // Clear-button behavior: show when mouse is over input or input is focused/non-empty
  if (searchInput && clearBtn) {
    const searchFormEl = document.getElementById("searchForm") || document.querySelector(".search-box");
    //const showClear = () => clearBtn.classList.add("visible");
    // Only show clear button when input contains non-empty text
    const showClear = () => {
      if (!searchInput) return;
      if (String(searchInput.value || "").trim().length > 0) {
        clearBtn.classList.add("visible");
      }
    };
    const hideClearIfEmpty = () => {
      if (!searchInput.value && document.activeElement !== searchInput) clearBtn.classList.remove("visible");
    };

    // Use pointerenter/pointerleave on the whole search form so moving between input and clearBtn
    // does not trigger a temporary hide.
    if (searchFormEl) {
      searchFormEl.addEventListener("pointerenter", showClear);
      searchFormEl.addEventListener("pointerleave", () => setTimeout(hideClearIfEmpty, 120));
    }

    // Also ensure clear button keeps the visible state while hovered
    clearBtn.addEventListener("pointerenter", showClear);
    clearBtn.addEventListener("pointerleave", () => setTimeout(hideClearIfEmpty, 120));

    // Focus/input behavior
    searchInput.addEventListener("focus", showClear);
    searchInput.addEventListener("blur", () => setTimeout(hideClearIfEmpty, 120));
    searchInput.addEventListener("input", () => {
      if (searchInput.value) showClear();
      else if (document.activeElement !== searchInput) clearBtn.classList.remove("visible");
    });

    // click to clear (hide suggestions and focus back)
    clearBtn.addEventListener("click", (e) => {
      e.preventDefault();
      searchInput.value = "";
      if (suggestionsBox) { suggestionsBox.style.display = "none"; suggestionsBox.setAttribute("aria-hidden","true"); }
      clearBtn.classList.remove("visible");
      searchInput.focus();
      // trigger input listeners to update state (e.g., suggestion fetch)
      const ev = new Event('input', { bubbles: true });
      searchInput.dispatchEvent(ev);
    });
  }

  // Wire third-party suggestion behavior (no local history used)
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      const v = e.target.value || "";
      debouncedRemoteSuggestions(v);
    });
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        moveSuggestion(1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        moveSuggestion(-1);
      } else if (e.key === "Enter") {
        // If a suggestion is active, accept it; otherwise let form submit handler run
        const accepted = acceptActiveSuggestion();
        if (accepted) e.preventDefault();
      } else if (e.key === "Escape") {
        if (suggestionsBox) { suggestionsBox.style.display = "none"; suggestionsBox.setAttribute("aria-hidden","true"); }
      }
    });
    searchInput.addEventListener("blur", () => {
      setTimeout(() => {
        if (suggestionsBox) { suggestionsBox.style.display = "none"; suggestionsBox.setAttribute("aria-hidden","true"); }
      }, 150);
    });
  }

  // Background UI wiring
  const backgroundUrlInput = document.getElementById("backgroundUrl");
  const backgroundFileBtn = document.getElementById("backgroundFileBtn");
  const backgroundFileInput = document.getElementById("backgroundFile");
  const backgroundFileName = document.getElementById("backgroundFileName");
  const backgroundClear = document.getElementById("backgroundClear");

  // pendingBackground holds the staged value (data URL or URL string)
  let pendingBackground = backgroundImage || "";

  // initialize preview and inputs
  if (backgroundUrlInput) backgroundUrlInput.value = (pendingBackground && !pendingBackground.startsWith('data:')) ? pendingBackground : "";

  if (backgroundFileBtn && backgroundFileInput) {
    backgroundFileBtn.addEventListener("click", () => backgroundFileInput.click());
    backgroundFileInput.addEventListener("change", async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      backgroundFileName.textContent = f.name;
      const data = await readFileAsDataURL(f);
      pendingBackground = data;
    });
  }

  if (backgroundUrlInput) {
    backgroundUrlInput.addEventListener("input", (e) => {
      const v = e.target.value.trim();
      pendingBackground = v || "";
    });
  }

  if (backgroundClear) {
    backgroundClear.addEventListener("click", () => {
      pendingBackground = "";
      if (backgroundUrlInput) backgroundUrlInput.value = "";
      if (backgroundFileInput) { backgroundFileInput.value = ""; backgroundFileName.textContent = ""; }
      if (backgroundFileName) backgroundFileName.textContent = "";
    });
  }

  const addBtn = document.getElementById("addBtn");
  const modal = document.getElementById("modal");
  const favForm = document.getElementById("favForm");
  const cancelBtn = document.getElementById("cancel");
  const resetBtn = document.getElementById("resetBtn");
  const settingsBtn = document.getElementById("settingsBtn");
  const settingsModal = document.getElementById("settingsModal");
  const settingsCancel = document.getElementById("settingsCancel");
  const settingsApply = document.getElementById("settingsApply");
  const exportBtn = document.getElementById("exportBtn");
  const importBtn = document.getElementById("importBtn");
  const importFile = document.getElementById("importFile");
  // Custom file-picker for Add Favorite modal (styled button + filename)
  const favLocalIconInput = document.getElementById("favLocalIcon");
  const favLocalIconBtn = document.getElementById("favLocalIconBtn");
  const favLocalIconName = document.getElementById("favLocalIconName");

  if (favLocalIconBtn && favLocalIconInput) {
    favLocalIconBtn.addEventListener("click", () => favLocalIconInput.click());
    favLocalIconInput.addEventListener("change", (e) => {
      const f = e.target.files[0];
      favLocalIconName.textContent = f ? f.name : "";
    });
  }
  
  // Sidebar functionality
  menuToggle.addEventListener("click", toggleSidebar);
  sidebarOverlay.addEventListener("click", closeSidebar);
  
  // Search functionality
  searchForm.addEventListener("submit", e => {
    e.preventDefault();
    const q = (searchInput || {}).value || "";
    if (!q.trim()) return;
    // Directly perform search against external engine; do not record local history
    performSearch(q);
    if (searchInput) { searchInput.value = ""; searchInput.blur(); }
    if (suggestionsBox) { suggestionsBox.style.display = "none"; suggestionsBox.setAttribute("aria-hidden","true"); }
  });

  engineToggle.addEventListener("click", () => {
    toggleEngine();
  });

  (function() {
    const searchInputEl = document.getElementById("searchInput");
    if (!searchInputEl) return;
    searchInputEl.addEventListener("keydown", (e) => {
      if (e.key === "Tab") {
        e.preventDefault();
        toggleEngine();
        setTimeout(() => searchInputEl.focus(), 0);
      }
    });
  })();

  // Focus search input on "/" key
  document.addEventListener("keydown", e => {
    if (e.key === "/" && !modal.classList.contains("hidden") && !settingsModal.classList.contains("hidden")) return;
    if (e.key === "/" && document.activeElement !== searchInput) {
      e.preventDefault();
      searchInput.focus();
    }
    
    // Close context menu on Escape
    if (e.key === "Escape") {
      hideContextMenu();
      closeSidebar();
    }
  });

  addBtn.addEventListener("click", ()=> {
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
    document.getElementById("favName").focus();
    closeSidebar();
  });
  
  cancelBtn.addEventListener("click", ()=> {
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
    favForm.reset();
    if (typeof favLocalIconName !== "undefined") favLocalIconName.textContent = "";
  });
  
  favForm.addEventListener("submit", async e => {
    e.preventDefault();
    const name = document.getElementById("favName").value.trim();
    let url = document.getElementById("favURL").value.trim();
    // No manual emoji/char input anymore.
    const localIconFile = document.getElementById("favLocalIcon").files[0];
    
    if (!/^https?:\/\//.test(url)) url = "https://" + url;
    
    // Determine icon: prefer local file, otherwise try to fetch favicon, fallback to generated
    let finalIcon = "";
    if (localIconFile) {
      finalIcon = await readFileAsDataURL(localIconFile);
    } else {
      const favicon = await fetchFavicon(url);
      if (favicon) finalIcon = favicon;
    }
    
    // Find first available grid position
    let col = 0, row = 0;
    while (isPositionOccupied(col, row)) {
      col++;
      if (col > 10) { // max 11 items per row
        col = 0;
        row++;
      }
    }
    
    items.push({ id: uid(), name, url, col, row, icon: finalIcon });
    save();
    renderAll();
    autoAlignTiles(); // Auto-align after adding
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
    favForm.reset();
    if (typeof favLocalIconName !== "undefined") favLocalIconName.textContent = "";
  });

  resetBtn.addEventListener("click", async ()=> {
    const confirmMessage = chrome.i18n.getMessage("resetConfirm") || "Reset to defaults?";
    if (!confirm(confirmMessage)) return;
    items = defaultItems();
    await loadBookmarks(); // Add bookmarks after resetting to defaults
    save();
    renderAll();
    autoAlignTiles(); // Auto-align after reset
    // After reset, attempt to populate website icons for default items
    fetchMissingFavicons();
    closeSidebar();
  });

  // Settings functionality
  settingsBtn.addEventListener("click", () => {
    settingsModal.classList.remove("hidden");
    settingsModal.setAttribute("aria-hidden", "false");
    closeSidebar();
  });

  settingsCancel.addEventListener("click", () => {
    settingsModal.classList.add("hidden");
    settingsModal.setAttribute("aria-hidden", "true");
  });

  settingsApply.addEventListener("click", async () => {
    const selectedLang = languageSelect.value;
    setLanguage(selectedLang);

    // Read and persist bookmark sync count
    const input = document.getElementById("bookmarkSyncCount");
    if (input) {
      const v = parseInt(input.value, 10);
      bookmarkSyncCount = (isNaN(v) || v < 0) ? 0 : Math.min(50, v);
      saveBookmarkSyncCount();
      // Re-run bookmark load with new limit and re-render
      await loadBookmarks(bookmarkSyncCount);
      renderAll();
      autoAlignTiles();
    }

    if (typeof pendingBackground !== "undefined") {
      backgroundImage = pendingBackground || "";
      saveBackground();
      applyBackground(backgroundImage);
    }
  });

  // Export/Import functionality
  exportBtn.addEventListener("click", exportSettings);

  importBtn.addEventListener("click", () => {
    importFile.click();
  });

  importFile.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) {
      importSettings(file);
      // Reset file input
      e.target.value = "";
    }
  });

  // Hide context menu when clicking anywhere
  document.addEventListener("contextmenu", (e) => {
    // Ignore right-clicks that originate from tiles, the board (handled separately),
    // or the context menu itself so the menu doesn't immediately hide after being shown.
    if (e.target.closest(".context-menu")) return;
    if (e.target.closest(".tile")) return;
    if (e.target.closest("#board")) return;
    hideContextMenu();
  });
  
  // Right-click on board (empty space)
  board.addEventListener("contextmenu", (e) => {
    if (!e.target.closest(".tile")) {
      e.preventDefault();
      showBoardContextMenu(e.clientX, e.clientY);
    }
  });
});

// Load first N bookmarks from bookmarks bar (if available and not already in items)
// If limit === 0, skip importing any bookmarks.
async function loadBookmarks(limit = bookmarkSyncCount) {
  if (!chrome.bookmarks) return; // Skip if permission not granted or not available

  try {
    const tree = await new Promise(resolve => chrome.bookmarks.getTree(resolve));
    const bookmarksBar = tree[0].children.find(child => child.title === 'Bookmarks bar' || child.id === '1');
    if (bookmarksBar && bookmarksBar.children) {
      const bookmarks = bookmarksBar.children.filter(child => child.url); // only bookmarks
      const toConsider = (limit > 0) ? bookmarks.slice(0, limit) : [];

      // Remove previously imported bookmarks that are now outside the new limit
      const allowedIds = new Set(toConsider.map(b => b.id));
      let removed = false;
      items = items.filter(it => {
        if (it.bookmarkId && !allowedIds.has(it.bookmarkId)) {
          removed = true;
          return false;
        }
        return true;
      });
      if (removed) {
        save();
      }

      // Add/bind the allowed bookmarks
      toConsider.forEach(bookmark => {
        // If an existing item has the same URL, bind its bookmarkId so it will be synced
        const existing = items.find(it => it.url === bookmark.url);
        if (existing) {
          if (!existing.bookmarkId) existing.bookmarkId = bookmark.id;
          return;
        }

        // Skip if already tracked by bookmarkId (safety)
        if (items.some(it => it.bookmarkId === bookmark.id || it.url === bookmark.url)) return;

        // Find first available grid position
        let col = 0, row = 0;
        while (isPositionOccupied(col, row)) {
          col++;
          if (col > 10) { col = 0; row++; }
        }

        items.push({
          id: uid(),
          name: bookmark.title,
          url: bookmark.url,
          col,
          row,
          icon: "",
          bookmarkId: bookmark.id
        });
      });

      // Persist if we added any
      save();
    }
  } catch (error) {
    console.error('Error loading bookmarks:', error);
  }
}

// Export settings to JSON file
function exportSettings() {
  const data = {
    items,
    currentEngine,
    currentLanguage
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
  // Show success message
  alert(chrome.i18n.getMessage("exportSuccess") || "Settings exported successfully!");
}

// Import settings from JSON file
function importSettings(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (data.items) items = data.items;
      if (data.currentEngine) currentEngine = data.currentEngine;
      if (data.currentLanguage) currentLanguage = data.currentLanguage;
      save();
      saveEngine();
      saveLanguage();
      renderAll();
      updateEngineUI();
      localizePage();
      alert(chrome.i18n.getMessage("importSuccess") || "Settings imported successfully!");
    } catch (error) {
      alert(chrome.i18n.getMessage("importError") || "Failed to import settings. Please check the file format.");
    }
  };
  reader.readAsText(file);
}

// Show Edit Icon modal
function showEditIconModal(itemId) {
  const modal = document.getElementById("editIconModal");
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  modal.dataset.itemId = itemId;
  
  const useLocalIconBtn = document.getElementById("useLocalIcon");
  const editLocalIconInput = document.getElementById("editLocalIcon");
  
  useLocalIconBtn.onclick = () => editLocalIconInput.click();
  editLocalIconInput.onchange = () => {
    // Trigger apply when file selected
    document.getElementById("editIconApply").click();
  };
}

// Apply icon changes
async function applyIconChange(itemId, iconType) {
  const idx = items.findIndex(it => it.id === itemId);
  if (idx === -1) return false;

  const it = items[idx];
  let newIcon = "";

  if (iconType === "default") {
    newIcon = ""; // Use generated
  } else if (iconType === "website") {
    const fav = await fetchFavicon(it.url);
    if (!fav) {
      return false;
    }
    newIcon = fav;
  } else if (iconType === "local") {
    const file = document.getElementById("editLocalIcon").files[0];
    if (file) {
      try {
        newIcon = await readFileAsDataURL(file);
      } catch (e) {
        return false;
      }
    } else if (typeof iconType === 'string' && iconType.startsWith('extension:')) {
      const filename = iconType.split(':')[1];
      if (!filename) return false;
      newIcon = extensionAsset(filename); // chrome.runtime.getURL('icons/...')
    } else {
      return false;
    }
  }

  items[idx].icon = newIcon;
  save();
  renderAll();
  return true;
}

// Edit Icon modal handlers (show immediate alert on failure and keep modal open)
document.getElementById("useDefaultIcon").addEventListener("click", () => {
  const itemId = document.getElementById("editIconModal").dataset.itemId;
  applyIconChange(itemId, "default");
  document.getElementById("editIconModal").classList.add("hidden");
});

document.getElementById("useWebsiteIcon").addEventListener("click", async () => {
  const itemId = document.getElementById("editIconModal").dataset.itemId;
  const ok = await applyIconChange(itemId, "website");
  if (!ok) {
    alert(chrome.i18n.getMessage("faviconFetchFailed") || "Failed to fetch website icon. Using default.");
    return; // keep modal open
  }
  document.getElementById("editIconModal").classList.add("hidden");
});

document.getElementById("editIconApply").addEventListener("click", async () => {
  const itemId = document.getElementById("editIconModal").dataset.itemId;
  const file = document.getElementById("editLocalIcon").files[0];
  if (file) {
    const ok = await applyIconChange(itemId, "local");
    if (!ok) {
      alert(chrome.i18n.getMessage("faviconFetchFailed") || "Failed to apply local icon.");
      return; // keep modal open so user can retry
    }
  }
  document.getElementById("editIconModal").classList.add("hidden");
});

document.getElementById("editIconCancel").addEventListener("click", () => {
  document.getElementById("editIconModal").classList.add("hidden");
});

function autoAlignTiles() {
  if (!autoAlign) return;
  computeLayout();
  items.sort((a, b) => (a.row * currentMaxCols + a.col) - (b.row * currentMaxCols + b.col));

  let col = 0, row = 0;
  for (const it of items) {
    it.col = col;
    it.row = row;
    const el = document.querySelector(`[data-id="${it.id}"]`);
    if (el) {
      const pos = getPosition(it.col, it.row);
      el.style.transition = "";
      el.style.left = pos.left + "px";
      el.style.top = pos.top + "px";
    }
    col++;
    if (col >= currentMaxCols) { col = 0; row++; }
  }

  save();
}

// Background helper: fetch missing favicons for items without icon and update UI/storage.
function fetchMissingFavicons() {
  // run in background; non-blocking
  items.filter(it => !it.icon).forEach(async (it) => {
    try {
      const fav = await fetchFavicon(it.url);
      if (!fav) return;
      // update model and persist
      it.icon = fav;
      save();

      // update DOM if tile present
      const tile = document.querySelector(`[data-id="${it.id}"]`);
      if (!tile) return;
      const iconEl = tile.querySelector(".icon");
      if (!iconEl) return;

      // Clear previous generated text/icon styling so the image is visible immediately.
      // (makeTile sets these when an item already had an icon; ensure parity here)
      iconEl.innerHTML = "";
      iconEl.style.background = "transparent";
      iconEl.style.color = "transparent";
      iconEl.style.textShadow = "none";

      const img = document.createElement("img");
      img.src = fav;
      img.style.width = "100%";
      img.style.height = "100%";
      img.style.borderRadius = "14px";
      img.style.objectFit = "cover";

      img.onload = () => {
        // image loaded successfully — nothing else needed because we cleared container styles above
      };

      img.onerror = () => {
        // fallback to generated text if image load fails
        iconEl.innerHTML = generateIconText(it.url, it.name, it.icon);
        iconEl.style.background = colorFromString(it.url || it.name);
        iconEl.style.color = '#041218';
        iconEl.style.textShadow = '0 2px 8px rgba(0,0,0,0.4)';
      };

      iconEl.appendChild(img);
    } catch (e) {
      console.debug("favicon load failed for", it.url, e);
    }
  });
}

// New: keep in sync with browser bookmarks (create / change / remove)
function setupBookmarkSyncListeners() {
  if (!chrome.bookmarks) return;

  // When a bookmark is removed -> remove corresponding item(s)
  chrome.bookmarks.onRemoved.addListener((id, removeInfo) => {
    let removed = false;
    items = items.filter(it => {
      if (it.bookmarkId === id) {
        removed = true;
        return false;
      }
      return true;
    });
    if (removed) {
      save();
      renderAll();
      autoAlignTiles();
    }
  });

  // When a bookmark is changed (title/url) -> update corresponding item
  chrome.bookmarks.onChanged.addListener((id, changeInfo) => {
    const idx = items.findIndex(it => it.bookmarkId === id);
    if (idx !== -1) {
      if (changeInfo.title !== undefined) items[idx].name = changeInfo.title;
      if (changeInfo.url !== undefined) {
        items[idx].url = changeInfo.url;
        items[idx].icon = ""; // clear icon so we will re-fetch
        fetchMissingFavicons();
      }
      save();
      renderAll();
    }
  });

  // When a bookmark is created -> add it (if within configured sync count)
  chrome.bookmarks.onCreated.addListener((id, bookmark) => {
    if (!bookmark.url) return;
    // Count current tracked bookmarks
    const trackedCount = items.filter(it => it.bookmarkId).length;
    if (trackedCount >= bookmarkSyncCount) return; // respect user-configured limit

    // Skip if already tracked
    if (items.some(it => it.bookmarkId === id || it.url === bookmark.url)) return;

    // Find first available grid position
    let col = 0, row = 0;
    while (isPositionOccupied(col, row)) {
      col++;
      if (col > 10) { col = 0; row++; }
    }

    const newItem = {
      id: uid(),
      name: bookmark.title || bookmark.url,
      url: bookmark.url,
      col,
      row,
      icon: "",
      bookmarkId: id
    };

    items.push(newItem);
    save();
    renderAll();
    autoAlignTiles();
    fetchMissingFavicons();
  });

  // Optional: react to moved events if you want to track folder placement — currently ignored
  chrome.bookmarks.onMoved.addListener((id, moveInfo) => {
    // no-op for now
  });
}