/**
 * Custom Scrollbar System
 * Replaces native scrollbars with custom neon scrollbars that use custom cursor
 * without triggering default pointer
 */

export class CustomScrollbar {
  constructor() {
    this.scrollbars = new Map();
    this.init();
  }

  init() {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.setupScrollbars());
    } else {
      this.setupScrollbars();
    }

    // Also setup for dynamically added elements (modals, etc)
    const observer = new MutationObserver((mutations) => {
      setTimeout(() => {
        const scrollableElements = document.querySelectorAll(
          '#board, #modal .card, #settingsModal .card, #editIconModal .card, .suggestions'
        );
        scrollableElements.forEach((el) => {
          if (!this.scrollbars.has(el)) {
            this.createScrollbar(el);
          }
        });
      }, 100);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  setupScrollbars() {
    // Find all scrollable elements
    const scrollableElements = document.querySelectorAll(
      '#board, #modal .card, #settingsModal .card, #editIconModal .card, .suggestions'
    );
    scrollableElements.forEach((el) => this.createScrollbar(el));
  }

  createScrollbar(container) {
    // Skip if already has custom scrollbar
    if (this.scrollbars.has(container)) {
      return;
    }

    // ========== AGGRESSIVELY HIDE NATIVE SCROLLBAR ==========
    // Set inline styles with !important to override any CSS
    container.style.cssText = `
      ${container.style.cssText};
      scrollbar-width: none !important;
      -ms-overflow-style: none !important;
      overflow: scroll !important;
    `;

    // Add class for CSS targeting
    container.classList.add('custom-scrollbar-container');

    // ========== CREATE CUSTOM SCROLLBAR UI ==========
    // Get or create wrapper for scrollbar track
    let wrapper = container._scrollbarWrapper;
    if (!wrapper) {
      wrapper = document.createElement('div');
      wrapper.className = 'custom-scrollbar-wrapper';
      wrapper.style.cssText = `
        position: relative;
        display: inline-block;
        width: 100%;
        height: 100%;
      `;
      container._scrollbarWrapper = wrapper;
    }

    // Create custom scrollbar track and thumb
    const scrollbarTrack = document.createElement('div');
    scrollbarTrack.className = 'custom-scrollbar-track';
    scrollbarTrack.style.cssText = `
      position: absolute;
      right: 0;
      top: 0;
      width: 12px;
      height: 100%;
      background: transparent;
      z-index: 1000;
      opacity: 0;
      transition: opacity 0.2s ease;
      pointer-events: none;
    `;

    const scrollbarThumb = document.createElement('div');
    scrollbarThumb.className = 'custom-scrollbar-thumb';
    scrollbarThumb.style.cssText = `
      position: absolute;
      right: 2px;
      top: 0;
      width: 8px;
      height: 0;
      background: linear-gradient(135deg, #00f0ff, #ff2d95);
      border-radius: 4px;
      cursor: none !important;
      transition: width 0.2s ease;
      box-shadow: 0 0 10px rgba(0, 240, 255, 0.6);
      pointer-events: auto;
      user-select: none;
      -webkit-user-select: none;
      -moz-user-select: none;
      -ms-user-select: none;
    `;

    scrollbarTrack.appendChild(scrollbarThumb);

    // CRITICAL FIX: Check if container is inside a modal
    // If so, only set container's position to relative, NOT the parent
    // This prevents breaking the modal's position:fixed behavior
    const isInModal = container.closest('.modal') !== null;
    
    if (isInModal) {
      // For modal content, set position relative only on container itself
      container.style.position = 'relative';
      container.appendChild(scrollbarTrack);
    } else {
      // For non-modal elements, apply to parent for scrollbar positioning
      const parent = container.parentElement;
      if (parent) {
        parent.style.position = 'relative';
        parent.appendChild(scrollbarTrack);
      } else {
        container.style.position = 'relative';
        container.appendChild(scrollbarTrack);
      }
    }

    const scrollbarData = {
      container,
      track: scrollbarTrack,
      thumb: scrollbarThumb,
      isDragging: false,
      startY: 0,
      startScrollTop: 0,
    };

    this.scrollbars.set(container, scrollbarData);

    // Update scrollbar on scroll
    const updateScrollbar = () => {
      this.updateScrollbarPosition(container);
    };

    container.addEventListener('scroll', updateScrollbar);
    window.addEventListener('resize', updateScrollbar);

    // Show/hide scrollbar on hover
    const showScrollbar = () => {
      if (container.scrollHeight > container.clientHeight) {
        scrollbarTrack.style.opacity = '1';
        scrollbarTrack.style.pointerEvents = 'auto';
      }
    };

    const hideScrollbar = () => {
      scrollbarTrack.style.opacity = '0';
      scrollbarTrack.style.pointerEvents = 'none';
      scrollbarData.isDragging = false;
    };

    container.addEventListener('mouseenter', showScrollbar);
    container.addEventListener('mouseleave', hideScrollbar);
    parent?.addEventListener('mouseenter', showScrollbar);
    parent?.addEventListener('mouseleave', hideScrollbar);

    // Dragging interaction with custom cursor tracking
    scrollbarThumb.addEventListener('mousedown', (e) => {
      e.preventDefault();
      scrollbarData.isDragging = true;
      scrollbarData.startY = e.clientY;
      scrollbarData.startScrollTop = container.scrollTop;

      // Update global cursor position for trail effect
      if (typeof window.lastX !== 'undefined') {
        window.lastX = e.clientX;
        window.lastY = e.clientY;
      }

      const handleMouseMove = (moveEvent) => {
        if (!scrollbarData.isDragging) return;

        const deltaY = moveEvent.clientY - scrollbarData.startY;
        const scrollHeight = container.scrollHeight - container.clientHeight;
        const trackHeight = scrollbarTrack.clientHeight;
        const thumbHeight = scrollbarThumb.clientHeight;
        const maxThumbTravel = trackHeight - thumbHeight;

        if (maxThumbTravel > 0) {
          const newScrollTop = scrollbarData.startScrollTop + (deltaY / maxThumbTravel) * scrollHeight;
          container.scrollTop = Math.max(0, Math.min(newScrollTop, scrollHeight));
        }

        // Update cursor position for trail effect during drag
        if (typeof window.lastX !== 'undefined') {
          window.lastX = moveEvent.clientX;
          window.lastY = moveEvent.clientY;
        }
      };

      const handleMouseUp = () => {
        scrollbarData.isDragging = false;
        document.removeEventListener('mousemove', handleMouseMove, true);
        document.removeEventListener('mouseup', handleMouseUp, true);
      };

      document.addEventListener('mousemove', handleMouseMove, true);
      document.addEventListener('mouseup', handleMouseUp, true);
    });

    // Initial update
    updateScrollbar();
  }

  updateScrollbarPosition(container) {
    const scrollbarData = this.scrollbars.get(container);
    if (!scrollbarData) return;

    const { track, thumb } = scrollbarData;
    const scrollHeight = container.scrollHeight;
    const clientHeight = container.clientHeight;

    if (scrollHeight <= clientHeight) {
      thumb.style.height = '0';
      return;
    }

    const thumbHeight = Math.max(20, (clientHeight / scrollHeight) * track.clientHeight);
    const thumbTop = (container.scrollTop / scrollHeight) * (track.clientHeight - thumbHeight);

    thumb.style.height = thumbHeight + 'px';
    thumb.style.top = thumbTop + 'px';
  }

  destroy() {
    this.scrollbars.forEach(({ track }) => {
      track?.remove();
    });
    this.scrollbars.clear();
  }
}
