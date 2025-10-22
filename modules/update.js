// Update check module

export class UpdateChecker {
  constructor({ repo, i18nManager }) {
    this.repo = repo;
    this.i18nManager = i18nManager;
    this.latestReleaseUrl = `https://github.com/${repo}/releases/latest`;
    this.hasUpdate = false;
    this.latestVersion = "";
  }

  async check(currentVersion) {
    try {
      const res = await fetch(`https://api.github.com/repos/${this.repo}/releases/latest`);
      if (!res.ok) return false;
      const data = await res.json();
      this.latestVersion = (data.tag_name || "").replace(/^v/, "");
      this.latestReleaseUrl = data.html_url || this.latestReleaseUrl;
      this.hasUpdate = this.compareVersions(currentVersion, this.latestVersion) < 0;
      return this.hasUpdate;
    } catch (e) {
      return false;
    }
  }

  compareVersions(v1, v2) {
    const a = v1.split('.').map(Number);
    const b = v2.split('.').map(Number);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const n1 = a[i] || 0, n2 = b[i] || 0;
      if (n1 > n2) return 1;
      if (n1 < n2) return -1;
    }
    return 0;
  }

  getUpdateTitle() {
    return this.i18nManager?.getMessage("homeButtonUpdateTitle") || "New version available! Click to update.";
  }

  getHomeTitle() {
    return this.i18nManager?.getMessage("homeButtonTitle") || "Project Home";
  }
}