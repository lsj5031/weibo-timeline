// ==UserScript==
// @name         Weibo Timeline (Manual Refresh, Enhanced UI • v4.0)
// @namespace    http://tampermonkey.net/
// @version      4.0
// @description  Enhanced Weibo timeline: manual refresh, editable UIDs, image support, improved masonry layout, new theme modes (Visionary/Creative/Momentum/Legacy), local archive with visual content.
// @author       Grok
// @match        *://*/*
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @grant        GM
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      weibo.cn
// @connect      weibo.com
// @connect      m.weibo.cn
// @connect      *
// ==/UserScript==

(function () {
  'use strict';

  // Only run in top window (avoid iframes)
  if (window.top !== window.self) return;

  // -------------------------------------------------------------------
  // CONFIG
  // -------------------------------------------------------------------

  // Accounts to follow (Weibo UIDs)
  const USERS = [
    "1052404565",
    "1080201461",
    "1147851595",
    "1222135407",
    "1344386244",
    "1393477857",
    "1401902522",
    "1444865141",
    "1540883530",
    "1610356014",
    "1644225642",
    "1645776681",
    "1652595727",
    "1663311732",
    "1670659923",
    "1672283232",
    "1695350712",
    "1698243607",
    "1701816363",
    "1702208197",
    "1707465002",
    "1712462832",
    "1714261292",
    "1743951792",
    "1746222377",
    "1752928750",
    "1764452651",
    "1768354461",
    "1769173661",
    "1791808013",
    "1805789162",
    "1826017297",
    "1873999810",
    "1884548883",
    "1891727991",
    "1899123755",
    "1917885853",
    "1928552571",
    "1965945984",
    "1971929971",
    "1980508763",
    "1989660417",
    "2018499075",
    "2031030981",
    "2032999983",
    "2094390301",
    "2123664205",
    "2155926845",
    "2173291530",
    "2189745412",
    "2203034695",
    "2218472014",
    "2269761153",
    "2389742313",
    "2436298991",
    "2535898204",
    "2580392892",
    "2588011444",
    "2615626492",
    "2681847263",
    "2775449205",
    "2810904414",
    "3010420480",
    "3083216765",
    "3103768347",
    "3130653487",
    "3177420971",
    "3194061481",
    "3199840270",
    "3218434004",
    "3317930660",
    "3699880234",
    "3978383590",
    "5597705779",
    "5628021879",
    "5655200015",
    "5690608944",
    "5750138957",
    "5835994414",
    "5843992636",
    "5991211490",
    "6069805893",
    "6147017411",
    "6254321002",
    "6431633590",
    "6557248346",
    "6723106704",
    "6755891821",
    "6831021550",
    "6850068687",
    "6851371740",
    "7163959006",
    "7378646514",
    "7384845399",
    "7393169813",
    "7540852197",
    "7745842993",
    "7797020453",
    "7825510109"
    // ← add more UIDs here
  ];

  // Spacing between API calls for different accounts
  const BETWEEN_ACCOUNTS_MS = 5 * 1000;       // 5 seconds
  // How often to complete a full cycle of all accounts (now manual only)
  const CYCLE_INTERVAL_MS   = 60 * 60 * 1000; // 1 hour (for reference only)

  // LocalStorage keys
  const TIMELINE_KEY = "weibo_timeline_v3";
  const UID_HEALTH_KEY = "weibo_uid_health_v1";
  const LAST_UID_KEY = "weibo_last_uid_v3";
  const AGENT_MODE_KEY = "weibo_agent_mode_v1";
  const THEME_KEY = "weibo_theme_v1";
  const USERS_KEY = "weibo_users_v1";
  const IMAGES_KEY = "weibo_images_v1";

  // Weibo mobile API endpoint
  const API_BASE = "https://m.weibo.cn/api/container/getIndex";

  // How many items to render at most (UI only; archive can be larger)
  const MAX_RENDER_ITEMS = 400;

  // UID health tracking
  const HEALTH_VALID = 'valid';
  const HEALTH_INVALID = 'invalid';
  const HEALTH_STALLED = 'stalled';
  const HEALTH_UNKNOWN = 'unknown';

  // -------------------------------------------------------------------
  // UTILITIES
  // -------------------------------------------------------------------

  function loadTimeline() {
    try {
      const raw = localStorage.getItem(TIMELINE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      console.error("WeiboTimeline: failed to parse timeline", e);
      return {};
    }
  }

  function saveTimeline(timeline) {
    try {
      localStorage.setItem(TIMELINE_KEY, JSON.stringify(timeline));
    } catch (e) {
      console.error("WeiboTimeline: failed to save timeline", e);
    }
  }

  function loadUidHealth() {
    try {
      const raw = localStorage.getItem(UID_HEALTH_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      console.error("WeiboTimeline: failed to parse UID health", e);
      return {};
    }
  }

  function saveUidHealth(health) {
    try {
      localStorage.setItem(UID_HEALTH_KEY, JSON.stringify(health));
    } catch (e) {
      console.error("WeiboTimeline: failed to save UID health", e);
    }
  }

  function loadLastUid() {
    try {
      return localStorage.getItem(LAST_UID_KEY) || null;
    } catch (e) {
      console.error("WeiboTimeline: failed to parse last UID", e);
      return null;
    }
  }

  function saveLastUid(uid) {
    try {
      if (uid) {
        localStorage.setItem(LAST_UID_KEY, uid);
      } else {
        localStorage.removeItem(LAST_UID_KEY);
      }
    } catch (e) {
      console.error("WeiboTimeline: failed to save last UID", e);
    }
  }

  function loadUsers() {
    try {
      const raw = localStorage.getItem(USERS_KEY);
      return raw ? JSON.parse(raw) : USERS;
    } catch (e) {
      console.error("WeiboTimeline: failed to parse users", e);
      return USERS;
    }
  }

  function saveUsers(users) {
    try {
      localStorage.setItem(USERS_KEY, JSON.stringify(users));
    } catch (e) {
      console.error("WeiboTimeline: failed to save users", e);
    }
  }

  function loadImages() {
    try {
      const raw = localStorage.getItem(IMAGES_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      console.error("WeiboTimeline: failed to parse images", e);
      return {};
    }
  }

  function saveImages(images) {
    try {
      localStorage.setItem(IMAGES_KEY, JSON.stringify(images));
    } catch (e) {
      console.error("WeiboTimeline: failed to save images", e);
    }
  }

  function downloadImage(url, key) {
    return new Promise((resolve, reject) => {
      // Check if image already exists
      const existingImages = loadImages();
      if (existingImages[key]) {
        resolve(existingImages[key]);
        return;
      }

      gmRequest({
        method: "GET",
        url,
        responseType: "blob",
        timeout: 10000,
        onload: (response) => {
          try {
            const reader = new FileReader();
            reader.onload = () => {
              const dataUrl = reader.result;
              existingImages[key] = {
                url: dataUrl,
                originalUrl: url,
                downloadedAt: Date.now()
              };
              saveImages(existingImages);
              resolve(dataUrl);
            };
            reader.onerror = () => reject(new Error("Failed to read image data"));
            reader.readAsDataURL(response.response);
          } catch (e) {
            reject(new Error("Failed to process image: " + e.message));
          }
        },
        onerror: () => reject(new Error("Network error downloading image")),
        ontimeout: () => reject(new Error("Timeout downloading image"))
      });
    });
  }

  function extractImages(mblog) {
    const images = [];
    
    if (mblog.pics && Array.isArray(mblog.pics)) {
      mblog.pics.forEach((pic, index) => {
        if (pic.url) {
          images.push({
            url: pic.url,
            thumbnail: pic.thumbnail || pic.url,
            alt: pic.alt || `Image ${index + 1}`,
            key: `${mblog.bid || mblog.id}_img_${index}`
          });
        }
      });
    }
    
    return images;
  }

  function gmRequest(opts) {
    if (typeof GM !== "undefined" && GM.xmlHttpRequest) {
      return GM.xmlHttpRequest(opts);
    } else if (typeof GM_xmlhttpRequest !== "undefined") {
      return GM_xmlhttpRequest(opts);
    } else {
      throw new Error("No GM xmlHttpRequest API available");
    }
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function truncate(str, max) {
    if (!str) return "";
    return str.length > max ? str.slice(0, max) + "…" : str;
  }

  function parseWeiboTime(timeString) {
    if (!timeString) return 0;
    
    try {
      // Parse Weibo time format: "Wed Nov 20 10:30:00 +0800 2024"
      const match = timeString.match(/\w{3}\s+\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\+\d{4}\s+\d{4}/);
      if (match) {
        return new Date(match[0]).getTime() || 0;
      }
      
      // Fallback to generic parsing
      return new Date(timeString).getTime() || 0;
    } catch (error) {
      console.warn('Failed to parse time:', timeString, error);
      return 0;
    }
  }

  function validateUid(uid) {
    if (!uid) return false;
    
    // Basic validation: numeric and reasonable length
    return /^\d{6,11}$/.test(uid);
  }

  function updateUidHealth(uid, status) {
    const health = loadUidHealth();
    health[uid] = {
      status,
      lastChecked: Date.now(),
      lastSuccess: status === HEALTH_VALID ? Date.now() : (health[uid]?.lastSuccess || null)
    };
    saveUidHealth(health);
  }

  function getUidHealth(uid) {
    const health = loadUidHealth();
    return health[uid] || { status: HEALTH_UNKNOWN, lastChecked: null, lastSuccess: null };
  }

  // -------------------------------------------------------------------
  // API LAYER
  // -------------------------------------------------------------------

  function fetchWeiboApi(params, uid, logLabel, log) {
    const qs = new URLSearchParams(params).toString();
    const url = API_BASE + "?" + qs;

    return new Promise((resolve, reject) => {
      log("REQUEST", { uid, logLabel, url });

      gmRequest({
        method: "GET",
        url,
        timeout: 15000,
        onload: (response) => {
          log("ONLOAD", {
            uid,
            logLabel,
            status: response.status,
            finalUrl: response.finalUrl || ""
          });

          if (response.status < 200 || response.status >= 300) {
            reject(new Error("HTTP " + response.status));
            return;
          }

          let json;
          try {
            json = JSON.parse(response.responseText);
          } catch (e) {
            log("JSON_PARSE_ERROR", { uid, logLabel, message: e.message });
            reject(new Error("JSON parse error"));
            return;
          }

          log("JSON_META", {
            uid,
            logLabel,
            ok: json.ok,
            hasData: !!json.data,
            cardsLen:
              json.data && Array.isArray(json.data.cards)
                ? json.data.cards.length
                : null
          });

          resolve(json);
        },
        onerror: (response) => {
          log("ONERROR", {
            uid,
            logLabel,
            status: response && response.status,
            readyState: response && response.readyState,
            finalUrl: (response && response.finalUrl) || "",
            error: response && response.error
          });
          reject(new Error("Network error"));
        },
        ontimeout: (response) => {
          log("TIMEOUT", {
            uid,
            logLabel,
            status: response && response.status,
            finalUrl: (response && response.finalUrl) || ""
          });
          reject(new Error("Timeout"));
        }
      });
    });
  }

  function fetchUserPosts(uid, log) {
    const containerid = "107603" + uid;
    const params = {
      type: "uid",
      value: uid,
      containerid: containerid,
      page: "1"
    };
    return fetchWeiboApi(params, uid, "posts", log);
  }

  // -------------------------------------------------------------------
  // MAIN DASHBOARD
  // -------------------------------------------------------------------

  GM_registerMenuCommand("🟠 Weibo Timeline", function () {
    const tab = window.open("about:blank", "_blank");
    if (!tab) {
      alert("Popup blocked – allow popups to open the Weibo Timeline.");
      return;
    }

    const doc = tab.document;
    const currentUsers = loadUsers();
    const accountsSummary = currentUsers.length + " accounts";

    doc.open();
    doc.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Weibo Timeline</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      /* Base Color Design Tokens */
      --color-primary: #000;
      --color-secondary: #F5F5F5;
      --color-background: #FFF;
      --color-background-card: #FAFAFA;
      --color-background-secondary: #F3F6FA;
      --color-muted: #888;
      --color-border: #EBEBEB;
      --color-shadow: rgba(0,0,0,0.1);
      
      /* Light theme base colors (default) */
      --color-primary-light: #1F2937;
      --color-secondary-light: #FFFFFF;
      --color-background-light: #FAFAFA;
      --color-muted-light: #6B7280;
      --color-border-light: #E5E7EB;
      --color-shadow-light: rgba(0,0,0,0.08);
      
      /* Dark theme base colors */
      --color-primary-dark: #e5e7eb;
      --color-secondary-dark: #020617;
      --color-background-dark: #0f172a;
      --color-muted-dark: #9ca3af;
      --color-border-dark: rgba(148,163,184,0.25);
      --color-shadow-dark: rgba(15,23,42,0.6);
      
      /* Default to light theme */
      --color-primary-current: var(--color-primary-light);
      --color-secondary-current: var(--color-secondary-light);
      --color-background-current: var(--color-background-light);
      --color-muted-current: var(--color-muted-light);
      --color-border-current: var(--color-border-light);
      --color-shadow-current: var(--color-shadow-light);
      
      /* Agent Mode Color Tokens - VISIONARY (Default) */
      --color-agent-primary: #03C561;
      --color-agent-primary-hover: #029C49;
      --color-agent-primary-light: rgba(3,197,97,0.1);
      --color-agent-primary-dark: #003700;
      --color-agent-accent: #03C561;
      
      /* Button Colors */
      --button-primary-bg: var(--color-agent-primary);
      --button-primary-hover: var(--color-agent-primary-hover);
      --button-primary-text: #FFF;
      --button-secondary-bg: #F5F5F5;
      --button-secondary-text: #333;
      --button-disabled-bg: #EBEBEB;
      --button-disabled-text: #BDBDBD;
      
      /* Status Colors */
      --color-success: #03C561;
      --color-warning: #FFD600;
      --color-error: #FF5252;
      --color-info: #17A2B8;
      
      /* Typography Design Tokens */
      --font-family-base: 'Space Grotesk', 'Bricolage Grotesque', 'IBM Plex Sans', sans-serif;
      --font-family-mono: 'JetBrains Mono', 'Fira Code', 'Source Code Pro', monospace;
      --font-size-h1: 48px;
      --font-size-h2: 32px;
      --font-size-body: 16px;
      --font-size-small: 13px;
      --font-size-xs: 11px;
      --font-weight-bold: 700;
      --font-weight-semibold: 600;
      --font-weight-medium: 500;
      --font-weight-regular: 300;
      --line-height-heading: 1.2;
      --line-height-body: 1.5;
      --letter-spacing: 0.1px;
      
      /* Spacing Design Tokens */
      --spacing-xs: 4px;
      --spacing-sm: 8px;
      --spacing-md: 16px;
      --spacing-lg: 24px;
      --spacing-xl: 32px;
      --border-radius-sm: 4px;
      --border-radius: 8px;
      --border-radius-lg: 12px;
      --border-radius-xl: 14px;
      --border-radius-full: 999px;
      
      /* Shadow Design Tokens */
      --shadow-sm: 0 6px 12px rgba(0,0,0,0.1);
      --shadow-md: 0 6px 20px rgba(15,23,42,0.6);
      --shadow-lg: 0 8px 25px rgba(15,23,42,0.8);
    }
    
    /* Agent Mode: CREATIVE (Blue) */
    body[data-agent-mode="creative"] {
      --color-agent-primary: #00B8FF;
      --color-agent-primary-hover: #0090CC;
      --color-agent-primary-light: rgba(0,184,255,0.1);
      --color-agent-primary-dark: #001A33;
      --color-agent-accent: #00B8FF;
      --button-primary-bg: #00B8FF;
      --button-primary-hover: #0090CC;
      --color-success: #00B8FF;
    }
    
    /* Agent Mode: MOMENTUM (Gold) */
    body[data-agent-mode="momentum"] {
      --color-agent-primary: #E4B402;
      --color-agent-primary-hover: #C29902;
      --color-agent-primary-light: rgba(228,180,2,0.1);
      --color-agent-primary-dark: #F6C700;
      --color-agent-accent: #E4B402;
      --button-primary-bg: #E4B402;
      --button-primary-hover: #C29902;
      --color-success: #E4B402;
    }
    
    /* Agent Mode: LEGACY (Purple) */
    body[data-agent-mode="legacy"] {
      --color-agent-primary: #9333EA;
      --color-agent-primary-hover: #7E22CE;
      --color-agent-primary-light: rgba(147,51,234,0.1);
      --color-agent-primary-dark: #581C87;
      --color-agent-accent: #9333EA;
      --button-primary-bg: #9333EA;
      --button-primary-hover: #7E22CE;
      --color-success: #9333EA;
    }
    
    /* Agent Mode: VISIONARY (Green - Default) */
    body[data-agent-mode="visionary"] {
      --color-agent-primary: #03C561;
      --color-agent-primary-hover: #029C49;
      --color-agent-primary-light: rgba(3,197,97,0.1);
      --color-agent-primary-dark: #003700;
      --color-agent-accent: #03C561;
      --button-primary-bg: #03C561;
      --button-primary-hover: #029C49;
      --color-success: #03C561;
    }
    
    /* Dark theme override */
    body[data-theme="dark"] {
      --color-primary-current: var(--color-primary-dark);
      --color-secondary-current: var(--color-secondary-dark);
      --color-background-current: var(--color-background-dark);
      --color-muted-current: var(--color-muted-dark);
      --color-border-current: var(--color-border-dark);
      --color-shadow-current: var(--color-shadow-dark);
    }
    
    body{
      font-family:var(--font-family-base);
      background:var(--color-background-current);
      margin:0;
      padding:0;
      color:var(--color-primary-current);
      min-height:100vh;
      overflow-x:hidden;
      box-sizing:border-box;
    }
    
    *, *::before, *::after {
      box-sizing:border-box;
    }
    .toggle-panel{
      position:fixed;
      top:var(--spacing-lg);
      right:var(--spacing-lg);
      z-index:1000;
    }
    .toggle-btn{
      padding:var(--spacing-sm) var(--spacing-md);
      border:1px solid var(--color-border-current);
      border-radius:var(--border-radius);
      background:var(--color-agent-primary-light);
      color:var(--color-primary-current);
      cursor:pointer;
      font-size:12px;
      transition:all 0.2s;
    }
    .toggle-btn:hover{
      background:var(--color-agent-primary-light);
      border-color:var(--color-agent-primary);
      opacity:0.8;
    }
    .top-panel{
      position:fixed;
      top:0;
      left:0;
      right:0;
      background:var(--color-background-current);
      border-bottom:1px solid var(--color-border-current);
      padding:var(--spacing-lg);
      z-index:999;
      transform:translateY(-100%);
      transition:transform 0.3s ease-in-out;
      max-height:70vh;
      overflow-y:auto;
    }
    .top-panel.visible{
      transform:translateY(0);
    }
    .wrap{
      max-width:100%;
      padding:var(--spacing-lg);
      padding-top:80px;
      margin:0;
      box-sizing:border-box;
    }
    h1{
      margin:0 0 var(--spacing-xs) 0;
      font-size:20px;
      font-weight:var(--font-weight-bold);
      color:var(--color-primary-current);
      letter-spacing: -0.02em;
    }
    .subtitle{
      font-size:12px;
      color:var(--color-muted-current);
      margin-bottom:var(--spacing-sm);
    }
    #status{
      font-size:12px;
      color:var(--color-muted-current);
      margin-bottom:var(--spacing-sm);
    }
    #uid-status{
      font-size:var(--font-size-xs);
      color:var(--color-muted-current);
      margin-bottom:var(--spacing-sm);
      padding:var(--spacing-sm);
      background:rgba(3,197,97,0.08);
      border-radius:var(--border-radius);
    }
    .uid-status-item{
      display:inline-block;
      margin-right:12px;
      padding:2px 6px;
      border-radius:var(--border-radius-sm);
      font-size:10px;
    }
    .uid-status-item.valid{
      background:#d1fae5;
      color:#065f46;
    }
    .uid-status-item.invalid{
      background:#fee2e2;
      color:#991b1b;
    }
    .uid-status-item.stalled{
      background:#fef3c7;
      color:#92400e;
    }
    .uid-status-item.unknown{
      background:#e5e7eb;
      color:#6b7280;
    }
    #log{
      font-family:var(--font-family-mono);
      font-size:var(--font-size-xs);
      white-space:pre-wrap;
      background:var(--color-secondary-current);
      border-radius:10px;
      padding:6px 8px;
      margin-bottom:var(--spacing-md);
      max-height:140px;
      overflow:auto;
      border:1px solid var(--color-border-current);
      font-weight:400;
      letter-spacing: 0.01em;
      color:var(--color-primary-current);
    }
    #log .line{
      padding:1px 0;
      color:var(--color-muted-current);
    }
    #list{
      display:grid;
      grid-template-columns:repeat(auto-fill,minmax(280px,1fr));
      gap:var(--spacing-md);
      margin-top:0;
      grid-auto-rows:min-content;
    }
    .item{
      background:var(--color-secondary-current);
      border-radius:var(--border-radius-xl);
      padding:var(--spacing-md);
      border:1px solid var(--color-border-current);
      box-shadow:0 2px 8px var(--color-shadow-current);
      transition:all 0.2s;
      grid-row:span auto;
      min-height:120px;
      display:flex;
      flex-direction:column;
    }
    .images{
      display:grid;
      grid-template-columns:repeat(2,1fr);
      gap:var(--spacing-xs);
      margin:var(--spacing-sm) 0;
      border-radius:var(--border-radius);
      overflow:hidden;
    }
    .images.single{
      grid-template-columns:1fr;
    }
    .image-container{
      position:relative;
      width:100%;
      padding-bottom:100%;
      overflow:hidden;
      border-radius:var(--border-radius-sm);
    }
    .post-image{
      position:absolute;
      top:0;
      left:0;
      width:100%;
      height:100%;
      object-fit:cover;
      cursor:pointer;
      transition:transform 0.2s;
    }
    .post-image:hover{
      transform:scale(1.05);
    }
    .item:hover{
      border-color:var(--color-agent-primary);
      transform:translateY(-2px);
      box-shadow:0 4px 12px var(--color-shadow-current);
    }
    .meta{
      font-size:var(--font-size-xs);
      color:var(--color-muted-current);
      margin-bottom:6px;
      display:flex;
      gap:6px;
      align-items:center;
      flex-wrap:wrap;
    }
    .meta .name{
      font-weight:var(--font-weight-semibold);
      color:var(--color-primary-current);
      font-size:var(--font-size-xs);
    }
    .meta .dot{
      opacity:0.5;
    }
    .text{
      font-size:var(--font-size-small);
      line-height:var(--line-height-body);
      color:var(--color-primary-current);
      margin-bottom:var(--spacing-sm);
      font-weight:var(--font-weight-regular);
    }
    .actions{
      display:flex;
      justify-content:flex-end;
    }
    .actions a{
      font-size:var(--font-size-xs);
      padding:4px 10px;
      border-radius:var(--border-radius-full);
      border:1px solid var(--color-agent-primary);
      text-decoration:none;
      color:var(--color-agent-primary);
      background:var(--color-agent-primary-light);
      font-weight:var(--font-weight-medium);
      letter-spacing: 0.01em;
      transition:all 0.2s;
    }
    .actions a:hover{
      background:var(--color-agent-primary);
      color:#FFF;
      border-color:var(--color-agent-primary-hover);
    }
    .empty{
      font-size:var(--font-size-small);
      color:var(--color-muted-current);
      padding:var(--spacing-xl);
      text-align:center;
      grid-column:1/-1;
    }
    .controls{
      margin-bottom:var(--spacing-md);
      display:flex;
      gap:var(--spacing-sm);
      flex-wrap:wrap;
    }
    .controls button{
      padding:6px 12px;
      border:1px solid var(--color-border-current);
      border-radius:var(--border-radius);
      background:var(--color-agent-primary-light);
      color:var(--color-primary-current);
      cursor:pointer;
      font-size:var(--font-size-xs);
      font-weight:var(--font-weight-medium);
      letter-spacing: 0.01em;
      transition:all 0.2s;
    }
    .controls button:hover{
      background:var(--color-agent-primary);
      color:#FFF;
      border-color:var(--color-agent-primary);
    }
    .controls button:disabled{
      opacity:0.5;
      cursor:not-allowed;
    }
    .mode-selector{
      display:flex;
      gap:var(--spacing-xs);
      margin-bottom:var(--spacing-md);
      padding:var(--spacing-sm);
      background:rgba(3,197,97,0.05);
      border-radius:var(--border-radius);
      border:1px solid var(--color-border-current);
    }
    .mode-btn{
      padding:var(--spacing-xs) var(--spacing-sm);
      border:1px solid transparent;
      border-radius:var(--border-radius-sm);
      background:transparent;
      color:var(--color-muted-current);
      cursor:pointer;
      font-size:var(--font-size-xs);
      font-weight:var(--font-weight-medium);
      transition:all 0.2s;
      flex:1;
      text-align:center;
    }
    .mode-btn:hover{
      background:rgba(3,197,97,0.08);
    }
    .mode-btn.active{
      background:var(--color-agent-primary);
      color:#FFF;
      border-color:var(--color-agent-primary);
    }
    .mode-btn.visionary{
      color:#03C561;
    }
    .mode-btn.visionary.active{
      background:#03C561;
      color:#FFF;
    }
    .mode-btn.creative{
      color:#00B8FF;
    }
    .mode-btn.creative.active{
      background:#00B8FF;
      color:#FFF;
    }
    .mode-btn.momentum{
      color:#E4B402;
    }
    .mode-btn.momentum.active{
      background:#E4B402;
      color:#FFF;
    }
    .mode-btn.legacy{
      color:#9333EA;
    }
    .mode-btn.legacy.active{
      background:#9333EA;
      color:#FFF;
    }
    @media (max-width:1200px){
      #list{
        grid-template-columns:repeat(3,minmax(280px,1fr));
      }
    }
    @media (max-width:900px){
      #list{
        grid-template-columns:repeat(2,minmax(320px,1fr));
      }
      .wrap{
        padding:var(--spacing-md);
        padding-top:80px;
      }
    }
    @media (max-width:600px){
      #list{
        grid-template-columns:1fr;
      }
      .wrap{
        padding:12px;
        padding-top:80px;
      }
    }
  </style>
