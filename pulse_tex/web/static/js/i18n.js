let translations = {};
let currentLanguage = 'en';

async function initI18n() {
    const savedLang = localStorage.getItem('pulse-tex-language') || detectBrowserLanguage();
    const savedTheme = localStorage.getItem('pulse-tex-theme') || 'dark';
    setTheme(savedTheme);
    await loadTranslations(savedLang);
    applyTranslations();
}

function detectBrowserLanguage() {
    const browserLang = navigator.language || navigator.userLanguage;
    if (browserLang.startsWith('zh')) return 'zh';
    return 'en';
}

async function loadTranslations(lang) {
    try {
        const res = await fetch(`/locales/${lang}.json`);
        if (!res.ok) {
            console.warn(`Failed to load ${lang} translations, falling back to en`);
            if (lang !== 'en') {
                await loadTranslations('en');
            }
            return;
        }
        translations = await res.json();
        currentLanguage = lang;
    } catch (e) {
        console.error('Failed to load translations:', e);
        if (lang !== 'en') {
            await loadTranslations('en');
        }
    }
}

function t(key, fallback) {
    const keys = key.split('.');
    let value = translations;
    
    for (const k of keys) {
        if (value && typeof value === 'object' && k in value) {
            value = value[k];
        } else {
            return fallback || key;
        }
    }
    
    return typeof value === 'string' ? value : fallback || key;
}

function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const translation = t(key);
        if (translation && translation !== key) {
            el.textContent = translation;
        }
    });
    
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        const translation = t(key);
        if (translation && translation !== key) {
            el.placeholder = translation;
        }
    });
    
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        const translation = t(key);
        if (translation && translation !== key) {
            el.title = translation;
        }
    });
}

function setLanguage(lang) {
    localStorage.setItem('pulse-tex-language', lang);
    loadTranslations(lang).then(() => {
        applyTranslations();
        document.documentElement.lang = lang;
    });
}

function getCurrentLanguage() {
    return currentLanguage;
}

function setTheme(theme) {
    if (theme === 'system') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else {
        document.documentElement.setAttribute('data-theme', theme);
    }
    localStorage.setItem('pulse-tex-theme', theme);
}

function getCurrentTheme() {
    return localStorage.getItem('pulse-tex-theme') || 'dark';
}

window.i18n = {
    t,
    setLanguage,
    getCurrentLanguage,
    applyTranslations,
    setTheme,
    getCurrentTheme
};

window.t = t;
window.setLanguage = setLanguage;
window.getCurrentLanguage = getCurrentLanguage;
window.setTheme = setTheme;
window.getCurrentTheme = getCurrentTheme;
window.initI18n = initI18n;
