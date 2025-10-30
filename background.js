// Background image management module

export class BackgroundManager {
  constructor(storageManager) {
    this.storageManager = storageManager;
    this.pendingBackground = "";
  }

  applyBackground(src) {
    // Delete old dynamic background elements
    let old = document.getElementById("dynamic-bg");
    if (old) old.remove();

    if (!src) {
      document.documentElement.style.setProperty('--custom-bg-image', 'none');
      this.storageManager.backgroundImage = "";
      return;
    }

    // Check if it's a video/gif or data:video
    if (
      /\.(mp4|webm|ogg|gif)(\?.*)?$/i.test(src) ||
      (src.startsWith("data:video/"))
    ) {
      // Insert video tag
      const video = document.createElement("video");
      video.id = "dynamic-bg";
      video.src = src;
      video.autoplay = true;
      video.loop = true;
      video.muted = true;
      video.playsInline = true;
      video.style.position = "fixed";
      video.style.inset = "0";
      video.style.width = "100vw";
      video.style.height = "100vh";
      video.style.objectFit = "cover";
      video.style.zIndex = "-1";
      video.style.pointerEvents = "none";
      video.style.background = "black";
      document.body.appendChild(video);
      document.documentElement.style.setProperty('--custom-bg-image', 'none');
    } 
    // Check if it's an image (supports common image extensions) or data:image
    else if (
      /\.(jpe?g|png|bmp|svg|webp|avif)(\?.*)?$/i.test(src) ||
      src.startsWith("data:image/")
    ) {
      const escaped = src.replace(/"/g, '\\"');
      document.documentElement.style.setProperty('--custom-bg-image', `url("${escaped}") center/cover no-repeat`);
      this.storageManager.backgroundImage = src;
    }
    // Other http(s) links as dynamic web pages
    else if (/^https?:\/\/.+/.test(src) && !src.startsWith("data:")) {
      const iframe = document.createElement("iframe");
      iframe.id = "dynamic-bg";
      iframe.src = src;
      iframe.style.position = "fixed";
      iframe.style.inset = "0";
      iframe.style.width = "100vw";
      iframe.style.height = "100vh";
      iframe.style.zIndex = "-1";
      iframe.style.border = "none";
      iframe.style.pointerEvents = "none";
      document.body.appendChild(iframe);
      document.documentElement.style.setProperty('--custom-bg-image', 'none');
    } 
    else {
      // fallback
      document.documentElement.style.setProperty('--custom-bg-image', 'none');
    }
    this.storageManager.backgroundImage = src;
  }

  initializeUI() {
    const backgroundUrlInput = document.getElementById("backgroundUrl");
    const backgroundFileBtn = document.getElementById("backgroundFileBtn");
    const backgroundFileInput = document.getElementById("backgroundFile");
    const backgroundFileName = document.getElementById("backgroundFileName");
    const backgroundClear = document.getElementById("backgroundClear");

    this.pendingBackground = this.storageManager.backgroundImage || "";

    if (backgroundUrlInput) {
      backgroundUrlInput.value = (this.pendingBackground && !this.pendingBackground.startsWith('data:')) 
        ? this.pendingBackground : "";
    }

    if (backgroundFileBtn && backgroundFileInput) {
      backgroundFileBtn.addEventListener("click", () => backgroundFileInput.click());
      backgroundFileInput.addEventListener("change", async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        if (f.size > 30 * 1024 * 1024) { // 30MB
          const msg = (typeof window.i18nManager !== "undefined" && window.i18nManager.getMessage)
            ? window.i18nManager.getMessage("backgroundImageTooLarge") || "File must not exceed 30MB"
            : "File must not exceed 30MB";
          backgroundFileName.textContent = msg;
          backgroundFileName.style.color = "#ff3ec9";
          backgroundFileInput.value = "";
          return;
        }
        backgroundFileName.textContent = f.name;
        backgroundFileName.style.color = "";
        const reader = new FileReader();
        reader.onload = () => {
          this.pendingBackground = reader.result; // data:URL
        };
        reader.readAsDataURL(f);
      });
    }

    if (backgroundUrlInput) {
      backgroundUrlInput.addEventListener("input", (e) => {
        const v = e.target.value.trim();
        this.pendingBackground = v || "";
      });
    }

    if (backgroundClear) {
      backgroundClear.addEventListener("click", () => {
        this.pendingBackground = "";
        if (backgroundUrlInput) backgroundUrlInput.value = "";
        if (backgroundFileInput) {
          backgroundFileInput.value = "";
          backgroundFileName.textContent = "";
        }
        if (backgroundFileName) backgroundFileName.textContent = "";
      });
    }
  }

  applyPendingBackground() {
    if (typeof this.pendingBackground !== "undefined") {
      this.storageManager.backgroundImage = this.pendingBackground || "";
      this.storageManager.saveBackground();
      this.applyBackground(this.storageManager.backgroundImage);
    }
  }
}