</head>
<body>
  <div class="toggle-panel">
    <button class="toggle-btn" onclick="toggleTopPanel()">☰ Dashboard</button>
  </div>
  
  <div class="top-panel" id="topPanel">
    <div class="wrap">
      <h1>Weibo Timeline</h1>
      <div class="subtitle">
        Following ${accountsSummary}. This archive lives only in your browser.<br>
        Manual refresh: Click "Refresh All" to fetch new posts.
      </div>
      <div class="mode-selector">
        <button class="mode-btn visionary active" onclick="window.setAgentMode('visionary')">VISIONARY</button>
        <button class="mode-btn creative" onclick="window.setAgentMode('creative')">CREATIVE</button>
        <button class="mode-btn momentum" onclick="window.setAgentMode('momentum')">MOMENTUM</button>
        <button class="mode-btn legacy" onclick="window.setAgentMode('legacy')">LEGACY</button>
      </div>
      <div class="controls" style="margin-top: 8px;">
        <button id="theme-toggle-btn" onclick="window.toggleTheme()" style="flex: 1;">☀️ Light Theme</button>
        <button id="refresh-all-btn" onclick="window.refreshAll()" style="flex: 1; background: var(--color-agent-primary); color: white;">🔄 Refresh All</button>
      </div>
      <div id="uid-status"></div>
      <div class="controls">
        <button onclick="window.validateAllUids()">Validate All UIDs</button>
        <button onclick="window.exportUidHealth()">Export UID Health</button>
        <button onclick="window.showUidManagement()">Manage UIDs</button>
        <button onclick="window.editUids()">Edit UIDs</button>
        <button onclick="window.clearInvalidUids()">Clear Invalid UIDs</button>
      </div>
      <div id="status"></div>
      <div id="log"></div>
    </div>
  </div>
  
  <div class="wrap">
    <div id="list"></div>
  </div>
