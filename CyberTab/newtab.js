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
const TILE_SIZE = 120; // tile width/height
const STORAGE_KEY = "cyber_we_tab_items";
const ENGINE_KEY = "cyber_we_tab_engine";
const LANGUAGE_KEY = "cyber_we_tab_language";

let items = []; // saved tiles: {id,name,url,col,row,icon}
let currentEngine = "google"; // "google" or "bing"
let currentLanguage = "auto"; // "auto", "en", "zh_CN", "jp"
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

function load() {
  return new Promise(async resolve => {
    chrome.storage.sync.get([STORAGE_KEY, ENGINE_KEY, LANGUAGE_KEY], async res => {
      items = res[STORAGE_KEY] || defaultItems();
      currentEngine = res[ENGINE_KEY] || "google";
      currentLanguage = res[LANGUAGE_KEY] || "auto";
      await loadBookmarks(); // Load bookmarks after loading stored items
      renderAll();
      updateEngineUI();
      await localizePage(); // Localize after loading settings
      resolve();
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
}

// Calculate grid position from col/row
function getPosition(col, row) {
  return {
    left: col * GRID + 32,
    top: row * GRID + 32
  };
}

// Calculate col/row from pixel position
function getGridPosition(left, top) {
  const col = Math.round((left - 32) / GRID);
  const row = Math.round((top - 32) / GRID);
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

function makeTile(it){
  const el = document.createElement("div");
  el.className = "tile";
  const pos = getPosition(it.col, it.row);
  el.style.left = pos.left + "px";
  el.style.top = pos.top + "px";
  el.dataset.id = it.id;

  const iconText = generateIconText(it.url, it.name, it.icon);
  const bg = colorFromString(it.url || it.name);

  el.innerHTML = `<div class="icon">${escapeHtml(iconText)}</div>
                  <div class="title">${escapeHtml(it.name)}</div>`;

  const iconEl = el.querySelector(".icon");
  iconEl.style.background = bg;

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
      // snap to grid
      const gridPos = getGridPosition(el.offsetLeft, el.offsetTop);
      const freePos = findNearestFreePosition(gridPos.col, gridPos.row, it.id);
      const finalPos = getPosition(freePos.col, freePos.row);
      
      el.style.transition = ""; // restore transition
      el.style.left = finalPos.left + "px"; 
      el.style.top = finalPos.top + "px";
      
      // update storage
      const idx = items.findIndex(x => x.id === it.id);
      if (idx !== -1) {
        items[idx].col = freePos.col;
        items[idx].row = freePos.row;
        save();
      }
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
    <div class="context-item" data-action="delete">
      <span class="context-icon">🗑️</span>
      <span data-i18n="deleteMenuItem">Delete</span>
    </div>
  `;
  
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
  menu.querySelector('[data-action="delete"]').addEventListener("click", () => {
    items = items.filter(it => it.id !== itemId);
    save();
    renderAll();
    hideContextMenu();
  });
  
  // Close on click outside
  setTimeout(() => {
    document.addEventListener("click", hideContextMenu, { once: true });
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
  const menuToggle = document.getElementById("menuToggle");
  const sidebarOverlay = document.getElementById("sidebarOverlay");
  const searchForm = document.getElementById("searchForm");
  const searchInput = document.getElementById("searchInput");
  const engineToggle = document.getElementById("engineToggle");

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
  });

  favForm.addEventListener("submit", e=>{
    e.preventDefault();
    const name = document.getElementById("favName").value.trim();
    let url = document.getElementById("favURL").value.trim();
    const icon = document.getElementById("favIcon").value.trim();
    if (!/^https?:\/\//.test(url)) url = "https://"+url;
    const id = uid();
    
    // Find first available grid position
    let col = 0, row = 0;
    while (isPositionOccupied(col, row)) {
      col++;
      if (col > 10) { // max 11 items per row
        col = 0;
        row++;
      }
    }
    
    items.push({ id, name, url, col, row, icon });
    save();
    renderAll();
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
    favForm.reset();
  });

  resetBtn.addEventListener("click", ()=>{
    const confirmMessage = chrome.i18n.getMessage("resetConfirm") || "Reset to defaults?";
    if (!confirm(confirmMessage)) return;
    items = defaultItems();
    save(); renderAll();
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
    if (!e.target.closest(".tile")) {
      hideContextMenu();
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