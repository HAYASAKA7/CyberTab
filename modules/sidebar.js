// Sidebar management module

import { RIGHT_SIDEBAR_TRIGGER_ZONE } from './constants.js';

export class SidebarManager {
  constructor() {
    this.rightSidebarDebounceTimer = null;
  }

  toggleLeftSidebar() {
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

  closeLeftSidebar() {
    const sidebar = document.getElementById("sidebar");
    const overlay = document.getElementById("sidebarOverlay");
    const toggle = document.getElementById("menuToggle");
    const rightSidebar = document.getElementById("rightSidebar");
    
    sidebar.classList.remove("open");
    toggle.classList.remove("active");
    if (!rightSidebar.classList.contains("open")) {
      overlay.classList.remove("active");
    }
  }

  openRightSidebar() {
    const rightSidebar = document.getElementById("rightSidebar");
    const overlay = document.getElementById("sidebarOverlay");
    
    if (!rightSidebar.classList.contains("open")) {
      rightSidebar.classList.add("open");
      overlay.classList.add("active");
    }
  }

  closeRightSidebar() {
    const rightSidebar = document.getElementById("rightSidebar");
    const overlay = document.getElementById("sidebarOverlay");
    const leftSidebar = document.getElementById("sidebar");
    
    if (!leftSidebar.classList.contains("open")) {
      overlay.classList.remove("active");
    }
    
    rightSidebar.classList.remove("open");
  }

  setupRightSidebarTrigger() {
    const rightSidebar = document.getElementById("rightSidebar");
    
    document.addEventListener("mousemove", (e) => {
      if (rightSidebar.dataset.lockOpen === "true") return;
      const distanceFromRight = window.innerWidth - e.clientX;
      
      if (distanceFromRight <= RIGHT_SIDEBAR_TRIGGER_ZONE && 
          !rightSidebar.classList.contains("open")) {
        clearTimeout(this.rightSidebarDebounceTimer);
        this.rightSidebarDebounceTimer = setTimeout(() => {
          this.openRightSidebar();
        }, 50);
      }
    });
    
    rightSidebar.addEventListener("mouseleave", (e) => {
      if (rightSidebar.dataset.lockOpen === "true") return;
      const rect = rightSidebar.getBoundingClientRect();
      if (e.clientX > rect.right || e.clientX < rect.left) {
        this.closeRightSidebar();
      }
    });
    
    rightSidebar.addEventListener("mouseenter", () => {
      clearTimeout(this.rightSidebarDebounceTimer);
    });
  }

  setupScrollbars() {
    const selectors = [
      document.getElementById('board'),
      document.querySelector('#modal .card'),
      document.querySelector('#settingsModal .card'),
      document.querySelector('#editIconModal .card')
    ].filter(Boolean);

    selectors.forEach(el => {
      el.style.webkitOverflowScrolling = 'touch';

      let scrollTimer = null;
      const SCROLL_CLASS = 'scrolling';
      const SCROLL_TIMEOUT = 700;

      const onUserScroll = () => {
        el.classList.add(SCROLL_CLASS);
        if (scrollTimer) clearTimeout(scrollTimer);
        scrollTimer = setTimeout(() => {
          el.classList.remove(SCROLL_CLASS);
        }, SCROLL_TIMEOUT);
      };

      el.addEventListener('wheel', onUserScroll, { passive: true });
      el.addEventListener('touchmove', onUserScroll, { passive: true });

      el.addEventListener('keydown', (e) => {
        const keys = ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End'];
        if (keys.includes(e.key)) onUserScroll();
      });

      el.addEventListener('pointerenter', () => {
        if (scrollTimer) { 
          clearTimeout(scrollTimer); 
          scrollTimer = null; 
        }
        el.classList.remove(SCROLL_CLASS);
      });
      
      el.addEventListener('pointerleave', () => {
        if (scrollTimer) clearTimeout(scrollTimer);
        scrollTimer = setTimeout(() => el.classList.remove(SCROLL_CLASS), 120);
      });
    });
  }
}