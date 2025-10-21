// Internationalization module

export class I18nManager {
  constructor() {
    this.messagesMapCache = null;
    this.currentLanguage = "auto";
  }

  setLanguage(lang) {
    this.currentLanguage = lang;
  }

  getMessage(key, substitutions) {
    if (this.messagesMapCache && this.messagesMapCache[key] !== undefined) {
      return this.messagesMapCache[key];
    }
    try {
      return chrome.i18n.getMessage(key, substitutions) || "";
    } catch (e) {
      return "";
    }
  }

  async loadMessagesForLocale(locale) {
    try {
      const url = chrome.runtime.getURL(`_locales/${locale}/messages.json`);
      const resp = await fetch(url);
      if (!resp.ok) return null;
      const json = await resp.json();
      const map = {};
      for (const k in json) {
        if (json[k] && typeof json[k].message === 'string') {
          map[k] = json[k].message;
        }
      }
      return map;
    } catch (e) {
      return null;
    }
  }

  async localizePage() {
    let messagesMap = null;
    let targetLocale = this.currentLanguage;
    
    if (this.currentLanguage === "auto") {
      const browserLang = chrome.i18n.getUILanguage();
      if (browserLang.startsWith('zh')) {
        targetLocale = 'zh_CN';
      } else if (browserLang.startsWith('ja')) {
        targetLocale = 'jp';
      } else {
        targetLocale = 'en';
      }
    }
    
    if (targetLocale && targetLocale !== "auto") {
      messagesMap = await this.loadMessagesForLocale(targetLocale);
    }

    this.messagesMapCache = messagesMap || null;

    // Localize elements with data-i18n attribute
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const message = this.getMessage(key);
      if (message) el.textContent = message;
    });

    // Localize placeholders
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      const message = this.getMessage(key);
      if (message) el.placeholder = message;
    });

    // Localize titles
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      const message = this.getMessage(key);
      if (message) el.title = message;
    });

    // Localize select options
    document.querySelectorAll('option[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const message = this.getMessage(key);
      if (message) el.textContent = message;
    });

    return Promise.resolve();
  }

  getEffectiveLocale() {
    if (this.currentLanguage === "auto") {
      return chrome.i18n.getUILanguage();
    }
    return this.currentLanguage;
  }
}