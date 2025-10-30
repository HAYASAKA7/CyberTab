// Tile management module

export class TileManager {
  constructor(layoutManager, iconManager, storageManager) {
    this.layoutManager = layoutManager;
    this.iconManager = iconManager;
    this.storageManager = storageManager;
    this.onShowContextMenu = null;
  }

  setContextMenuCallback(cb) {
    this.onShowContextMenu = cb;
  }

  renderAll(onShowContextMenu) {
    if (onShowContextMenu) this.onShowContextMenu = onShowContextMenu;
    const board = document.getElementById("board");
    board.innerHTML = "";
    this.storageManager.items.forEach(it => {
      board.appendChild(this.makeTile(it, this.onShowContextMenu));
    });
    if (this.storageManager.autoAlign) this.autoAlignTiles();
  }

  makeTile(it, onShowContextMenu) {
    const el = document.createElement("div");
    el.className = "tile";
    const pos = this.layoutManager.getPosition(it.col, it.row);
    el.style.left = pos.left + "px";
    el.style.top = pos.top + "px";
    el.dataset.id = it.id;

    const iconText = this.iconManager.generateIconText(it.url, it.name, it.icon);
    const bg = this.iconManager.colorFromString(it.url || it.name);

    el.innerHTML = `<div class="icon">${iconText}</div>
                    <div class="title">${this.escapeHtml(it.name)}</div>`;

    const iconEl = el.querySelector(".icon");
    if (it.icon && (it.icon.startsWith('http') || it.icon.startsWith('data:'))) {
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

      img.onerror = () => {
        iconEl.innerHTML = iconText;
        iconEl.style.background = bg;
        iconEl.style.color = '#041218';
        iconEl.style.textShadow = '0 2px 8px rgba(0,0,0,0.4)';
      };

      iconEl.appendChild(img);
    } else {
      iconEl.innerHTML = iconText;
      iconEl.style.background = bg;
      iconEl.style.color = '#041218';
      iconEl.style.textShadow = '0 2px 8px rgba(0,0,0,0.4)';
    }

    el.addEventListener("contextmenu", e => {
      e.preventDefault();
      if (onShowContextMenu) onShowContextMenu(e.clientX, e.clientY, it.id);
    });

    this.setupDragAndDrop(el, it);

    let wasDragged = false;
    el.addEventListener("pointerdown", e => {
      wasDragged = false;
    });
    el.addEventListener("pointermove", e => {
      if (el.dataset.dragging === "1") {
        wasDragged = true;
      }
    });

    el.addEventListener("click", e => {
      e.preventDefault();
      if (!wasDragged) {
        window.open(it.url, "_blank");
      }
    });

    return el;
  }

