// Search management module

export class SearchManager {
  constructor(storageManager) {
    this.storageManager = storageManager;
  }

  updateEngineUI() {
    const engineNameEl = document.querySelector(".engine-name");
    const engineIconEl = document.querySelector(".engine-icon");
    if (this.storageManager.currentEngine === "bing") {
      engineNameEl.textContent = "Bing";
      engineIconEl.textContent = "🔎";
    } else if (this.storageManager.currentEngine === "baidu") {
      engineNameEl.textContent = "Baidu";
      engineIconEl.textContent = "🔎";
    } else {
      engineNameEl.textContent = "Google";
      engineIconEl.textContent = "🔎";
    }
  }

  toggleEngine() {
    if (this.storageManager.currentEngine === "google") {
      this.storageManager.currentEngine = "bing";
    } else if (this.storageManager.currentEngine === "bing") {
      this.storageManager.currentEngine = "baidu";
    } else {
      this.storageManager.currentEngine = "google";
    }
    this.storageManager.saveEngine();
    this.updateEngineUI();
  }

  performSearch(query) {
    if (!query.trim()) return;
    
    const encodedQuery = encodeURIComponent(query.trim());
    let searchUrl;
    
    if (this.storageManager.currentEngine === "bing") {
      searchUrl = `https://www.bing.com/search?q=${encodedQuery}`;
    } else if (this.storageManager.currentEngine === "baidu") {
      searchUrl = `https://www.baidu.com/s?wd=${encodedQuery}`;
    } else {
      searchUrl = `https://www.google.com/search?q=${encodedQuery}`;
    }
    
    window.open(searchUrl, "_blank");
  }
}