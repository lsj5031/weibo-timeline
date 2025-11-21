// ==UserScript==
// @name         Weibo Timeline (Hourly, Merged, Text-Only • v3.1)
// @namespace    http://tampermonkey.net/
// @version      3.1
// @description  Merged Weibo timeline: slow hourly polling, text-only UI, local archive, username-first display. More robust loop for many accounts.
// @author       Grok
// @match        *://*/*
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @grant        GM
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

  // LocalStorage key for the merged timeline
  const TIMELINE_KEY = "weibo_timeline_v2";
  
  // LocalStorage key for tracking last processed UID
  const LAST_UID_KEY = "weibo_last_uid_v2";

  // Weibo mobile API endpoint
  const API_BASE = "https://m.weibo.cn/api/container/getIndex";

  // How many items to render at most (UI only; archive can be larger)
  const MAX_RENDER_ITEMS = 400;

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
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Weibo Timeline</h1>
    <div class="subtitle">
      Following ${accountsSummary}. This archive lives only in your browser.<br>
      Auto-refresh: ~once per hour, one account every ~5 seconds.
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

      entries.sort((a, b) => (b.created_ts || 0) - (a.created_ts || 0));
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
          const created_ts = Date.now();
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
          saveTimeline(timeline);
          pageLog("PROCESS_DONE", {
            uid,
            added,
            totalEntries: Object.keys(timeline).length
          });
          renderTimeline();
        } else {
          pageLog("PROCESS_DONE", { uid, added: 0 });
        }

        // Save this UID as the last successfully processed
        saveLastUid(uid);
        
      } catch (err) {
        pageLog("PROCESS_FAILED", {
          uid,
          error: err && err.message ? err.message : String(err)
        });
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

      // Load last processed UID to resume from there
      const lastUid = loadLastUid();
      let startIndex = 0;
      
      if (lastUid) {
        const lastUidIndex = USERS.indexOf(lastUid);
        if (lastUidIndex !== -1) {
          startIndex = lastUidIndex + 1; // Start from the next UID after the last processed one
          if (startIndex >= USERS.length) {
            startIndex = 0; // Wrap around if we reached the end
          }
          pageLog("ResumeFromLastUid", { lastUid, startIndex: startIndex + 1 });
        } else {
          pageLog("LastUidNotFound", { lastUid });
        }
      }

      while (true) {
        const cycleStart = Date.now();
        pageLog("CycleStart", { 
          at: new Date(cycleStart).toISOString(),
          startIndex: startIndex + 1,
          totalAccounts: USERS.length
        });

        for (let i = startIndex; i < USERS.length; i++) {
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

        // Reset startIndex to 0 after completing a partial cycle
        startIndex = 0;

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

})();
