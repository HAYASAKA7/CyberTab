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
const STORAGE_KEY = "cyber_we_tab_items";
const ENGINE_KEY = "cyber_we_tab_engine";
const LANGUAGE_KEY = "cyber_we_tab_language";
const AUTO_ALIGN_KEY = "cyber_we_tab_auto_align";

let items = []; // saved tiles: {id,name,url,col,row,icon}
let currentEngine = "google"; // "google" or "bing"
let currentLanguage = "auto"; // "auto", "en", "zh_CN", "jp"
let autoAlign = true; // whether to auto-align tiles
let contextMenu = null; // reference to context menu element

function uid(){
  return (crypto && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).slice(2,9);
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

function load() {
  return new Promise(async resolve => {
    chrome.storage.sync.get([STORAGE_KEY, ENGINE_KEY, LANGUAGE_KEY, AUTO_ALIGN_KEY], async res => {
      items = res[STORAGE_KEY] || defaultItems();
      currentEngine = res[ENGINE_KEY] || "google";
      currentLanguage = res[LANGUAGE_KEY] || "auto";
      autoAlign = (typeof res[AUTO_ALIGN_KEY] !== "undefined") ? res[AUTO_ALIGN_KEY] : true;
      await loadBookmarks(); // Load bookmarks after loading stored items
      renderAll();
      updateEngineUI();
      await localizePage(); // Localize after loading settings
      resolve();

      // Kick off background favicon fetch for items without icons
      // (extracted to helper so reset flow can reuse it)
      fetchMissingFavicons();
    });
  });
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
  return {
    left: col * GRID + SIDE_MARGIN,
    top: row * GRID + TOP_OFFSET
  };
}

// Calculate col/row from pixel position
function getGridPosition(left, top) {
  const col = Math.round((left - SIDE_MARGIN) / GRID);
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

    // 1) Prefer browser's own favicon proxy so result matches bookmarks/favorites
    try {
      const chromeFav = `chrome://favicon/128/${encodeURIComponent(url)}`;
      await testImageLoad(chromeFav, 1500);
      return chromeFav;
    } catch (e) {
      // continue to other candidates
    }

    // 2) Reliable third-party services
    const thirdParty = [
      `https://www.google.com/s2/favicons?domain=${host}&sz=128`,
      `https://icons.duckduckgo.com/ip3/${host}.ico`
    ];

    for (const faviconUrl of thirdParty) {
      try {
        await testImageLoad(faviconUrl, 2000);
        return faviconUrl;
      } catch (e) { /* try next */ }
    }

    // 3) Site-hosted candidates
    const siteCandidates = [
      `${baseUrl}/favicon.ico`,
      `${baseUrl}/apple-touch-icon.png`,
      `${baseUrl}/favicon.png`
    ];

    for (const faviconUrl of siteCandidates) {
      try {
        await testImageLoad(faviconUrl, 2500);
        return faviconUrl;
      } catch (e) { /* try next */ }
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
    const img = document.createElement('img');
    img.src = it.icon;
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.borderRadius = '14px';
    img.style.objectFit = 'cover';
    img.onerror = () => {
      // Fallback to generated icon if image fails to load
      iconEl.innerHTML = iconText;
      iconEl.style.background = bg;
    };
    iconEl.innerHTML = '';
    iconEl.appendChild(img);
  } else {
    // Use generated text
    iconEl.style.background = bg;
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
        const maxCols = 11;
        const targetIndex = gridPos.row * maxCols + gridPos.col;
        
        // Sort items by their current grid index
        items.sort((a, b) => (a.row * maxCols + a.col) - (b.row * maxCols + b.col));
        
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
          if (col >= maxCols) {
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
          const maxCols = 11;
          // Create a row-major sorted list
          const sorted = items.slice().sort((a,b) => (a.row*maxCols + a.col) - (b.row*maxCols + b.col));

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
            if (col >= maxCols) { col = 0; row++; }
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
  
  // Fill localized texts for dynamic menu items (use chrome.i18n so it follows language setting)
  const editSpan = menu.querySelector('[data-i18n="editIconMenuItem"] span:last-child');
  const deleteSpan = menu.querySelector('[data-i18n="deleteMenuItem"] span:last-child');
  if (editSpan) editSpan.textContent = chrome.i18n.getMessage("editIconMenuItem") || "Edit Icon";
  if (deleteSpan) deleteSpan.textContent = chrome.i18n.getMessage("deleteMenuItem") || "Delete";

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
  const alignText = chrome.i18n.getMessage(key) || (autoAlign ? "Disable Auto Align" : "Enable Auto Align");
  const alignIcon = autoAlign ? '🔒' : '🔓';
  const addText = chrome.i18n.getMessage("addButton") || "Add";
  
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
  } else {
    engineNameEl.textContent = "Google";
    engineIconEl.textContent = "🔍";
  }
}

function toggleEngine() {
  currentEngine = currentEngine === "google" ? "bing" : "google";
  saveEngine();
  updateEngineUI();
}

function performSearch(query) {
  if (!query.trim()) return;
  
  const encodedQuery = encodeURIComponent(query.trim());
  let searchUrl;
  
  if (currentEngine === "bing") {
    searchUrl = `https://www.bing.com/search?q=${encodedQuery}`;
  } else {
    searchUrl = `https://www.google.com/search?q=${encodedQuery}`;
  }
  
  window.open(searchUrl, "_blank");
}

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
  const effectiveLocale = getEffectiveLocale();
  
  let messages = {};
  
  // Load messages for the effective locale
  try {
    const response = await fetch(`_locales/${effectiveLocale}/messages.json`);
    if (response.ok) {
      messages = await response.json();
    } else {
      console.warn(`Failed to load messages for locale: ${effectiveLocale}`);
    }
  } catch (error) {
    console.error('Error loading locale messages:', error);
  }
  
  // Helper function to get message from loaded messages or fallback to chrome.i18n
  function getMessage(key, substitutions) {
    if (messages[key] && messages[key].message) {
      let msg = messages[key].message;
      if (substitutions && Array.isArray(substitutions)) {
        substitutions.forEach((sub, index) => {
          msg = msg.replace(new RegExp(`\\$${index + 1}`, 'g'), sub);
        });
      }
      return msg;
    }
    // Fallback to chrome.i18n
    return chrome.i18n.getMessage(key, substitutions);
  }
  
  // Localize elements with data-i18n attribute
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const message = getMessage(key);
    if (message) {
      el.textContent = message;
    }
  });
  
  // Localize placeholders
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    const message = getMessage(key);
    if (message) {
      el.placeholder = message;
    }
  });
  
  // Localize titles
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    const message = getMessage(key);
    if (message) {
      el.title = message;
    }
  });
  
  // Localize select options
  document.querySelectorAll('option[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const message = getMessage(key);
    if (message) {
      el.textContent = message;
    }
  });
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
  
  // Set language select value after loading
  const languageSelect = document.getElementById("languageSelect");
  if (languageSelect) {
    languageSelect.value = currentLanguage;
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
    performSearch(searchInput.value);
    searchInput.value = "";
    searchInput.blur();
  });

  engineToggle.addEventListener("click", () => {
    toggleEngine();
  });

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

  settingsApply.addEventListener("click", () => {
    const selectedLang = languageSelect.value;
    setLanguage(selectedLang);
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

// Load first 5 bookmarks from bookmarks bar (if available and not already in items)
async function loadBookmarks() {
  if (!chrome.bookmarks) return; // Skip if permission not granted or not available
  
  try {
    const tree = await new Promise(resolve => chrome.bookmarks.getTree(resolve));
    const bookmarksBar = tree[0].children.find(child => child.title === 'Bookmarks bar' || child.id === '1'); // Typically ID 1 is the bookmarks bar
    if (bookmarksBar && bookmarksBar.children) {
      const bookmarks = bookmarksBar.children.filter(child => child.url); // Only bookmarks (not folders)
      const toAdd = bookmarks.slice(0, 5); // First 5 (or all if fewer)
      
      toAdd.forEach(bookmark => {
        // Skip if already in items (by URL)
        if (!items.some(it => it.url === bookmark.url)) {
          // Find first available grid position
          let col = 0, row = 0;
          while (isPositionOccupied(col, row)) {
            col++;
            if (col > 10) { // Max 11 items per row
              col = 0;
              row++;
            }
          }
          
          items.push({
            id: uid(),
            name: bookmark.title,
            url: bookmark.url,
            col,
            row,
            icon: "" // Let generateIconText handle icon
          });
        }
      });
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
      // signal failure to caller so it can alert immediately and keep modal open
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

  const maxCols = 11;
  items.sort((a, b) => (a.row * maxCols + a.col) - (b.row * maxCols + b.col));

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
    if (col >= maxCols) { col = 0; row++; }
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
      const img = document.createElement("img");
      img.src = fav;
      img.style.width = "100%";
      img.style.height = "100%";
      img.style.borderRadius = "14px";
      img.style.objectFit = "cover";
      img.onerror = () => {
        // fallback to generated text if image load fails
        iconEl.innerHTML = generateIconText(it.url, it.name, it.icon);
        iconEl.style.background = colorFromString(it.url || it.name);
      };
      iconEl.innerHTML = "";
      iconEl.appendChild(img);
    } catch (e) {
      console.debug("favicon load failed for", it.url, e);
    }
  });
}