  setupDragAndDrop(el, it) {
    let startX, startY, origLeft, origTop;
    let dragThreshold = 5;
    let hasMoved = false;
    let wasDragged = false;
    
    el.addEventListener("pointerdown", e => {
      if (e.button !== 0) return;
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
        this.handleDrop(el, it);
      } else {
        el.style.transition = "";
      }
      
      setTimeout(() => {
        wasDragged = false;
      }, 200);
    });
  }

  handleDrop(el, it) {
    const gridPos = this.layoutManager.getGridPosition(el.offsetLeft, el.offsetTop);
    
    if (this.storageManager.autoAlign) {
      this.layoutManager.computeLayout();
      const targetIndex = gridPos.row * this.layoutManager.currentMaxCols + gridPos.col;
      
      this.storageManager.items.sort((a, b) => 
        (a.row * this.layoutManager.currentMaxCols + a.col) - 
        (b.row * this.layoutManager.currentMaxCols + b.col)
      );
      
      const currentIndex = this.storageManager.items.indexOf(it);
      this.storageManager.items.splice(currentIndex, 1);
      
      const insertIndex = Math.min(targetIndex, this.storageManager.items.length);
      this.storageManager.items.splice(insertIndex, 0, it);
      
      let col = 0;
      let row = 0;
      this.storageManager.items.forEach(item => {
        item.col = col;
        item.row = row;
        col++;
        if (col >= this.layoutManager.currentMaxCols) {
          col = 0;
          row++;
        }
      });
    } else {
      const targetTile = this.storageManager.items.find(t => 
        t.col === gridPos.col && t.row === gridPos.row && t.id !== el.dataset.id
      );
      
      if (targetTile) {
        const sorted = this.storageManager.items.slice().sort((a, b) => 
          (a.row * this.layoutManager.currentMaxCols + a.col) - 
          (b.row * this.layoutManager.currentMaxCols + b.col)
        );

        const targetIndex = sorted.findIndex(s => s.id === targetTile.id);
        const draggedIndex = sorted.findIndex(s => s.id === it.id);
        if (draggedIndex !== -1) sorted.splice(draggedIndex, 1);
        
        const insertIndex = Math.min(Math.max(0, targetIndex), sorted.length);
        sorted.splice(insertIndex, 0, it);

        let col = 0, row = 0;
        for (const s of sorted) {
          s.col = col;
          s.row = row;
          const elTile = document.querySelector(`[data-id="${s.id}"]`);
          if (elTile) {
            const pos = this.layoutManager.getPosition(s.col, s.row);
            elTile.style.transition = "";
            elTile.style.left = pos.left + "px";
            elTile.style.top = pos.top + "px";
          }
          col++;
          if (col >= this.layoutManager.currentMaxCols) { 
            col = 0; 
            row++; 
          }
        }

        this.storageManager.items = sorted;
      } else {
        const freePos = this.layoutManager.findNearestFreePosition(
          this.storageManager.items, 
          gridPos.col, 
          gridPos.row, 
          it.id
        );
        it.col = freePos.col;
        it.row = freePos.row;
      }
    }
    
    const finalPos = this.layoutManager.getPosition(it.col, it.row);
    el.style.transition = "";
    el.style.left = finalPos.left + "px"; 
    el.style.top = finalPos.top + "px";
    
    this.storageManager.save();
    this.autoAlignTiles();
  }

  autoAlignTiles() {
    if (!this.storageManager.autoAlign) return;
    this.layoutManager.computeLayout();
    this.storageManager.items.sort((a, b) => 
      (a.row * this.layoutManager.currentMaxCols + a.col) - 
      (b.row * this.layoutManager.currentMaxCols + b.col)
    );

    let col = 0, row = 0;
    for (const it of this.storageManager.items) {
      it.col = col;
      it.row = row;
      const el = document.querySelector(`[data-id="${it.id}"]`);
      if (el) {
        const pos = this.layoutManager.getPosition(it.col, it.row);
        el.style.transition = "";
        el.style.left = pos.left + "px";
        el.style.top = pos.top + "px";
      }
      col++;
      if (col >= this.layoutManager.currentMaxCols) { 
        col = 0; 
        row++; 
      }
    }

    this.storageManager.save();
  }

  async fetchMissingFavicons() {
    this.storageManager.items.filter(it => !it.icon).forEach(async (it) => {
      try {
        const fav = await this.iconManager.fetchFavicon(it.url);
        if (!fav) return;
        
        it.icon = fav;
        this.storageManager.save();

        const tile = document.querySelector(`[data-id="${it.id}"]`);
        if (!tile) return;
        const iconEl = tile.querySelector(".icon");
        if (!iconEl) return;

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

        img.onload = () => {};
        img.onerror = () => {
          iconEl.innerHTML = this.iconManager.generateIconText(it.url, it.name, it.icon);
          iconEl.style.background = this.iconManager.colorFromString(it.url || it.name);
          iconEl.style.color = '#041218';
          iconEl.style.textShadow = '0 2px 8px rgba(0,0,0,0.4)';
        };

        iconEl.appendChild(img);
      } catch (e) {
        console.debug("favicon load failed for", it.url, e);
      }
    });
  }

  async applyIconChange(itemId, iconType) {
    const it = this.storageManager.items.find(it => it.id === itemId);
    if (!it) return false;

    let newIcon = "";

    if (iconType === "default") {
      newIcon = "";
    } else if (iconType === "website") {
      const favicon = await this.iconManager.fetchFavicon(it.url);
      if (!favicon) return false;
      newIcon = favicon;
    } else if (iconType === "local") {
      const fileInput = document.getElementById("editLocalIcon");
      const file = fileInput && fileInput.files ? fileInput.files[0] : null;
      if (file) {
        try {
          newIcon = await this.iconManager.readFileAsDataURL(file);
        } catch (e) {
          return false;
        }
      } else {
        return false;
      }
    } else if (typeof iconType === 'string' && iconType.startsWith('extension:')) {
      const filename = iconType.split(':')[1];
      if (!filename) return false;
      newIcon = chrome.runtime.getURL(`icons/${filename}`);
    } else {
      return false;
    }

    it.icon = newIcon;
    this.storageManager.save();
    this.renderAll();
    return true;
  }

  escapeHtml(s) { 
    return (s || "").toString().replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c])); 
  }
}