</body>
</html>`);
    doc.close();

    const listEl   = doc.getElementById("list");
    const logEl    = doc.getElementById("log");
    const statusEl = doc.getElementById("status");
    const uidStatusEl = doc.getElementById("uid-status");
    const topPanelEl = doc.getElementById("topPanel");

    // Toggle function for the top panel
    doc.toggleTopPanel = function() {
      if (topPanelEl.classList.contains('visible')) {
        topPanelEl.classList.remove('visible');
      } else {
        topPanelEl.classList.add('visible');
      }
    };

    // Agent mode management
    const AGENT_MODE_KEY = "weibo_agent_mode_v1";
    
    function loadAgentMode() {
      try {
        return localStorage.getItem(AGENT_MODE_KEY) || 'visionary';
      } catch (e) {
        console.error("WeiboTimeline: failed to load agent mode", e);
        return 'visionary';
      }
    }
    
    function saveAgentMode(mode) {
      try {
        localStorage.setItem(AGENT_MODE_KEY, mode);
      } catch (e) {
        console.error("WeiboTimeline: failed to save agent mode", e);
      }
    }
    
    tab.window.setAgentMode = function(mode) {
      // Update body data attribute
      doc.body.setAttribute('data-agent-mode', mode);
      
      // Update button active states
      const modeButtons = doc.querySelectorAll('.mode-btn');
      modeButtons.forEach(btn => {
        btn.classList.remove('active');
        if (btn.classList.contains(mode)) {
          btn.classList.add('active');
        }
      });
      
      // Save to localStorage
      saveAgentMode(mode);
      
      pageLog("AGENT_MODE_CHANGED", { mode });
    };
    
    // Initialize agent mode
    const initialMode = loadAgentMode();
    doc.body.setAttribute('data-agent-mode', initialMode);
    const initialModeBtn = doc.querySelector('.mode-btn.' + initialMode);
    if (initialModeBtn) {
      const allModeBtns = doc.querySelectorAll('.mode-btn');
      allModeBtns.forEach(btn => btn.classList.remove('active'));
      initialModeBtn.classList.add('active');
    }

    // Theme management
    const THEME_KEY_LOCAL = "weibo_theme_v1";
    
    function loadTheme() {
      try {
        return localStorage.getItem(THEME_KEY_LOCAL) || 'light';
      } catch (e) {
        console.error("WeiboTimeline: failed to load theme", e);
        return 'light';
      }
    }
    
    function saveTheme(theme) {
      try {
        localStorage.setItem(THEME_KEY_LOCAL, theme);
      } catch (e) {
        console.error("WeiboTimeline: failed to save theme", e);
      }
    }
    
    tab.window.toggleTheme = function() {
      const currentTheme = doc.body.getAttribute('data-theme') || 'light';
      const newTheme = currentTheme === 'light' ? 'dark' : 'light';
      
      doc.body.setAttribute('data-theme', newTheme);
      const themeBtnEl = doc.getElementById('theme-toggle-btn');
      if (themeBtnEl) {
        themeBtnEl.textContent = newTheme === 'light' ? '☀️ Light Theme' : '🌙 Dark Theme';
      }
      
      saveTheme(newTheme);
      pageLog("THEME_CHANGED", { theme: newTheme });
    };
    
    // Initialize theme
    const initialTheme = loadTheme();
    if (initialTheme === 'dark') {
      doc.body.setAttribute('data-theme', 'dark');
      const themeBtnEl = doc.getElementById('theme-toggle-btn');
      if (themeBtnEl) {
        themeBtnEl.textContent = '🌙 Dark Theme';
      }
    }

    function pageLog(label, data) {
      const now = new Date();
      const time = now.toISOString().slice(11, 19); // HH:MM:SS

      let payload = "";
      if (data !== undefined) {
        try {
          payload = " " + JSON.stringify(data);
        } catch {
          payload = " " + String(data);
        }
      }

      const full = "[" + time + "] " + label + payload;

      if (logEl) {
        const line = doc.createElement("div");
        line.className = "line";
        line.textContent = full;
        logEl.appendChild(line);
        logEl.scrollTop = logEl.scrollHeight;
      }

      console.log("[WeiboTimeline]", full);
    }

    function setStatus(message) {
      if (statusEl) statusEl.textContent = message;
    }

    // Load existing timeline from localStorage
    let timeline = loadTimeline();

    function updateUidStatus() {
      const health = loadUidHealth();
      const total = currentUsers.length;
      const valid = Object.values(health).filter(h => h.status === HEALTH_VALID).length;
      const invalid = Object.values(health).filter(h => h.status === HEALTH_INVALID).length;
      const stalled = Object.values(health).filter(h => h.status === HEALTH_STALLED).length;
      const unknown = total - valid - invalid - stalled;
      
      uidStatusEl.innerHTML = `
        <span class="uid-status-item valid">Valid: ${valid}</span>
        <span class="uid-status-item invalid">Invalid: ${invalid}</span>
        <span class="uid-status-item stalled">Stalled: ${stalled}</span>
        <span class="uid-status-item unknown">Unknown: ${unknown}</span>
      `;
    }

    updateUidStatus();
    pageLog("Dashboard opened", {
      accounts: currentUsers.length,
      storedEntries: Object.keys(timeline).length
    });

    // ---------------------------------------------------------------
    // RENDER TIMELINE
    // ---------------------------------------------------------------

    function renderTimeline() {
      const entries = Object.values(timeline);

      if (!entries.length) {
        listEl.innerHTML = "";
        const empty = doc.createElement("div");
        empty.className = "empty";
        empty.textContent =
          "No posts in your local archive yet. Keep this tab open and it will slowly fill up.";
        listEl.appendChild(empty);
        return;
      }

      // Sort by actual post creation time (FIXED)
      entries.sort((a, b) => {
        const timeA = parseWeiboTime(a.createdAt);
        const timeB = parseWeiboTime(b.createdAt);
        return timeB - timeA;
      });
      
      const limited = entries.slice(0, MAX_RENDER_ITEMS);

      listEl.innerHTML = "";
      limited.forEach(entry => {
        const item = doc.createElement("div");
        item.className = "item";

        const meta = doc.createElement("div");
        meta.className = "meta";

        if (entry.username) {
          const nameSpan = doc.createElement("span");
          nameSpan.className = "name";
          nameSpan.textContent = entry.username;
          meta.appendChild(nameSpan);
        }

        if (entry.username && entry.createdAt) {
          const dotSpan = doc.createElement("span");
          dotSpan.className = "dot";
          dotSpan.textContent = "•";
          meta.appendChild(dotSpan);
        }

        if (entry.createdAt) {
          const timeSpan = doc.createElement("span");
          timeSpan.className = "time";
          timeSpan.textContent = entry.createdAt;
          meta.appendChild(timeSpan);
        }

        const textDiv = doc.createElement("div");
        textDiv.className = "text";
        textDiv.textContent = truncate(entry.text, 200);

        // Add images if they exist
        if (entry.images && entry.images.length > 0) {
          const imagesDiv = doc.createElement("div");
          imagesDiv.className = entry.images.length === 1 ? "images single" : "images";

          entry.images.forEach((image, index) => {
            const imgContainer = doc.createElement("div");
            imgContainer.className = "image-container";

            const img = doc.createElement("img");
            img.className = "post-image";
            img.alt = image.alt;
            img.loading = "lazy";

            // Try to use downloaded image first, fallback to thumbnail
            const downloadedImages = loadImages();
            if (downloadedImages[image.key]) {
              img.src = downloadedImages[image.key].url;
            } else {
              img.src = image.thumbnail;
              // Download image in background
              downloadImage(image.url, image.key).catch(err => {
                console.warn("Failed to download image:", image.url, err);
              });
            }

            img.onclick = () => {
              // Open full size image in new tab
              window.open(image.url, '_blank');
            };

            imgContainer.appendChild(img);
            imagesDiv.appendChild(imgContainer);
          });

          item.appendChild(imagesDiv);
        }

        const actions = doc.createElement("div");
        actions.className = "actions";
        const link = doc.createElement("a");
        link.href = entry.link;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "Open on Weibo ↗";
        actions.appendChild(link);

        if (meta.childNodes.length > 0) {
          item.appendChild(meta);
        }
        item.appendChild(textDiv);
        item.appendChild(actions);

        listEl.appendChild(item);
      });
    }

    // ---------------------------------------------------------------
    // UID MANAGEMENT FUNCTIONS
    // ---------------------------------------------------------------

    // Make functions globally accessible to onclick handlers
    tab.window.validateAllUids = function validateAllUids() {
      setStatus("Validating all UIDs...");
      let checked = 0;
      
      currentUsers.forEach(async (uid, index) => {
        setStatus(`Validating UID ${index + 1}/${currentUsers.length}: ${uid}`);
        try {
          const json = await fetchUserPosts(uid, pageLog);
          
          if (json && json.ok === 1 && json.data && Array.isArray(json.data.cards) && json.data.cards.length > 0) {
            updateUidHealth(uid, HEALTH_VALID);
            pageLog("UID_VALID", { uid, cardsFound: json.data.cards.length });
          } else {
            updateUidHealth(uid, HEALTH_INVALID);
            pageLog("UID_INVALID", { uid, reason: "No valid cards found" });
          }
        } catch (error) {
          updateUidHealth(uid, HEALTH_INVALID);
          pageLog("UID_ERROR", { uid, error: error.message });
        }
        
        checked++;
        
        if (checked < currentUsers.length) {
          await sleep(BETWEEN_ACCOUNTS_MS);
        }
      });
      
      setStatus("Validation complete");
      updateUidStatus();
    }

    tab.window.refreshAll = function refreshAll() {
      setStatus("Starting manual refresh...");
      pageLog("MANUAL_REFRESH_START", { accounts: currentUsers.length });
      
      // Disable refresh button during process
      const refreshBtn = doc.getElementById('refresh-all-btn');
      if (refreshBtn) {
        refreshBtn.disabled = true;
        refreshBtn.textContent = '🔄 Refreshing...';
      }
      
      (async function runManualRefresh() {
        for (let i = 0; i < currentUsers.length; i++) {
          const uid = currentUsers[i];
          setStatus("Fetching account " + (i + 1) + " / " + currentUsers.length + "…");

          try {
            await processOneUid(uid);
          } catch (err) {
            pageLog("PROCESS_FATAL", {
              uid,
              error: err && err.message ? err.message : String(err)
            });
          }

          if (i < currentUsers.length - 1) {
            pageLog("SleepBetweenAccounts", { uid, ms: BETWEEN_ACCOUNTS_MS });
            try {
              await sleep(BETWEEN_ACCOUNTS_MS);
              pageLog("AfterSleepBetweenAccounts", { uid });
            } catch (e) {
              pageLog("SleepError", {
                uid,
                error: e && e.message ? e.message : String(e)
              });
            }
          }
        }
        
        setStatus("Manual refresh complete");
        pageLog("MANUAL_REFRESH_COMPLETE");
        
        // Re-enable refresh button
        if (refreshBtn) {
          refreshBtn.disabled = false;
          refreshBtn.textContent = '🔄 Refresh All';
        }
      })();
    }

    tab.window.editUids = function editUids() {
      const modal = doc.createElement('div');
      modal.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center;
        z-index: 10000;
      `;
      
      const content = doc.createElement('div');
      content.style.cssText = `
        background: var(--color-background-current); padding: var(--spacing-lg); border-radius: var(--border-radius-lg); 
        max-width: 600px; max-height: 80vh; overflow-y: auto; margin: var(--spacing-lg);
        box-shadow: var(--shadow-lg);
      `;
      
      content.innerHTML = `
        <h3 style="margin: 0 0 var(--spacing-md) 0; color: var(--color-primary-current);">Edit Weibo UIDs</h3>
        <p style="margin: 0 0 var(--spacing-md) 0; color: var(--color-muted-current); font-size: var(--font-size-small);">
          Enter one Weibo UID per line. UIDs are typically 6-11 digit numbers.
        </p>
        <textarea id="uids-textarea" style="
          width: 100%; height: 300px; padding: var(--spacing-sm); border: 1px solid var(--color-border-current);
          border-radius: var(--border-radius); background: var(--color-secondary-current); 
          color: var(--color-primary-current); font-family: var(--font-family-mono); font-size: var(--font-size-small);
          resize: vertical;
        ">${currentUsers.join('\n')}</textarea>
        <div style="margin-top: var(--spacing-md); display: flex; gap: var(--spacing-sm); justify-content: flex-end;">
          <button onclick="window.closeUidModal()" style="
            padding: var(--spacing-sm) var(--spacing-md); border: 1px solid var(--color-border-current);
            border-radius: var(--border-radius); background: var(--color-secondary-current); 
            color: var(--color-primary-current); cursor: pointer;
          ">Cancel</button>
          <button onclick="window.saveUids()" style="
            padding: var(--spacing-sm) var(--spacing-md); border: none; border-radius: var(--border-radius);
            background: var(--color-agent-primary); color: white; cursor: pointer;
          ">Save UIDs</button>
        </div>
      `;
      
      modal.appendChild(content);
      doc.body.appendChild(modal);
      
      // Make functions globally accessible
      tab.window.closeUidModal = function() {
        modal.remove();
      }
      
      tab.window.saveUids = function() {
        const textarea = doc.getElementById('uids-textarea');
        const lines = textarea.value.split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0)
          .filter(line => validateUid(line));
        
        if (lines.length === 0) {
          alert('No valid UIDs found. Please enter at least one valid 6-11 digit UID.');
          return;
        }
        
        currentUsers = lines;
        saveUsers(currentUsers);
        
        pageLog("UIDS_UPDATED", { 
          oldCount: currentUsers.length, 
          newCount: lines.length,
          uids: lines 
        });
        
        modal.remove();
        updateUidStatus();
        
        alert(`Successfully updated to ${lines.length} UIDs. The page will now use this new list.`);
      }
    }

    tab.window.exportUidHealth = function exportUidHealth() {
      const health = loadUidHealth();
      const data = {
        exportDate: new Date().toISOString(),
        totalUids: currentUsers.length,
        health: health
      };
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = doc.createElement('a');
      a.href = url;
      a.download = `weibo-uid-health-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      
      URL.revokeObjectURL(url);
      pageLog("UID health exported");
    }

    tab.window.showUidManagement = function showUidManagement() {
      const health = loadUidHealth();
      const invalidUids = currentUsers.filter(uid => {
        const h = health[uid];
        return !h || h.status === HEALTH_INVALID || h.status === HEALTH_STALLED;
      });
      
      if (invalidUids.length === 0) {
        alert("No invalid or stalled UIDs found. All UIDs appear to be working correctly.");
        return;
      }
      
      const message = `Found ${invalidUids.length} problematic UIDs:\n\n` + 
        invalidUids.map(uid => {
          const h = health[uid];
          const status = h?.status || HEALTH_UNKNOWN;
          const lastChecked = h?.lastChecked ? new Date(h.lastChecked).toLocaleString() : 'Never';
          return `${uid}: ${status} (last checked: ${lastChecked})`;
        }).join('\n') + '\n\nUse "Edit UIDs" to remove these problematic UIDs.';
      
      const modal = doc.createElement('div');
      modal.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center;
        z-index: 10000;
      `;
      
      const content = doc.createElement('div');
      content.style.cssText = `
        background: var(--color-background-current); padding: var(--spacing-lg); border-radius: var(--border-radius-lg); max-width: 600px;
        max-height: 80vh; overflow-y: auto; margin: var(--spacing-lg);
        box-shadow: var(--shadow-lg);
      `;
      content.innerHTML = `
        <h3 style="margin: 0 0 var(--spacing-md) 0; color: var(--color-primary-current);">Problematic UIDs Found</h3>
        <pre style="background: var(--color-secondary-current); padding: var(--spacing-sm); border-radius: var(--border-radius-sm); overflow-x: auto; color: var(--color-primary-current); font-size: var(--font-size-xs);">${message}</pre>
        <button onclick="window.closeModal()" style="
          margin-top: var(--spacing-sm); padding: var(--spacing-sm) var(--spacing-md); border: none; border-radius: var(--border-radius-sm);
          background: var(--color-agent-primary); color: white; cursor: pointer;
        ">Close</button>
      `;
      
      modal.appendChild(content);
      doc.body.appendChild(modal);
    }

    tab.window.clearInvalidUids = function clearInvalidUids() {
      if (!confirm(`Remove all invalid and stalled UIDs from your list?`)) {
        return;
      }
      
      const health = loadUidHealth();
      const validUids = currentUsers.filter(uid => {
        const h = health[uid];
        return h && h.status === HEALTH_VALID;
      });
      
      currentUsers = validUids;
      saveUsers(currentUsers);
      
      pageLog("INVALID_UIDS_REMOVED", { 
        oldCount: currentUsers.length, 
        newCount: validUids.length,
        removedCount: currentUsers.length - validUids.length
      });
      
      updateUidStatus();
      alert(`Successfully removed ${currentUsers.length - validUids.length} invalid UIDs. Now following ${validUids.length} accounts.`);
    }

    // Helper function for modal close button
    tab.window.closeModal = function() {
      const modal = doc.querySelector('div[style*="position: fixed"]');
      if (modal) {
        modal.remove();
      }
    }

    // Initial render
    renderTimeline();

    // ---------------------------------------------------------------
    // PROCESS ONE UID (now self-contained, errors won't kill loop)
    // ---------------------------------------------------------------

    async function processOneUid(uid) {
      pageLog("PROCESS_START", { uid });

      try {
        const json = await fetchUserPosts(uid, pageLog);

        if (!json || json.ok !== 1 || !json.data || !Array.isArray(json.data.cards)) {
          pageLog("API_NOT_OK", { uid, ok: json && json.ok });
          updateUidHealth(uid, HEALTH_INVALID);
          return;
        }

        const cards = json.data.cards;
        let added = 0;

        cards.forEach((cardData, idx) => {
          if (cardData.card_type !== 9 || !cardData.mblog) return;
          const mblog = cardData.mblog;

          const bid = mblog.bid || String(mblog.id || ("idx" + idx));
          const key = uid + "_" + bid;

          if (timeline[key]) return; // already in archive

          let username = "";
          if (mblog.user) {
            username =
              mblog.user.screen_name ||
              mblog.user.remark ||
              mblog.user.name ||
              "";
          }

          const tmp = doc.createElement("div");
          tmp.innerHTML = mblog.text || "";
          const plainText =
            (tmp.textContent || tmp.innerText || "").trim();

          const createdAt  = mblog.created_at || "";
          const created_ts = parseWeiboTime(createdAt); // FIXED: Parse actual post time
          const link       = "https://weibo.com/" + uid + "/" + bid;
          
          // Extract images from the post
          const images = extractImages(mblog);

          timeline[key] = {
            key,
            uid,
            username,
            bid,
            text: plainText,
            createdAt,
            created_ts,
            link,
            images: images
          };

          added++;
        });

        if (added > 0) {
          updateUidHealth(uid, HEALTH_VALID);
          saveTimeline(timeline);
          pageLog("PROCESS_DONE", {
            uid,
            added,
            totalEntries: Object.keys(timeline).length
          });
          renderTimeline();
          updateUidStatus();
        } else {
          pageLog("PROCESS_DONE", { uid, added: 0 });
          // Mark as stalled if no new posts but API was successful
          const existingHealth = getUidHealth(uid);
          if (existingHealth.status !== HEALTH_VALID) {
            updateUidHealth(uid, HEALTH_STALLED);
          }
        }

        // Save this UID as the last successfully processed
        saveLastUid(uid);
        
      } catch (err) {
        pageLog("PROCESS_FAILED", {
          uid,
          error: err && err.message ? err.message : String(err)
        });
        updateUidHealth(uid, HEALTH_INVALID);
      }
    }

    // ---------------------------------------------------------------
    // MANUAL REFRESH ONLY (AUTO-REFRESH DISABLED)
    // ---------------------------------------------------------------
    
    pageLog("MANUAL_REFRESH_MODE", { 
      message: "Auto-refresh disabled. Use 'Refresh All' button for manual updates."
    });
    
    setStatus("Ready for manual refresh. Click 'Refresh All' to fetch new posts.");
  });

  // Additional menu command for UID management
  GM_registerMenuCommand("🔧 UID Management", function () {
    const currentUsersForMenu = loadUsers();
    const health = loadUidHealth();
    const total = currentUsersForMenu.length;
    const valid = Object.values(health).filter(h => h.status === HEALTH_VALID).length;
    const invalid = Object.values(health).filter(h => h.status === HEALTH_INVALID).length;
    const stalled = Object.values(health).filter(h => h.status === HEALTH_STALLED).length;
    const unknown = total - valid - invalid - stalled;
    
    const message = `UID Health Summary:\n\n` +
      `Total UIDs: ${total}\n` +
      `Valid: ${valid}\n` +
      `Invalid: ${invalid}\n` +
      `Stalled: ${stalled}\n` +
      `Unknown: ${unknown}\n\n` +
      `Last checked: ${new Date().toLocaleString()}\n\n` +
      `Use the main dashboard to manage UIDs.`;
    
    alert(message);
  });

})();