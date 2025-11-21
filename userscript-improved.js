// ==UserScript==
// @name         Weibo Timeline (Hourly, Merged, Text-Only • v3.2)
// @namespace    http://tampermonkey.net/
// @version      3.2
// @description  Merged Weibo timeline: slow hourly polling, text-only UI, local archive, username-first display. Enhanced with proper timeline sorting and UID management.
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
  // How often to complete a full cycle of all accounts
  const CYCLE_INTERVAL_MS   = 60 * 60 * 1000; // 1 hour

  // LocalStorage keys
  const TIMELINE_KEY = "weibo_timeline_v3";
  const UID_HEALTH_KEY = "weibo_uid_health_v1";

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
    const accountsSummary = USERS.length + " accounts";

    doc.open();
    doc.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Weibo Timeline</title>
  <style>
    body{
      font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      background:#020617;
      margin:0;
      padding:24px;
      color:#e5e7eb;
      display:flex;
      justify-content:center;
    }
    .wrap{
      width:100%;
      max-width:780px;
    }
    h1{
      margin:0 0 4px 0;
      font-size:20px;
      font-weight:600;
      color:#e5e7eb;
    }
    .subtitle{
      font-size:12px;
      color:#9ca3af;
      margin-bottom:8px;
    }
    #status{
      font-size:12px;
      color:#9ca3af;
      margin-bottom:8px;
    }
    #uid-status{
      font-size:11px;
      color:#9ca3af;
      margin-bottom:8px;
      padding:8px;
      background:rgba(148,163,184,0.1);
      border-radius:6px;
    }
    .uid-status-item{
      display:inline-block;
      margin-right:12px;
      padding:2px 6px;
      border-radius:3px;
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
      font-family:SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace;
      font-size:11px;
      white-space:pre-wrap;
      background:#020617;
      border-radius:10px;
      padding:6px 8px;
      margin-bottom:12px;
      max-height:140px;
      overflow:auto;
      border:1px solid rgba(148,163,184,0.3);
    }
    #log .line{
      padding:1px 0;
      color:#9ca3af;
    }
    #list{
      display:flex;
      flex-direction:column;
      gap:10px;
      margin-top:4px;
    }
    .item{
      background:#020617;
      border-radius:14px;
      padding:10px 12px;
      border:1px solid rgba(148,163,184,0.25);
      box-shadow:0 6px 20px rgba(15,23,42,0.6);
    }
    .item:hover{
      border-color:rgba(248,250,252,0.6);
    }
    .meta{
      font-size:11px;
      color:#9ca3af;
      margin-bottom:4px;
      display:flex;
      gap:6px;
      align-items:center;
    }
    .meta .name{
      font-weight:500;
      color:#e5e7eb;
    }
    .meta .dot{
      opacity:0.5;
    }
    .text{
      font-size:13px;
      line-height:1.5;
      color:#e5e7eb;
      margin-bottom:6px;
    }
    .actions{
      display:flex;
      justify-content:flex-end;
    }
    .actions a{
      font-size:11px;
      padding:4px 10px;
      border-radius:999px;
      border:1px solid rgba(59,130,246,0.8);
      text-decoration:none;
      color:#bfdbfe;
      background:rgba(37,99,235,0.1);
    }
    .actions a:hover{
      background:rgba(37,99,235,0.18);
      border-color:rgba(191,219,254,1);
    }
    .empty{
      font-size:13px;
      color:#6b7280;
      padding:16px 4px;
      text-align:center;
    }
    .controls{
      margin-bottom:12px;
      display:flex;
      gap:8px;
      flex-wrap:wrap;
    }
    .controls button{
      padding:6px 12px;
      border:1px solid rgba(148,163,184,0.3);
      border-radius:6px;
      background:rgba(37,99,235,0.1);
      color:#e5e7eb;
      cursor:pointer;
      font-size:11px;
    }
    .controls button:hover{
      background:rgba(37,99,235,0.2);
    }
    .controls button:disabled{
      opacity:0.5;
      cursor:not-allowed;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Weibo Timeline</h1>
    <div class="subtitle">
      Following ${accountsSummary}. This archive lives only in your browser.<br>
      Auto-refresh: ~once per hour, one account every ~5 seconds.
    </div>
    <div id="uid-status"></div>
    <div class="controls">
      <button onclick="validateAllUids()">Validate All UIDs</button>
      <button onclick="exportUidHealth()">Export UID Health</button>
      <button onclick="showUidManagement()">Manage UIDs</button>
      <button onclick="clearInvalidUids()">Clear Invalid UIDs</button>
    </div>
    <div id="status"></div>
    <div id="log"></div>
    <div id="list"></div>
  </div>
</body>
</html>`);
    doc.close();

    const listEl   = doc.getElementById("list");
    const logEl    = doc.getElementById("log");
    const statusEl = doc.getElementById("status");
    const uidStatusEl = doc.getElementById("uid-status");

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

    function updateUidStatus() {
      const health = loadUidHealth();
      const total = USERS.length;
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

    // Load existing timeline from localStorage
    let timeline = loadTimeline();
    updateUidStatus();
    pageLog("Dashboard opened", {
      accounts: USERS.length,
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

    function validateAllUids() {
      setStatus("Validating all UIDs...");
      let checked = 0;
      
      USERS.forEach(async (uid, index) => {
        setStatus(`Validating UID ${index + 1}/${USERS.length}: ${uid}`);
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
        
        if (checked < USERS.length) {
          await sleep(BETWEEN_ACCOUNTS_MS);
        }
      });
      
      setStatus("Validation complete");
      updateUidStatus();
    }

    function exportUidHealth() {
      const health = loadUidHealth();
      const data = {
        exportDate: new Date().toISOString(),
        totalUids: USERS.length,
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

    function showUidManagement() {
      const health = loadUidHealth();
      const invalidUids = USERS.filter(uid => {
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
        }).join('\n') + '\n\nThese UIDs can be safely removed from the USERS array in the script.';
      
      const modal = doc.createElement('div');
      modal.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center;
        z-index: 10000;
      `;
      
      const content = doc.createElement('div');
      content.style.cssText = `
        background: white; padding: 20px; border-radius: 8px; max-width: 600px;
        max-height: 80vh; overflow-y: auto; margin: 20px;
      `;
      content.innerHTML = `
        <h3>Problematic UIDs Found</h3>
        <pre style="background: #f5f5f5; padding: 10px; border-radius: 4px; overflow-x: auto;">${message}</pre>
        <button onclick="this.parentElement.parentElement.remove()" style="
          margin-top: 10px; padding: 8px 16px; border: none; border-radius: 4px;
          background: #2563eb; color: white; cursor: pointer;
        ">Close</button>
      `;
      
      modal.appendChild(content);
      doc.body.appendChild(modal);
    }

    function clearInvalidUids() {
      if (!confirm(`Remove all invalid and stalled UIDs from the script? This will require manually editing the userscript file.`)) {
        pageLog("MANUAL_UID_REMOVAL", { 
          message: "User must manually remove invalid UIDs from USERS array" 
        });
        alert(`To remove invalid UIDs:\n\n1. Open the userscript in Tampermonkey\n2. Find the USERS array\n3. Remove these UIDs: ${USERS.filter(uid => {
          const h = loadUidHealth()[uid];
          return h && (h.status === HEALTH_INVALID || h.status === HEALTH_STALLED);
        }).join(', ')}\n\n4. Save the script\n\nThe UID health data will remain for reference.`);
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

          timeline[key] = {
            key,
            uid,
            username,
            bid,
            text: plainText,
            createdAt,
            created_ts,
            link
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
      } catch (err) {
        pageLog("PROCESS_FAILED", {
          uid,
          error: err && err.message ? err.message : String(err)
        });
        updateUidHealth(uid, HEALTH_INVALID);
      }
    }

    // ---------------------------------------------------------------
    // AUTO-REFRESH LOOP (HOURLY CYCLES, WITH FULL TRY/CATCH)
    // ---------------------------------------------------------------

    (async function runAutoRefresh() {
      pageLog("AutoRefreshStart", {
        betweenAccountsSec: BETWEEN_ACCOUNTS_MS / 1000,
        cycleSec: CYCLE_INTERVAL_MS / 1000
      });

      while (true) {
        const cycleStart = Date.now();
        pageLog("CycleStart", { at: new Date(cycleStart).toISOString() });

        for (let i = 0; i < USERS.length; i++) {
          const uid = USERS[i];
          setStatus("Fetching account " + (i + 1) + " / " + USERS.length + "…");

          try {
            await processOneUid(uid);
          } catch (err) {
            // This should almost never fire, but if it does, it won't kill the loop
            pageLog("PROCESS_FATAL", {
              uid,
              error: err && err.message ? err.message : String(err)
            });
          }

          if (i < USERS.length - 1) {
            pageLog("SleepBetweenAccounts", { uid, ms: BETWEEN_ACCOUNTS_MS });
            await sleep(BETWEEN_ACCOUNTS_MS);
          }
        }

        const elapsed   = Date.now() - cycleStart;
        const remaining = CYCLE_INTERVAL_MS - elapsed;

        if (remaining > 0) {
          const mins = Math.round(remaining / 60000);
          setStatus(
            "Idle. Next full refresh in about " +
              mins +
              " minute" +
              (mins === 1 ? "" : "s") +
              "."
          );
          pageLog("CycleSleep", { elapsedMs: elapsed, sleepMs: remaining });
          await sleep(remaining);
        } else {
          setStatus("Starting next cycle immediately (loop took longer than an hour).");
          pageLog("CycleNoSleep", { elapsedMs: elapsed });
          // loop continues immediately
        }
      }
    })();
  });

  // Additional menu command for UID management
  GM_registerMenuCommand("🔧 UID Management", function () {
    const health = loadUidHealth();
    const total = USERS.length;
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