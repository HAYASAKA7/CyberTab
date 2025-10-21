// Background image management module

export class BackgroundManager {
  constructor(storageManager) {
    this.storageManager = storageManager;
    this.pendingBackground = "";
  }

  applyBackground(src) {
    if (!src) {
      document.documentElement.style.setProperty('--custom-bg-image', 'none');
      this.storageManager.backgroundImage = "";
      return;
    }
    const escaped = src.replace(/"/g, '\\"');
    document.documentElement.style.setProperty('--custom-bg-image', `url("${escaped}") center/cover no-repeat`);
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
        backgroundFileName.textContent = f.name;
        const reader = new FileReader();
        reader.onload = () => {
          this.pendingBackground = reader.result;
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