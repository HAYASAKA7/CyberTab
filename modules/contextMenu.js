// Context menu management module

export class ContextMenuManager {
  constructor(i18nManager, callbacks) {
    this.i18nManager = i18nManager;
    this.callbacks = callbacks;
    this.contextMenu = null;
  }

  showContextMenu(x, y, itemId) {
    this.hideContextMenu();
    
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
    
    const editText = this.i18nManager.getMessage("editIconMenuItem") || "Edit Icon";
    const deleteText = this.i18nManager.getMessage("deleteMenuItem") || "Delete";
    const editSpan = menu.querySelector('[data-i18n="editIconMenuItem"] span:last-child');
    const deleteSpan = menu.querySelector('[data-i18n="deleteMenuItem"] span:last-child');
    if (editSpan) editSpan.textContent = editText;
    if (deleteSpan) deleteSpan.textContent = deleteText;

    document.body.appendChild(menu);
    this.contextMenu = menu;
    
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
      if (this.callbacks.onShowEditIconModal) {
        this.callbacks.onShowEditIconModal(itemId);
      }
      this.hideContextMenu();
    });
    
    menu.querySelector('[data-action="delete"]').addEventListener("click", () => {
      if (this.callbacks.onDeleteItem) {
        this.callbacks.onDeleteItem(itemId);
      }
      this.hideContextMenu();
    });
    
    // Close on click outside
    setTimeout(() => {
      document.addEventListener("click", () => this.hideContextMenu(), { once: true });
    }, 10);
  }

  showBoardContextMenu(x, y, autoAlign) {
    this.hideContextMenu();
    
    const key = autoAlign ? "disableAutoAlign" : "enableAutoAlign";
    const alignText = this.i18nManager.getMessage(key) || 
                     (autoAlign ? "Disable Auto Align" : "Enable Auto Align");
    const alignIcon = autoAlign ? '🔒' : '🔓';
    const addText = this.i18nManager.getMessage("addButton") || "Add";
    
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
    
    const addSpan = menu.querySelector('[data-action="add-favorite"] span:last-child');
    const textSpan = menu.querySelector('[data-action="toggle-auto-align"] span:last-child');
    if (addSpan) addSpan.textContent = addText;
    if (textSpan) textSpan.textContent = alignText;
    
    document.body.appendChild(menu);
    this.contextMenu = menu;
    
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
      if (this.callbacks.onShowAddModal) {
        this.callbacks.onShowAddModal();
      }
      this.hideContextMenu();
    });
    
    menu.querySelector('[data-action="toggle-auto-align"]').addEventListener("click", () => {
      if (this.callbacks.onToggleAutoAlign) {
        this.callbacks.onToggleAutoAlign();
      }
      this.hideContextMenu();
    });
    
    // Close on click outside
    setTimeout(() => {
      const closeHandler = (e) => {
        if (!menu.contains(e.target)) {
          this.hideContextMenu();
        }
      };
      document.addEventListener("click", closeHandler, { once: true });
    }, 10);
  }

  hideContextMenu() {
    if (this.contextMenu) {
      this.contextMenu.classList.remove("show");
      setTimeout(() => {
        if (this.contextMenu && this.contextMenu.parentNode) {
          this.contextMenu.parentNode.removeChild(this.contextMenu);
        }
        this.contextMenu = null;
      }, 200);
    }
  }
}