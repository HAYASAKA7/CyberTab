// Icon management module

export class IconManager {
  constructor() {}

  generateIconText(url, name, providedIcon) {
    const hasIcon = (providedIcon || "").trim();
    if (hasIcon && /[^\w\s]/u.test(hasIcon)) return hasIcon.slice(0, 2);

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

  colorFromString(s) {
    let h = 0;
    for (let i = 0; i < (s || "").length; i++) {
      h = (h * 31 + s.charCodeAt(i)) % 360;
    }
    const h2 = (h + 60) % 360;
    return `linear-gradient(135deg, hsl(${h}deg 85% 60%), hsl(${h2}deg 80% 50%))`;
  }

  async fetchFavicon(url) {
    try {
      const urlObj = new URL(url);
      const baseUrl = `${urlObj.protocol}//${urlObj.host}`;
      const host = urlObj.host;

      // UA detection: prefer chrome://favicon only on Chrome desktop
      const ua = navigator.userAgent || "";
      const isEdge = ua.includes("Edg/");
      const isOpera = ua.includes("OPR/");
      const isChrome = ua.includes("Chrome") && !isEdge && !isOpera;

      // 1) chrome
      if (isChrome) {
        try {
          const chromeFav = `chrome://favicon/128/${encodeURIComponent(url)}`;
          await this.testImageLoad(chromeFav, 1200);
          return chromeFav;
        } catch (e) {
          // fallthrough to other strategies
        }
      }

      // 2) Reliable third-party services
      const thirdParty = [
        `https://www.google.com/s2/favicons?domain=${host}&sz=128`,
        `https://icons.duckduckgo.com/ip3/${host}.ico`
      ];
      for (const candidate of thirdParty) {
        try {
          await this.testImageLoad(candidate, 1500);
          return candidate;
        } catch (e) { /* try next */ }
      }

      // 3) Try standard site-hosted locations
      const siteCandidates = [
        `${baseUrl}/favicon.ico`,
        `${baseUrl}/apple-touch-icon.png`,
        `${baseUrl}/favicon.png`
      ];
      for (const candidate of siteCandidates) {
        try {
          await this.testImageLoad(candidate, 1800);
          return candidate;
        } catch (e) { /* try next */ }
      }

      // 4) Fetch page and parse link/manifest
      try {
        const resp = await fetch(baseUrl, { method: "GET", mode: "cors" });
        if (resp.ok) {
          const html = await resp.text();
          const linkMatch = html.match(/<link[^>]+rel=["'](?:shortcut icon|icon|apple-touch-icon)["'][^>]*>/i);
          if (linkMatch) {
            const hrefMatch = linkMatch[0].match(/href=["']([^"']+)["']/i);
            if (hrefMatch && hrefMatch[1]) {
              const href = new URL(hrefMatch[1], baseUrl).href;
              try {
                await this.testImageLoad(href, 1800);
                return href;
              } catch (e) { /* ignore */ }
            }
          }
          const manifestMatch = html.match(/<link[^>]+rel=["']manifest["'][^>]*>/i);
          if (manifestMatch) {
            const hrefMatch = manifestMatch[0].match(/href=["']([^"']+)["']/i);
            if (hrefMatch && hrefMatch[1]) {
              const manifestUrl = new URL(hrefMatch[1], baseUrl).href;
              try {
                const mresp = await fetch(manifestUrl, { method: "GET", mode: "cors" });
                if (mresp.ok) {
                  const manifest = await mresp.json();
                  if (manifest.icons && manifest.icons.length) {
                    manifest.icons.sort((a, b) => {
                      const aSz = parseInt((a.sizes || "0").split("x")[0]) || 0;
                      const bSz = parseInt((b.sizes || "0").split("x")[0]) || 0;
                      return bSz - aSz;
                    });
                    for (const icon of manifest.icons) {
                      const iconUrl = new URL(icon.src, manifestUrl).href;
                      try {
                        await this.testImageLoad(iconUrl, 1800);
                        return iconUrl;
                      } catch (e) { /* try next */ }
                    }
                  }
                }
              } catch (e) { /* ignore */ }
            }
          }
        }
      } catch (e) {
        // network/CORS - ignore
      }

      return null;
    } catch (e) {
      return null;
    }
  }

  testImageLoad(src, timeout = 2000) {
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

  readFileAsDataURL(file) {
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
  }
}