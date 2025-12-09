// ==UserScript==
// @name         Weibo Timeline (Manual Refresh, Enhanced UI • v4.4.2)
// @namespace    http://tampermonkey.net/
// @version      4.4.2
// @description  Enhanced Weibo timeline: v4.4.2 fixes network diagnostic failure on weibo.com by using GM_xmlhttpRequest. v4.4.1 fixes image loading in popup (self-contained data URL dashboard), resolves scope issues with lazy loading/observer, unblocks manual refresh hangs via improved error isolation and popup injection. Includes ghost response timeout fixes, improved retry logic (auto-retry on hangs), random jitter in request spacing, increased delay between accounts (10s), and enhanced timeout handling (25s hard abort). Dual containerid fallback, blob URL cleanup, retweet support, video thumbnails, progress tracking. Manual refresh with retry logic, editable UIDs, image support with concurrency control, improved masonry layout, theme modes (Visionary/Creative/Momentum/Legacy), robust request handling, local archive with visual content.
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
// @connect      sinaimg.cn
// @connect      *
// @run-at       document-end
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
    // ← add UIDs here
  ];

  // Spacing between API calls for different accounts
  const BETWEEN_ACCOUNTS_MS = 10 * 1000;      // 10 seconds (safer for 2025 Weibo anti-scraping)
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

  // Pagination configuration
  const PAGE_SIZE = 50;
  const MAX_STORED_POSTS = 3000; // Hard limit for LocalStorage (safe for 5MB quota)
  let currentRenderCount = PAGE_SIZE;

  // Image download controls
  const IMAGE_DOWNLOAD_CONCURRENCY = 3;
  const IMAGE_DOWNLOAD_FAILSAFE_MS = 30000;
  const IMAGE_PLACEHOLDER_DATA_URL =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect width='100' height='100' fill='%23f0f0f0'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23999' font-size='12'%3ELoading...%3C/text%3E%3C/svg%3E";
  const IMAGE_ERROR_DATA_URL =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect width='100' height='100' fill='%23ffebee'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23c62828' font-size='12'%3EFailed%3C/text%3E%3C/svg%3E";

  // Runtime state
  let manualRefreshInProgress = false;
  let lastRefreshTime = null;
  let deferRenderingDuringRefresh = false;

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

  // 1. Initialize empty object (do not read from localStorage)
  function loadImages() {
    return {}; 
  }

  // 2. Disable saving (do not write to localStorage)
  function saveImages(images) {
    // Intentionally empty. 
    // We cannot save Blobs to localStorage, and Base64 is too big.
    // Images will re-download (fast) every time you refresh the dashboard.
  }

  const imageDownloadQueue = [];
  const pendingImageDownloads = new Map();
  const pendingImageTimeouts = new Map();
  const failedImageDownloads = new Set(); // Track permanently failed images to avoid retry loops
  let activeImageDownloads = 0;
  let imageDownloadsPaused = false;
  let imageProcessingDeferred = false; // Flag to defer image processing
  const activeBlobUrls = new Set();
  const PENDING_DOWNLOAD_TIMEOUT_MS = 45000; // 45 seconds timeout for stuck pending downloads
  const FAILED_IMAGE_RETRY_COOLDOWN = 300000; // 5 minutes before retrying failed images
  const IMAGE_CACHE_VALIDITY_MS = 3600000; // 1 hour cache validity
  const IMAGE_CACHE_SOFT_LIMIT = 500; // Maximum blobs to keep in memory
  // 3. Ensure the cache object exists
  let imagesCache = null;
  function getImagesCache() {
    if (!imagesCache) {
      imagesCache = {};
    }
    
    // Evict old/least-used entries if over soft limit
    const now = Date.now();
    const keys = Object.keys(imagesCache);
    
    if (keys.length > IMAGE_CACHE_SOFT_LIMIT) {
      // Sort by lastAccessed (LRU eviction)
      keys.sort((a, b) => {
        const accessA = imagesCache[a].lastAccessed || imagesCache[a].downloadedAt;
        const accessB = imagesCache[b].lastAccessed || imagesCache[b].downloadedAt;
        return accessA - accessB;
      });
      
      const toEvict = keys.slice(0, keys.length - IMAGE_CACHE_SOFT_LIMIT);
      toEvict.forEach(key => {
        if (imagesCache[key].url.startsWith('blob:')) {
          URL.revokeObjectURL(imagesCache[key].url);
          activeBlobUrls.delete(imagesCache[key].url);
        }
        delete imagesCache[key];
      });
      
      if (toEvict.length > 0) {
        console.log("[WeiboTimeline] IMAGE_CACHE_EVICTED", { 
          evicted: toEvict.length, 
          remaining: Object.keys(imagesCache).length,
          reason: "soft_limit_exceeded"
        });
      }
    }
    
    return imagesCache;
  }
  
  // Run cache cleanup every 5 minutes
  setInterval(() => {
    const cache = getImagesCache();
    const now = Date.now();
    const keys = Object.keys(cache);
    let evictedStale = 0;
    
    // Remove stale entries (> 1 hour old)
    keys.forEach(key => {
      const cacheAge = now - cache[key].downloadedAt;
      if (cacheAge > IMAGE_CACHE_VALIDITY_MS) {
        if (cache[key].url.startsWith('blob:')) {
          URL.revokeObjectURL(cache[key].url);
          activeBlobUrls.delete(cache[key].url);
        }
        delete cache[key];
        evictedStale++;
      }
    });
    
    if (evictedStale > 0) {
      console.log("[WeiboTimeline] IMAGE_CACHE_EVICTED", { 
        evicted: evictedStale,
        remaining: Object.keys(cache).length,
        reason: "stale_entries"
      });
    }
  }, 300000); // 5 minutes

  function pauseImageDownloads() {
    imageDownloadsPaused = true;
  }

  function resumeImageDownloads() {
    if (!imageDownloadsPaused) return;
    imageDownloadsPaused = false;
    processImageDownloadQueue();
  }

  function deferImageProcessing(defer = true) {
    imageProcessingDeferred = defer;
    if (!defer && !imageDownloadsPaused) {
      // Resume processing when deferral is lifted
      setTimeout(() => processImageDownloadQueue(), 100);
    }
  }

  // Periodic cleanup of stale pending downloads
  function cleanupStaleDownloads() {
    const now = Date.now();
    const staleKeys = [];
    
    for (const [key, timeout] of pendingImageTimeouts.entries()) {
      if (now - timeout > PENDING_DOWNLOAD_TIMEOUT_MS) {
        staleKeys.push(key);
      }
    }
    
    if (staleKeys.length > 0) {
      for (const key of staleKeys) {
        pendingImageDownloads.delete(key);
        pendingImageTimeouts.delete(key);
        failedImageDownloads.add(key);
        setTimeout(() => failedImageDownloads.delete(key), FAILED_IMAGE_RETRY_COOLDOWN);
      }
      
      console.log("[WeiboTimeline] CLEANUP_STALE_DOWNLOADS", {
        cleanedCount: staleKeys.length,
        staleKeys
      });
    }
  }

  // Run cleanup every 2 minutes
  setInterval(cleanupStaleDownloads, 120000);

  // Network connectivity diagnostics
  function getNetworkDiagnostics() {
    return {
      online: navigator.onLine,
      connection: navigator.connection ? {
        effectiveType: navigator.connection.effectiveType,
        downlink: navigator.connection.downlink,
        rtt: navigator.connection.rtt,
        saveData: navigator.connection.saveData
      } : null,
      userAgent: navigator.userAgent.substring(0, 100),
      cookieEnabled: navigator.cookieEnabled,
      doNotTrack: navigator.doNotTrack,
      language: navigator.language,
      platform: navigator.platform,
      timestamp: new Date().toISOString()
    };
  }

  // Test network connectivity to Weibo domains
  async function testWeiboConnectivity() {
    const testUrls = [
      'https://weibo.com/',
      'https://m.weibo.cn/',
      'https://sinaimg.cn/'
    ];
    
    const results = [];
    
    for (const url of testUrls) {
      try {
        const startTime = Date.now();
        
        await new Promise((resolve, reject) => {
          gmRequest({
            method: 'GET',
            url: url,
            timeout: 15000,
            headers: {
              "User-Agent": navigator.userAgent,
              "Cache-Control": "no-cache",
              "Referer": "https://weibo.com/",
              "Origin": "https://weibo.com"
            },
            onload: (response) => {
              if (response.status >= 200 && response.status < 400) {
                resolve(response);
              } else {
                reject(new Error(`HTTP ${response.status}`));
              }
            },
            onerror: (error) => {
              reject(new Error("Network error"));
            },
            ontimeout: () => {
              reject(new Error("Timeout"));
            }
          });
        });

        const duration = Date.now() - startTime;
        results.push({
          url,
          success: true,
          duration,
          error: null
        });
      } catch (error) {
        results.push({
          url,
          success: false,
          duration: null,
          error: error.message
        });
      }
    }
    
    return results;
  }

  // Track image failure patterns for diagnostics
  const imageFailureStats = {
    totalAttempts: 0,
    totalFailures: 0,
    recentFailures: [],
    lastDiagnosticTime: 0
  };

  // Run network diagnostics when image failure rate is high
  async function checkImageFailurePatterns() {
    const now = Date.now();
    const recentFailures = imageFailureStats.recentFailures.filter(f => now - f.timestamp < 300000); // Last 5 minutes
    
    if (recentFailures.length >= 5 && (now - imageFailureStats.lastDiagnosticTime) > 300000) {
      // High failure rate detected, run diagnostics
      imageFailureStats.lastDiagnosticTime = now;
      
      const networkInfo = getNetworkDiagnostics();
      const connectivityResults = await testWeiboConnectivity();
      
      console.log("[WeiboTimeline] IMAGE_FAILURE_PATTERN_DETECTED", {
        recentFailures: recentFailures.length,
        totalAttempts: imageFailureStats.totalAttempts,
        totalFailures: imageFailureStats.totalFailures,
        failureRate: ((recentFailures.length / Math.max(imageFailureStats.totalAttempts, 1)) * 100).toFixed(2) + '%',
        networkInfo,
        connectivityResults
      });
    }
  }

  function recordImageFailure(key, error, statusCode) {
    imageFailureStats.totalAttempts++;
    imageFailureStats.totalFailures++;
    imageFailureStats.recentFailures.push({
      key,
      error,
      statusCode,
      timestamp: Date.now()
    });
    
    // Keep only recent failures
    if (imageFailureStats.recentFailures.length > 20) {
      imageFailureStats.recentFailures = imageFailureStats.recentFailures.slice(-20);
    }
    
    checkImageFailurePatterns();
  }

  function processImageDownloadQueue() {
    if (imageDownloadsPaused) {
      return;
    }
    while (
      activeImageDownloads < IMAGE_DOWNLOAD_CONCURRENCY &&
      imageDownloadQueue.length > 0
    ) {
      const task = imageDownloadQueue.shift();
      if (task) {
        startImageDownload(task);
      }
    }
  }

  // Helper to wait before retrying
  const wait = (ms) => new Promise(res => setTimeout(res, ms));

  function startImageDownload(task, attempt = 1) {
    const { url, key, resolve, reject, logger } = task;
    const MAX_ATTEMPTS = 3;
    const startTime = Date.now();

    activeImageDownloads++;
    
    if (logger) {
      logger("IMAGE_DOWNLOAD_START", { 
        key, 
        attempt, 
        maxAttempts: MAX_ATTEMPTS,
        active: activeImageDownloads,
        queued: imageDownloadQueue.length
      });
    }
    
    let completed = false;
    let failsafeHandle = null;
    let requestHandle = null;
    
    const finalize = (success = true) => {
      if (completed) return;
      completed = true;
      if (failsafeHandle) clearTimeout(failsafeHandle);
      if (requestHandle && requestHandle.abort) {
        try {
          requestHandle.abort();
        } catch (e) {}
      }
      
      const duration = Date.now() - startTime;
      activeImageDownloads = Math.max(0, activeImageDownloads - 1);
      if (logger && success) {
        logger("IMAGE_DOWNLOAD_SUCCESS", { 
          key, 
          attempt,
          duration,
          active: activeImageDownloads,
          queued: imageDownloadQueue.length
        });
      }
      processImageDownloadQueue();
    };

    const handleRetry = async (errorMsg, statusCode, errorDetails = null) => {
      if (completed) return;
      completed = true;
      if (failsafeHandle) clearTimeout(failsafeHandle);
      if (requestHandle && requestHandle.abort) {
        try {
          requestHandle.abort();
        } catch (e) {}
      }
      
      const duration = Date.now() - startTime;
      activeImageDownloads = Math.max(0, activeImageDownloads - 1);
      
      // Enhanced network diagnostics
      const networkInfo = getNetworkDiagnostics();
      
      // Record failure for pattern analysis
      recordImageFailure(key, errorMsg, statusCode);
      
      // Mark as failed if max attempts reached
      if (attempt >= MAX_ATTEMPTS) {
        failedImageDownloads.add(key);
        setTimeout(() => failedImageDownloads.delete(key), FAILED_IMAGE_RETRY_COOLDOWN);
      }
      
      if (attempt < MAX_ATTEMPTS) {
        if (logger) {
          logger("IMAGE_DOWNLOAD_RETRY", { 
            key, 
            attempt, 
            maxAttempts: MAX_ATTEMPTS,
            error: errorMsg,
            statusCode,
            duration,
            waitMs: 1500 * attempt,
            networkInfo,
            errorDetails
          });
        }
        await wait(1500 * attempt);
        startImageDownload(task, attempt + 1);
      } else {
        if (logger) {
          logger("IMAGE_DOWNLOAD_FAILED", { 
            key, 
            attempts: MAX_ATTEMPTS,
            error: errorMsg,
            statusCode,
            duration,
            networkInfo,
            errorDetails,
            finalFailure: true
          });
        }
        processImageDownloadQueue();
        reject(new Error(errorMsg));
      }
    };

    failsafeHandle = setTimeout(() => {
      if (!completed) {
        if (logger) {
          logger("IMAGE_DOWNLOAD_FAILSAFE", { 
            key, 
            attempt,
            reason: "no response after failsafe timeout",
            duration: Date.now() - startTime,
            timeoutMs: IMAGE_DOWNLOAD_FAILSAFE_MS,
            hasRequestHandle: !!requestHandle,
            canAbort: !!(requestHandle && requestHandle.abort)
          });
        }
        if (requestHandle && requestHandle.abort) {
          try {
            if (logger) {
              logger("IMAGE_DOWNLOAD_ABORTING", { 
                key, 
                attempt,
                reason: "failsafe triggered"
              });
            }
            requestHandle.abort();
          } catch (e) {
            if (logger) {
              logger("IMAGE_DOWNLOAD_ABORT_FAILED", { 
                key, 
                attempt,
                error: e.message
              });
            }
          }
        }
        handleRetry("Failsafe timeout", null);
      }
    }, IMAGE_DOWNLOAD_FAILSAFE_MS);

    try {
      requestHandle = gmRequest({
        method: "GET",
        url: url,
        responseType: "blob",
        timeout: 30000,
        headers: {
          "Referer": "https://weibo.com/",
          "Origin": "https://weibo.com",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        },
        onload: (response) => {
          if (response.status === 200) {
            try {
              // Validate response before creating blob
              if (!response.response || response.response.size === 0) {
                handleRetry("Empty response received", response.status, {
                  responseType: typeof response.response,
                  responseSize: response.response?.size || 0,
                  responseText: response.responseText?.substring(0, 200)
                });
                return;
              }
              
              const blobUrl = URL.createObjectURL(response.response);
              activeBlobUrls.add(blobUrl);
              const cache = getImagesCache();
              const now = Date.now();
              const record = {
                url: blobUrl,
                originalUrl: url,
                downloadedAt: now,
                lastAccessed: now,
                size: response.response.size,
                mimeType: response.response.type
              };
              cache[key] = record;
              finalize(true);
              resolve(record);
            } catch (e) {
              handleRetry("Blob creation error", response.status, {
                errorType: e.name,
                errorMessage: e.message,
                responseType: typeof response.response
              });
            }
          } else {
            handleRetry(`HTTP ${response.status}`, response.status, {
              responseText: response.responseText?.substring(0, 200),
              finalUrl: response.finalUrl,
              headers: response.responseHeaders
            });
          }
        },
        onerror: (e) => {
          handleRetry("Network error", null, {
            errorType: e?.name || 'Unknown',
            errorMessage: e?.message || 'No error details',
            readyState: e?.readyState,
            status: e?.status
          });
        },
        ontimeout: () => {
          handleRetry("Request timeout", null, {
            timeoutMs: 30000,
            actualDuration: Date.now() - startTime
          });
        }
      });
    } catch (error) {
      handleRetry("Request Init Error", null);
    }
  }

  function revokeBlobUrlsForKeys(deletedKeys) {
    for (const key of deletedKeys) {
      const record = getImagesCache()[key];
      if (record?.url?.startsWith('blob:')) {
        URL.revokeObjectURL(record.url);
        activeBlobUrls.delete(record.url);
        delete getImagesCache()[key];
      }
    }
  }

  function downloadImage(url, key, logger = null, forceRetry = false) {
    const cache = getImagesCache();
    const now = Date.now();
    
    // 1. Enhanced cache-first approach with validity check
    if (cache[key] && !forceRetry) {
      const cacheAge = now - cache[key].downloadedAt;
      if (cacheAge < IMAGE_CACHE_VALIDITY_MS) {
        // Update last accessed time for LRU eviction
        cache[key].lastAccessed = now;
        
        if (logger) {
          logger("IMAGE_CACHE_HIT", { 
            key, 
            cacheAge,
            remainingValidity: IMAGE_CACHE_VALIDITY_MS - cacheAge
          });
        }
        return Promise.resolve(cache[key]);
      } else {
        // Cache is stale, remove it and continue to download
        if (logger) {
          logger("IMAGE_CACHE_STALE", { 
            key, 
            cacheAge,
            reason: "cache expired, re-downloading"
          });
        }
        revokeBlobUrlsForKeys([key]);
      }
    }

    // 2. Check if this image is permanently failed (with cooldown)
    if (failedImageDownloads.has(key) && !forceRetry) {
      if (logger) {
        logger("IMAGE_DOWNLOAD_SKIPPED_FAILED", { 
          key,
          reason: "image previously failed, in cooldown period"
        });
      }
      return Promise.reject(new Error("Image download previously failed"));
    }

    // 3. Enhanced pending download check with better deadlock prevention
    if (pendingImageDownloads.has(key)) {
      const existingPromise = pendingImageDownloads.get(key);
      const pendingTimeout = pendingImageTimeouts.get(key);
      
      // More aggressive timeout check - if it's been pending too long, force cleanup
      if (pendingTimeout && (now - pendingTimeout) > PENDING_DOWNLOAD_TIMEOUT_MS) {
        if (logger) {
          logger("IMAGE_DOWNLOAD_DEADLOCK_DETECTED", { 
            key, 
            pendingDuration: now - pendingTimeout,
            reason: "forcing cleanup of stuck download"
          });
        }
        
        // Force cleanup of the stuck download
        pendingImageDownloads.delete(key);
        pendingImageTimeouts.delete(key);
        
        // Mark as failed to prevent immediate retry loops
        failedImageDownloads.add(key);
        setTimeout(() => failedImageDownloads.delete(key), FAILED_IMAGE_RETRY_COOLDOWN);
        
        return Promise.reject(new Error("Download was stuck, cleared from queue"));
      } else {
        // Still within reasonable time, return the existing promise
        if (logger) {
          logger("IMAGE_DOWNLOAD_PENDING", { 
            key,
            pendingDuration: pendingTimeout ? now - pendingTimeout : 0
          });
        }
        
        // Set timeout if not already set
        if (!pendingTimeout) {
          pendingImageTimeouts.set(key, now);
        }
        
        return existingPromise;
      }
    }

    // 4. Defer image processing if main process is busy
    if (imageProcessingDeferred && !forceRetry) {
      if (logger) {
        logger("IMAGE_DOWNLOAD_DEFERRED", { 
          key,
          reason: "main process busy, deferring image download"
        });
      }
      
      // Return a promise that will retry after a delay
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          downloadImage(url, key, logger, forceRetry)
            .then(resolve)
            .catch(reject);
        }, 2000 + Math.random() * 2000); // 2-4s delay with jitter
      });
    }

    // 5. Queue the download
    if (logger) {
      logger("IMAGE_DOWNLOAD_QUEUED", { 
        key, 
        url,
        queueLength: imageDownloadQueue.length + 1,
        activeDownloads: activeImageDownloads,
        deferred: imageProcessingDeferred
      });
    }
    
    const promise = new Promise((resolve, reject) => {
      imageDownloadQueue.push({ url, key, resolve, reject, logger });
      
      // Process queue asynchronously to avoid blocking
      setTimeout(() => processImageDownloadQueue(), 0);
    });

    const trackedPromise = promise.finally(() => {
      pendingImageDownloads.delete(key);
      pendingImageTimeouts.delete(key);
    });

    pendingImageDownloads.set(key, trackedPromise);
    pendingImageTimeouts.set(key, now);
    return trackedPromise;
  }

  function extractImages(mblog) {
    const images = [];
    
    // Use source mblog (original post for retweets)
    const sourceMblog = mblog.retweeted_status || mblog;
    
    if (sourceMblog.pics && Array.isArray(sourceMblog.pics)) {
      sourceMblog.pics.forEach((pic, index) => {
        // Weibo API may use 'large' or 'url' for full-size image
        const imageUrl = pic.large?.url || pic.url;
        if (imageUrl) {
          const imageData = {
            url: imageUrl,
            thumbnail: pic.thumbnail || imageUrl,
            alt: pic.alt || `Image ${index + 1}`,
            key: `${sourceMblog.bid || sourceMblog.id}_img_${index}`
          };
          images.push(imageData);
        }
      });
    }
    
    // Add video thumbnail if present
    if (sourceMblog.page_info?.page_pic?.url) {
      const videoImageData = {
        url: sourceMblog.page_info.page_pic.url,
        thumbnail: sourceMblog.page_info.page_pic.url,
        alt: "Video thumbnail",
        key: `${sourceMblog.bid || sourceMblog.id}_video_thumb`
      };
      images.push(videoImageData);
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

  function timeAgo(timestamp) {
    const seconds = Math.floor((new Date() - timestamp) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + "y ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + "mo ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + "d ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + "h ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + "m ago";
    return "Just now";
  }

  function validateUid(uid) {
    if (!uid) return false;
    
    // Basic validation: numeric and reasonable length
    return /^\d{6,11}$/.test(uid);
  }

  function updateUidHealth(uid, status, newPostsCount = 0) {
    const health = loadUidHealth();
    const now = Date.now();
    
    let record = health[uid] || {
      status: HEALTH_UNKNOWN,
      lastChecked: 0,
      lastSuccess: 0,
      frequencyLabel: 'high',
      checkInterval: 1,
      skippedChecks: 0,
      consecutiveZeroUpdates: 0
    };

    // Preserve existing values if strictly updating status
    record.status = status;
    record.lastChecked = now;
    if (status === HEALTH_VALID) {
      record.lastSuccess = now;
    }
    
    // Reset skipped checks because we just performed a check (or tried to)
    record.skippedChecks = 0;

    if (newPostsCount > 0) {
      // Activity detected! Reset to high frequency
      record.frequencyLabel = 'high';
      record.checkInterval = 1;
      record.consecutiveZeroUpdates = 0;
    } else if (status === HEALTH_VALID || status === HEALTH_STALLED) {
      // Valid check but no new posts
      record.consecutiveZeroUpdates = (record.consecutiveZeroUpdates || 0) + 1;
      
      // Downgrade frequency based on consecutive zero updates
      if (record.consecutiveZeroUpdates > 50) {
        record.frequencyLabel = 'rare';
        record.checkInterval = 20; // Check 1 in 20
      } else if (record.consecutiveZeroUpdates > 15) {
        record.frequencyLabel = 'low';
        record.checkInterval = 5; // Check 1 in 5
      } else if (record.consecutiveZeroUpdates > 3) {
        record.frequencyLabel = 'medium';
        record.checkInterval = 2; // Check 1 in 2
      } else {
        record.frequencyLabel = 'high';
        record.checkInterval = 1;
      }
    }
    
    health[uid] = record;
    saveUidHealth(health);
  }

  function updateUidSkippedChecks(uid, skippedChecks) {
    const health = loadUidHealth();
    if (health[uid]) {
      health[uid].skippedChecks = skippedChecks;
      saveUidHealth(health);
    }
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
      const requestStartTime = Date.now();
      log("REQUEST", { uid, logLabel, url, params: Object.fromEntries(Object.entries(params)) });

      let completed = false;
      let timeoutHandle = null;

      const finalize = (type, response) => {
        if (completed) return;
        completed = true;
        if (timeoutHandle) clearTimeout(timeoutHandle);
        
        const duration = Date.now() - requestStartTime;

        if (type === "TIMEOUT" || type === "FAILSAFE") {
            log("TIMEOUT_ERROR", { uid, type, duration, timeoutMs: 25000 });
            reject(new Error("Request timed out"));
            return;
        }

        if (type === "ERROR") {
            log("NETWORK_ERROR", { uid, error: String(response), duration });
            reject(new Error("Network Error"));
            return;
        }

        // Success handling
        log("RESPONSE_RECEIVED", {
          uid,
          logLabel,
          status: response.status,
          duration,
          finalUrl: response.finalUrl || "",
          responseLength: response.responseText?.length || 0
        });

        if (response.status !== 200) {
           // Weibo sometimes returns 418 or 403 if scraping too fast
           log("HTTP_ERROR", { uid, status: response.status, duration });
           reject(new Error("HTTP " + response.status)); 
           return;
        }

        try {
          const json = JSON.parse(response.responseText);
          const dataInfo = json.data ? {
            hasData: true,
            cardsCount: json.data.cards?.length || 0
          } : { hasData: false };
          
          log("JSON_PARSED", { uid, ok: json.ok, ...dataInfo });
          
          if (json.ok !== 1) {
              // Soft error from Weibo (e.g., "containerid not found")
              log("API_LOGIC_WARN", { uid, msg: json.msg || "ok!=1", ok: json.ok });
          }
          resolve(json);
        } catch (e) {
          log("JSON_PARSE_ERROR", { uid, logLabel, textLen: response.responseText?.length, error: e.message });
          reject(new Error("JSON parse error"));
        }
      };

      // 1. Hard timeout (Script side) - increased to 25s to catch ghost responses
      timeoutHandle = setTimeout(() => {
        if (!completed) {
          log("HARD_TIMEOUT_ABORT", { uid, reason: "no response after 25s", duration: Date.now() - requestStartTime });
          finalize("FAILSAFE", null);
        }
      }, 25000);

      try {
        gmRequest({
          method: "GET",
          url: url,
          // 2. GM Timeout (Network side) - increased to 20s
          timeout: 20000, 
          // 3. Crucial Headers for Weibo
          headers: {
           "X-Requested-With": "XMLHttpRequest",
           "Accept": "application/json, text/plain, */*",
           "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1",
           "Referer": "https://m.weibo.cn/",
           "Origin": "https://m.weibo.cn",
           "Sec-Fetch-Dest": "empty",
           "Sec-Fetch-Mode": "cors",
           "Sec-Fetch-Site": "same-origin"
          },
          // 4. Ensure cookies are sent
          anonymous: false, 
          onload: (resp) => finalize("LOAD", resp),
          onerror: (resp) => finalize("ERROR", resp),
          ontimeout: (resp) => finalize("TIMEOUT", resp)
        });

        log("REQUEST_INITIATED", { uid, logLabel, hasHandle: true });
      } catch (error) {
        finalize("ERROR", error.message);
      }
    });
  }

  async function fetchUserPosts(uid, log, retryCount = 0) {
    const tries = [
      "107603" + uid,
      "100505" + uid
    ];

    for (let index = 0; index < tries.length; index++) {
      const containerid = tries[index];
      const params = {
        type: "uid",
        value: uid,
        containerid: containerid,
        page: "1"
      };

      log("CONTAINER_ATTEMPT", { uid, containerid, attempt: index + 1, retryCount });

      try {
        const json = await fetchWeiboApi(params, uid, "posts", log);
        if (json && json.ok === 1 && json.data?.cards?.length > 0) {
          log("CONTAINER_SUCCESS", { uid, containerid, cards: json.data.cards.length });
          return json; // success, stop trying
        }
        
        // NEW LOGIC: Check for empty timeline vs real error
        if (json && json.ok === 0 && json.msg === "这里还没有内容") {
          // Empty timeline: Account exists but has no posts yet
          log("UID_EMPTY_TIMELINE", { uid, containerid, reason: "Empty timeline (no posts yet)" });
          // Return empty but valid response instead of throwing error
          return { ok: 0, data: { cards: [] }, msg: json.msg };
        }
        
        log("CONTAINER_EMPTY", { uid, containerid });
      } catch (e) {
        log("CONTAINER_ERROR", { uid, containerid, error: e && e.message ? e.message : String(e) });
      }
      await sleep(800);
    }
    log("CONTAINER_ALL_FAILED", { uid, attempts: tries.length, retryCount });
    throw new Error("Both containerids failed");
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
    let currentUsers = loadUsers();
    
    // Prompt to add UIDs if empty
    if (!currentUsers || currentUsers.length === 0) {
      const input = prompt(
        "No UIDs configured yet.\n\n" +
        "Enter Weibo UIDs (one per line):\n\n" +
        "Example:\n" +
        "1052404565\n" +
        "1080201461\n" +
        "1147851595"
      );
      
      if (input && input.trim()) {
        currentUsers = input
          .split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0 && /^\d{6,11}$/.test(line));
        
        if (currentUsers.length > 0) {
          saveUsers(currentUsers);
          alert(`Added ${currentUsers.length} UIDs. Dashboard is now ready.`);
        } else {
          alert("No valid UIDs found. Please enter 6-11 digit numbers.");
          tab.close();
          return;
        }
      } else {
        alert("No UIDs entered. Please try again and enter at least one UID.");
        tab.close();
        return;
      }
    }
    
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
      background:var(--color-secondary-current);
      border-radius:10px;
      padding:8px;
      margin-bottom:var(--spacing-md);
      max-height:200px;
      overflow-y:auto;
      overflow-x:hidden;
      border:1px solid var(--color-border-current);
      font-weight:400;
      letter-spacing: 0.01em;
      color:var(--color-primary-current);
    }
    #log .line{
      padding:4px 6px;
      margin:1px 0;
      border-left:3px solid transparent;
      border-radius:2px;
      color:var(--color-muted-current);
      display:flex;
      align-items:flex-start;
      gap:6px;
      word-break:break-word;
      white-space:normal;
    }
    #log .line.success{
      border-left-color:#10b981;
      background:rgba(16,185,129,0.08);
      color:#059669;
    }
    #log .line.error{
      border-left-color:#ef4444;
      background:rgba(239,68,68,0.08);
      color:#dc2626;
    }
    #log .line.warning{
      border-left-color:#f59e0b;
      background:rgba(245,158,11,0.08);
      color:#d97706;
    }
    #log .line.info{
      border-left-color:#3b82f6;
      background:rgba(59,130,246,0.08);
      color:#1d4ed8;
    }
    #log .line.debug{
      border-left-color:#8b5cf6;
      background:rgba(139,92,246,0.08);
      color:#6d28d9;
    }
    #log .line-icon{
      flex-shrink:0;
      width:14px;
      height:14px;
      display:flex;
      align-items:center;
      justify-content:center;
      font-weight:bold;
      font-size:10px;
    }
    #log .line-content{
      flex:1;
      min-width:0;
    }
    #log .line-time{
      color:var(--color-muted-current);
      font-size:10px;
      opacity:0.6;
    }
    #log .line-label{
      font-weight:600;
      margin-right:4px;
    }
    #log .line-data{
      opacity:0.8;
      font-size:11px;
    }
    /* --- JAVASCRIPT MASONRY CSS --- */
    #list {
      position: relative; /* Container matches height of content */
      width: 100%;
      margin-top: 0;
    }
    
    .item {
      position: absolute; /* We will position this with JS */
      left: 0;
      top: 0;
      
      background: var(--color-secondary-current);
      border-radius: var(--border-radius-xl);
      padding: var(--spacing-md);
      border: 1px solid var(--color-border-current);
      box-shadow: 0 2px 8px var(--color-shadow-current);
      
      /* Smoothly animate layout changes */
      transition: top 0.3s ease, left 0.3s ease, transform 0.2s, box-shadow 0.2s; 
      
      /* Ensure padding doesn't mess up width calcs */
      box-sizing: border-box; 
    }

    /* Remove the old media queries for columns, JS handles it now */
    .images{
      display:grid;
      grid-template-columns:repeat(2,1fr);
      gap:2px;
      margin:var(--spacing-sm) 0;
      border-radius:var(--border-radius);
      overflow:hidden;
    }
    .images.count-1{
      grid-template-columns:1fr;
    }
    .images.count-3 .image-container:first-child{
      grid-column:span 2;
    }
    .images.count-5, .images.count-6, .images.count-7, .images.count-8, .images.count-9{
      grid-template-columns:repeat(3,1fr);
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
    /* Lightbox Styles */
    #lightbox{
      position:fixed;
      top:0;
      left:0;
      width:100%;
      height:100%;
      background:rgba(0,0,0,0.9);
      z-index:10000;
      display:flex;
      align-items:center;
      justify-content:center;
      opacity:0;
      pointer-events:none;
      transition:opacity 0.2s;
    }
    #lightbox.active{
      opacity:1;
      pointer-events:auto;
    }
    #lightbox img{
      max-width:95%;
      max-height:95%;
      box-shadow:0 0 20px rgba(0,0,0,0.5);
      border-radius:4px;
    }
    #lightbox .close{
      position:absolute;
      top:20px;
      right:30px;
      color:#fff;
      font-size:40px;
      cursor:pointer;
      user-select:none;
    }
    .item:hover{
      border-color:var(--color-agent-primary);
      transform:translateY(-4px);
      z-index:10;
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
      opacity:0;
      transform:translateY(10px);
      transition:all 0.2s ease;
      margin-top:-30px;
    }
    .item:hover .actions{
      opacity:1;
      transform:translateY(0);
      margin-top:0;
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
      <div class="subtitle" id="subtitle">
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
        <button onclick="window.runNetworkDiagnostics()">Network Diagnostics</button>
      </div>
      <div id="status"></div>
      <div style="display: flex; gap: var(--spacing-sm); margin-bottom: var(--spacing-sm); font-size: var(--font-size-xs);">
        <label style="display: flex; align-items: center; gap: 4px; color: var(--color-muted-current);">
          <input type="checkbox" id="log-filter-errors" checked onchange="window.updateLogFilter()" style="cursor: pointer;">
          Errors
        </label>
        <label style="display: flex; align-items: center; gap: 4px; color: var(--color-muted-current);">
          <input type="checkbox" id="log-filter-warnings" checked onchange="window.updateLogFilter()" style="cursor: pointer;">
          Warnings
        </label>
        <label style="display: flex; align-items: center; gap: 4px; color: var(--color-muted-current);">
          <input type="checkbox" id="log-filter-info" checked onchange="window.updateLogFilter()" style="cursor: pointer;">
          Info
        </label>
        <label style="display: flex; align-items: center; gap: 4px; color: var(--color-muted-current);">
          <input type="checkbox" id="log-filter-debug" onchange="window.updateLogFilter()" style="cursor: pointer;">
          Debug
        </label>
        <button onclick="window.clearLogs()" style="margin-left: auto; padding: 2px 8px; font-size: var(--font-size-xs); background: var(--color-secondary-current); border: 1px solid var(--color-border-current); border-radius: var(--border-radius-sm); cursor: pointer;">Clear</button>
      </div>
      <div id="log"></div>
    </div>
  </div>
  
  <div class="wrap">
    <div id="list"></div>
    <div id="footer" style="text-align: center; padding: 40px; display: none;">
        <button id="load-more-btn" onclick="window.loadMore()" style="
            padding: 12px 30px; 
            background: var(--color-agent-primary); 
            color: white; 
            border: none; 
            border-radius: 30px; 
            font-size: 16px; 
            cursor: pointer;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        ">Load More Posts</button>
    </div>
  </div>
</body>
</html>`);
    doc.close();

    // Append Lightbox Container to body
    const lightbox = doc.createElement('div');
    lightbox.id = 'lightbox';
    lightbox.innerHTML = '<span class="close">&times;</span><img src="" id="lightbox-img">';
    doc.body.appendChild(lightbox);

    const lightboxImg = lightbox.querySelector('img');
    const closeBtn = lightbox.querySelector('.close');

    // Close handlers
    lightbox.onclick = (e) => { if(e.target !== lightboxImg) lightbox.classList.remove('active'); };
    closeBtn.onclick = () => lightbox.classList.remove('active');
    doc.addEventListener('keydown', (e) => { if(e.key === "Escape") lightbox.classList.remove('active'); });

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
      const time = now.toLocaleTimeString(undefined, {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }); // HH:MM:SS in local timezone

      // Determine log type and icon based on label
      const logTypeMap = {
        'SUCCESS': { type: 'success', icon: '✓' },
        'ERROR': { type: 'error', icon: '✕' },
        'FAILED': { type: 'error', icon: '✕' },
        'PROCESS_FATAL': { type: 'error', icon: '✕' },
        'NETWORK_ERROR': { type: 'error', icon: '✕' },
        'JSON_PARSE_ERROR': { type: 'error', icon: '✕' },
        'HTTP_ERROR': { type: 'error', icon: '✕' },
        'TIMEOUT_ERROR': { type: 'error', icon: '⧖' },
        'API_LOGIC_WARN': { type: 'warning', icon: '⚠' },
        'WARNING': { type: 'warning', icon: '⚠' },
        'UID_INVALID': { type: 'warning', icon: '⚠' },
        'UID_ERROR': { type: 'warning', icon: '⚠' },
        'PROCESS_FAILED': { type: 'warning', icon: '⚠' },
        'PROCESS_HARD_TIMEOUT': { type: 'error', icon: '⧖' },
        'REQUEST': { type: 'info', icon: 'i' },
        'REQUEST_INITIATED': { type: 'debug', icon: '→' },
        'RESPONSE_RECEIVED': { type: 'success', icon: '✓' },
        'JSON_PARSED': { type: 'debug', icon: '⦿' },
        'PROCESS_START': { type: 'info', icon: '→' },
        'PROCESS_DONE': { type: 'success', icon: '✓' },
        'MANUAL_REFRESH_START': { type: 'info', icon: '⟳' },
        'MANUAL_REFRESH_RESUME': { type: 'info', icon: '↪' },
        'MANUAL_REFRESH_COMPLETE': { type: 'success', icon: '✓' },
        'PRUNED_POSTS': { type: 'info', icon: '≈' },
        'UID_VALID': { type: 'success', icon: '✓' },
        'API_NOT_OK': { type: 'warning', icon: '⚠' },
        'IMAGE_DOWNLOADS_PAUSED': { type: 'info', icon: '⏸' },
        'IMAGE_DOWNLOADS_RESUMED': { type: 'info', icon: '⏵' },
        'IMAGE_DOWNLOAD_QUEUED': { type: 'debug', icon: '⊕' },
        'IMAGE_DOWNLOAD_PENDING': { type: 'debug', icon: '⧗' },
        'IMAGE_DOWNLOAD_START': { type: 'debug', icon: '⬇' },
        'IMAGE_DOWNLOAD_SUCCESS': { type: 'debug', icon: '✓' },
        'IMAGE_DOWNLOAD_RETRY': { type: 'warning', icon: '↻' },
        'IMAGE_DOWNLOAD_FAILED': { type: 'error', icon: '✕' },
        'IMAGE_DOWNLOAD_FAILSAFE': { type: 'warning', icon: '⧖' },
        'IMAGE_DOWNLOAD_ABORTING': { type: 'warning', icon: '⧖' },
        'IMAGE_DOWNLOAD_ABORT_FAILED': { type: 'error', icon: '✕' },
        'IMAGE_DOWNLOAD_PENDING_TIMEOUT': { type: 'warning', icon: '⧖' },
        'IMAGE_CACHE_HIT': { type: 'debug', icon: '⚡' },
        'IMAGE_CACHE_APPLIED': { type: 'debug', icon: '⚡' },
        'IMAGE_PLACEHOLDER_SET': { type: 'debug', icon: '◻' },
        'IMAGE_RENDER_APPLIED': { type: 'debug', icon: '✓' },
        'IMAGE_RENDER_FAILED': { type: 'error', icon: '✕' },
        'IMAGE_RENDER_TIMEOUT': { type: 'warning', icon: '⧖' },
        'IMAGE_DOWNLOAD_EMPTY': { type: 'warning', icon: '∅' },
        'IMAGE_DOWNLOAD_DEADLOCK_DETECTED': { type: 'error', icon: '⚠' },
        'IMAGE_DOWNLOAD_DEFERRED': { type: 'info', icon: '⏸' },
        'IMAGE_DOWNLOAD_SKIPPED_FAILED': { type: 'warning', icon: '⚠' },
        'IMAGE_CACHE_STALE': { type: 'info', icon: '🔄' },
        'IMAGE_CACHE_EVICTED': { type: 'info', icon: '🧹' },
        'IMAGE_PROCESSING_DEFERRED': { type: 'info', icon: '⏸' },
        'IMAGE_PROCESSING_RESUMED': { type: 'success', icon: '▶' },
        'TIMELINE_RENDERED': { type: 'success', icon: '✓' },
        'CLEANUP_STALE_DOWNLOADS': { type: 'info', icon: '🧹' },
        'IMAGE_FAILURE_PATTERN_DETECTED': { type: 'warning', icon: '📊' },
        'NETWORK_DIAGNOSTICS_COMPLETE': { type: 'success', icon: '🌐' },
        'NETWORK_DIAGNOSTICS_ERROR': { type: 'error', icon: '🌐' },
        'CONTAINER_ATTEMPT': { type: 'debug', icon: '→' },
        'CONTAINER_SUCCESS': { type: 'success', icon: '✓' },
        'CONTAINER_EMPTY': { type: 'warning', icon: '∅' },
        'CONTAINER_ERROR': { type: 'error', icon: '✕' },
        'CONTAINER_ALL_FAILED': { type: 'error', icon: '✕' },
        'RETRY_ON_HANG': { type: 'warning', icon: '↻' },
        'UID_EMPTY_TIMELINE': { type: 'info', icon: '∅' },
        'Dashboard opened': { type: 'success', icon: '✓' }
      };

      // Check if label contains any known log type
      let logType = 'debug';
      let icon = '•';
      for (const [key, config] of Object.entries(logTypeMap)) {
        if (label.includes(key)) {
          logType = config.type;
          icon = config.icon;
          break;
        }
      }

      let payload = "";
      let dataStr = "";
      if (data !== undefined) {
        try {
          dataStr = JSON.stringify(data);
          payload = " " + dataStr;
        } catch {
          dataStr = String(data);
          payload = " " + dataStr;
        }
      }

      const full = "[" + time + "] " + label + payload;

      if (logEl) {
        const line = doc.createElement("div");
        line.className = "line " + logType;
        
        // Create icon element
        const iconEl = doc.createElement("span");
        iconEl.className = "line-icon";
        iconEl.textContent = icon;
        
        // Create content element
        const contentEl = doc.createElement("div");
        contentEl.className = "line-content";
        
        // Time
        const timeEl = doc.createElement("span");
        timeEl.className = "line-time";
        timeEl.textContent = time;
        
        // Label
        const labelEl = doc.createElement("span");
        labelEl.className = "line-label";
        labelEl.textContent = label;
        
        // Data (if present)
        let dataEl = null;
        if (dataStr) {
          dataEl = doc.createElement("span");
          dataEl.className = "line-data";
          dataEl.textContent = dataStr;
        }
        
        contentEl.appendChild(timeEl);
        contentEl.appendChild(doc.createTextNode(" "));
        contentEl.appendChild(labelEl);
        if (dataEl) {
          contentEl.appendChild(dataEl);
        }
        
        line.appendChild(iconEl);
        line.appendChild(contentEl);
        logEl.appendChild(line);
        logEl.scrollTop = logEl.scrollHeight;
        
        // Keep only last 100 logs to avoid performance issues
        const allLines = logEl.querySelectorAll('.line');
        if (allLines.length > 100) {
          for (let i = 0; i < allLines.length - 100; i++) {
            allLines[i].remove();
          }
        }
      }

      // Log to both the original console and the dashboard tab console
      try {
        console.log("[WeiboTimeline]", full);
      } catch (err) {
        // ignore logging errors
      }

      if (tab && tab.console && typeof tab.console.log === 'function') {
        try {
          tab.console.log("[WeiboTimeline]", full);
        } catch (err) {
          // ignore logging errors for tab console
        }
      }
    }

    // Log filtering functions
    tab.window.updateLogFilter = function() {
      if (!logEl) return;
      const showErrors = doc.getElementById('log-filter-errors')?.checked ?? true;
      const showWarnings = doc.getElementById('log-filter-warnings')?.checked ?? true;
      const showInfo = doc.getElementById('log-filter-info')?.checked ?? true;
      const showDebug = doc.getElementById('log-filter-debug')?.checked ?? false;
      
      const lines = logEl.querySelectorAll('.line');
      lines.forEach(line => {
        let shouldShow = true;
        if (line.classList.contains('error') && !showErrors) shouldShow = false;
        if (line.classList.contains('warning') && !showWarnings) shouldShow = false;
        if (line.classList.contains('info') && !showInfo) shouldShow = false;
        if (line.classList.contains('debug') && !showDebug) shouldShow = false;
        line.style.display = shouldShow ? '' : 'none';
      });
    };

    tab.window.clearLogs = function() {
      if (logEl) {
        logEl.innerHTML = '';
        pageLog("LOGS_CLEARED", { timestamp: new Date().toISOString() });
      }
    };

    function setStatus(message) {
      if (statusEl) statusEl.textContent = message;
    }

    function updateSubtitle() {
      const subtitleEl = doc.getElementById('subtitle');
      if (!subtitleEl) return;
      
      let refreshText = "Manual refresh: Click 'Refresh All' to fetch new posts.";
      if (lastRefreshTime) {
        const minutesAgo = Math.floor((new Date() - lastRefreshTime) / 60000);
        if (minutesAgo < 1) {
          refreshText = "Last refreshed: just now.";
        } else if (minutesAgo < 60) {
          refreshText = `Last refreshed: ${minutesAgo} minutes ago.`;
        } else {
          const hoursAgo = Math.floor(minutesAgo / 60);
          refreshText = `Last refreshed: ${hoursAgo} hours ago.`;
        }
      }
      
      subtitleEl.innerHTML = `
        Following ${accountsSummary}. This archive lives only in your browser.<br>
        ${refreshText}
      `;
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
      
      const freqHigh = Object.values(health).filter(h => h.frequencyLabel === 'high' || !h.frequencyLabel).length;
      const freqMed = Object.values(health).filter(h => h.frequencyLabel === 'medium').length;
      const freqLow = Object.values(health).filter(h => h.frequencyLabel === 'low').length;
      const freqRare = Object.values(health).filter(h => h.frequencyLabel === 'rare').length;
      
      uidStatusEl.innerHTML = `
        <span class="uid-status-item valid">Valid: ${valid}</span>
        <span class="uid-status-item invalid">Invalid: ${invalid}</span>
        <span class="uid-status-item stalled">Stalled: ${stalled}</span>
        <span class="uid-status-item unknown">Unknown: ${unknown}</span>
        <span style="margin-left: 10px; opacity: 0.7;">|</span>
        <span class="uid-status-item" style="background:#e0f2fe; color:#0369a1" title="Check every time">High: ${freqHigh}</span>
        <span class="uid-status-item" style="background:#f0f9ff; color:#0c4a6e" title="Check 1/2 times">Mid: ${freqMed}</span>
        <span class="uid-status-item" style="background:#f8fafc; color:#334155" title="Check 1/5 times">Low: ${freqLow}</span>
        <span class="uid-status-item" style="background:#f1f5f9; color:#475569" title="Check 1/20 times">Rare: ${freqRare}</span>
      `;
    }

    updateUidStatus();
    updateSubtitle();
    pageLog("Dashboard opened", {
      accounts: currentUsers.length,
      storedEntries: Object.keys(timeline).length
    });

    // ---------------------------------------------------------------
    // MASONRY LAYOUT ENGINE
    // ---------------------------------------------------------------
    let layoutDebounceTimer = null;

    function triggerLayout() {
      if (layoutDebounceTimer) clearTimeout(layoutDebounceTimer);
      layoutDebounceTimer = setTimeout(runMasonryLayout, 100);
    }

    function runMasonryLayout() {
      if (!listEl) return;
      const items = Array.from(listEl.children);
      if (items.length === 0) return;

      // 1. Calculate Columns
      const containerWidth = listEl.clientWidth;
      const gap = 16; // Matches var(--spacing-md)
      const minColWidth = 280; // Minimum card width
      
      let colCount = Math.floor((containerWidth + gap) / (minColWidth + gap));
      if (colCount < 1) colCount = 1;
      
      // Calculate exact column width
      // (TotalWidth - TotalGaps) / Count
      const colWidth = (containerWidth - ((colCount - 1) * gap)) / colCount;

      // 2. Initialize Column Heights
      const colHeights = new Array(colCount).fill(0);

      // 3. Place Items
      items.forEach(item => {
        // Find the shortest column
        let minHeight = colHeights[0];
        let minColIndex = 0;
        
        for (let i = 1; i < colCount; i++) {
          if (colHeights[i] < minHeight) {
            minHeight = colHeights[i];
            minColIndex = i;
          }
        }

        // Apply Position
        item.style.width = colWidth + "px";
        item.style.left = (minColIndex * (colWidth + gap)) + "px";
        item.style.top = minHeight + "px";

        // Update column height
        // Add item height + gap
        colHeights[minColIndex] += item.offsetHeight + gap;
      });

      // 4. Set Container Height
      listEl.style.height = Math.max(...colHeights) + "px";
    }

    // Attach resize listener to the popup window
    tab.window.addEventListener('resize', triggerLayout);

    // ---------------------------------------------------------------
    // LAZY IMAGE LOADING WITH INTERSECTION OBSERVER
    // v4.4.1: Enhanced error isolation and scope handling
    // ---------------------------------------------------------------
    
    let imageObserver = null;
    
    // Store references to functions that will be called from observer
    // This ensures proper scope binding even in async callbacks
    const observerContext = {
      getImagesCache: getImagesCache,
      downloadImage: downloadImage,
      pageLog: pageLog,
      triggerLayout: triggerLayout,
      IMAGE_PLACEHOLDER_DATA_URL: IMAGE_PLACEHOLDER_DATA_URL,
      IMAGE_ERROR_DATA_URL: IMAGE_ERROR_DATA_URL
    };
    
    function setupImageObserver() {
      if (imageObserver) return imageObserver;
      
      // Create observer with proper error isolation
      imageObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          // Wrap in try-catch for improved error isolation
          try {
            if (!entry.isIntersecting) return;
            
            const img = entry.target;
            const imageUrl = img.dataset.imageUrl;
            const imageKey = img.dataset.imageKey;
            
            if (!imageUrl || !imageKey) return;
            
            // Stop observing this image immediately
            imageObserver.unobserve(img);
            
            // Check cache first using stored reference
            const downloadedImages = observerContext.getImagesCache();
            if (downloadedImages[imageKey]) {
              // Update lastAccessed for LRU tracking
              downloadedImages[imageKey].lastAccessed = Date.now();
              img.src = downloadedImages[imageKey].url;
              observerContext.pageLog("IMAGE_CACHE_APPLIED", { key: imageKey, fromObserver: true });
              return;
            }
            
            // Set up download timeout with proper reference
            const downloadTimeout = setTimeout(() => {
              if (img.src === observerContext.IMAGE_PLACEHOLDER_DATA_URL) {
                img.src = observerContext.IMAGE_ERROR_DATA_URL;
                observerContext.pageLog("IMAGE_RENDER_TIMEOUT", { key: imageKey });
              }
            }, 45000);
            
            // Download the image using stored reference
            observerContext.downloadImage(imageUrl, imageKey, observerContext.pageLog)
              .then(record => {
                clearTimeout(downloadTimeout);
                if (record && record.url) {
                  img.src = record.url;
                  observerContext.pageLog("IMAGE_RENDER_APPLIED", { key: imageKey });
                  observerContext.triggerLayout();
                } else {
                  img.src = observerContext.IMAGE_ERROR_DATA_URL;
                  observerContext.pageLog("IMAGE_RENDER_FAILED", { key: imageKey, reason: "no_url" });
                }
              })
              .catch(err => {
                clearTimeout(downloadTimeout);
                img.src = observerContext.IMAGE_ERROR_DATA_URL;
                observerContext.pageLog("IMAGE_RENDER_FAILED", { key: imageKey, error: err.message });
              });
          } catch (observerError) {
            // Isolate errors to prevent one image failure from affecting others
            console.error("[WeiboTimeline] Observer error:", observerError);
          }
        });
      }, {
        rootMargin: '200px', // Start loading 200px before image enters viewport
        threshold: 0.01
      });
      
      return imageObserver;
    }

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

      // Sort by actual post creation time (FIXED), with "Bump" for late discoveries
      entries.sort((a, b) => {
        const timeA = a.created_ts || parseWeiboTime(a.createdAt);
        const timeB = b.created_ts || parseWeiboTime(b.createdAt);
        
        // "Bump" strategy: If a post was imported > 24h after creation, treat its time as import time
        // This ensures missed posts appearing after a long skip period pop up at the top
        const effectiveTimeA = (a.importedAt && (a.importedAt - timeA > 86400000)) ? a.importedAt : timeA;
        const effectiveTimeB = (b.importedAt && (b.importedAt - timeB > 86400000)) ? b.importedAt : timeB;
        
        return effectiveTimeB - effectiveTimeA;
      });
      
      // Show/hide footer based on whether there are more items to load
      const footer = doc.getElementById('footer');
      const loadMoreBtn = doc.getElementById('load-more-btn');
      if (footer && loadMoreBtn) {
        if (entries.length > currentRenderCount) {
          const hiddenCount = entries.length - currentRenderCount;
          loadMoreBtn.textContent = `Show ${Math.min(PAGE_SIZE, hiddenCount)} more (${hiddenCount} hidden)`;
          footer.style.display = 'block';
        } else {
          footer.style.display = 'none';
        }
      }

      const limited = entries.slice(0, currentRenderCount);
      const downloadedImages = getImagesCache();
      const observer = setupImageObserver();

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
          timeSpan.textContent = timeAgo(entry.created_ts);
          timeSpan.title = entry.createdAt; // Show full date on hover
          meta.appendChild(timeSpan);

          // Badge for Late Discovery (Missed posts)
          // If imported > 24h after creation, it means we missed it.
          if (entry.importedAt && (entry.importedAt - entry.created_ts > 86400000)) {
             const newBadge = doc.createElement("span");
             // Use subtle blue style
             newBadge.style.cssText = "background:rgba(59,130,246,0.1); color:#2563eb; padding:2px 6px; border-radius:4px; font-size:10px; font-weight:600; margin-left:6px; border:1px solid rgba(59,130,246,0.2);";
             newBadge.textContent = "NEWLY FOUND";
             newBadge.title = `Post date: ${entry.createdAt}\nDiscovered: ${new Date(entry.importedAt).toLocaleString()}`;
             meta.appendChild(newBadge);
          }
        }

        const textDiv = doc.createElement("div");
        textDiv.className = "text";
        textDiv.textContent = truncate(entry.text, 200);

        // Add images if they exist
        if (entry.images && entry.images.length > 0) {
          const imagesDiv = doc.createElement("div");
          imagesDiv.className = "images count-" + entry.images.length;

          entry.images.forEach((image) => {
            const imgContainer = doc.createElement("div");
            imgContainer.className = "image-container";

            const img = doc.createElement("img");
            img.className = "post-image";
            img.alt = image.alt;
            img.loading = "lazy";
            
            // IMPORTANT: Trigger layout when image dimensions are known
            img.onload = () => triggerLayout();

            // Store image data in dataset for lazy loading
            img.dataset.imageUrl = image.url;
            img.dataset.imageKey = image.key;
            img.dataset.entryKey = entry.key;

            // Try to use downloaded image first (cache hit)
            if (downloadedImages[image.key]) {
              // Update lastAccessed for LRU tracking
              downloadedImages[image.key].lastAccessed = Date.now();
              img.src = downloadedImages[image.key].url;
            } else {
              // Use placeholder and let IntersectionObserver handle download
              img.src = IMAGE_PLACEHOLDER_DATA_URL;
              observer.observe(img);
            }

            img.onclick = () => {
              try {
                // Only open lightbox if we have a valid image (not placeholder/error)
                if (img.src && !img.src.includes('data:image/svg+xml')) {
                  lightboxImg.src = img.src;
                  lightbox.classList.add('active');
                }
              } catch (e) {
                console.error("[WeiboTimeline] Lightbox error:", e);
              }
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
      
      // Run initial layout after DOM insertion
      triggerLayout();
    }

    // ---------------------------------------------------------------
    // UID MANAGEMENT FUNCTIONS
    // ---------------------------------------------------------------

    // Make functions globally accessible to onclick handlers
    tab.window.validateAllUids = async function validateAllUids() {
      setStatus("Validating all UIDs...");
      
      for (let index = 0; index < currentUsers.length; index++) {
        const uid = currentUsers[index];
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
        
        if (index < currentUsers.length - 1) {
          await sleep(BETWEEN_ACCOUNTS_MS);
        }
      }
      
      setStatus("Validation complete");
      updateUidStatus();
    }

    // Failsafe timeout wrapper for UID processing
    async function processOneUidWithTimeout(uid, timeoutMs = 40000) {
      return new Promise((resolve, reject) => {
        let completed = false;
        let timeoutHandle = null;

        // Create hard timeout
        timeoutHandle = setTimeout(() => {
          if (!completed) {
            completed = true;
            const error = new Error(`Hard timeout after ${timeoutMs}ms`);
            error.isHardTimeout = true;
            reject(error);
          }
        }, timeoutMs);

        // Run the actual processing
        processOneUid(uid)
          .then((result) => {
            if (!completed) {
              completed = true;
              clearTimeout(timeoutHandle);
              resolve(result);
            }
          })
          .catch((err) => {
            if (!completed) {
              completed = true;
              clearTimeout(timeoutHandle);
              reject(err);
            }
          });
      });
    }

    tab.window.refreshAll = function refreshAll() {
      if (manualRefreshInProgress) {
        setStatus("Manual refresh already running...");
        pageLog("MANUAL_REFRESH_SKIPPED", { reason: "already_running" });
        return;
      }

      manualRefreshInProgress = true;
      deferRenderingDuringRefresh = true;
      
      // Defer image processing during main API calls to prevent blocking
      deferImageProcessing(true);
      pauseImageDownloads();
      pageLog("IMAGE_DOWNLOADS_PAUSED", { reason: "manual_refresh_deferred" });
      pageLog("IMAGE_PROCESSING_DEFERRED", { reason: "main_process_priority" });

      setStatus("Starting manual refresh...");
      
      // Check if we should resume from a previously interrupted refresh
      const lastUid = loadLastUid();
      let startIndex = 0;
      
      if (lastUid) {
        const lastIndex = currentUsers.indexOf(lastUid);
        if (lastIndex !== -1 && lastIndex < currentUsers.length - 1) {
          startIndex = lastIndex + 1;
          pageLog("MANUAL_REFRESH_RESUME", { 
            lastUid, 
            resumeFromIndex: startIndex, 
            totalAccounts: currentUsers.length 
          });
          setStatus(`Resuming from UID ${lastUid} (${startIndex + 1}/${currentUsers.length})...`);
        } else {
          pageLog("MANUAL_REFRESH_START", { accounts: currentUsers.length });
        }
      } else {
        pageLog("MANUAL_REFRESH_START", { accounts: currentUsers.length });
      }
      
      // Disable refresh button during process
      const refreshBtn = doc.getElementById('refresh-all-btn');
      if (refreshBtn) {
        refreshBtn.disabled = true;
        refreshBtn.textContent = '🔄 Refreshing...';
      }
      
      (async function runManualRefresh() {
        let successCount = 0;
        let failureCount = 0;
        let timeoutCount = 0;

        try {
          for (let i = startIndex; i < currentUsers.length; i++) {
            const uid = currentUsers[i];
            
            // Frequency-based skipping logic
            const health = getUidHealth(uid);
            const checkInterval = health.checkInterval || 1;
            let skippedChecks = health.skippedChecks || 0;
            
            if (skippedChecks < checkInterval - 1) {
              skippedChecks++;
              updateUidSkippedChecks(uid, skippedChecks);
              pageLog("SKIP_UID", { 
                uid, 
                reason: "low_frequency", 
                label: health.frequencyLabel, 
                skipped: skippedChecks, 
                interval: checkInterval 
              });
              
              // Minimal delay when skipping to keep UI responsive
              if (i < currentUsers.length - 1) {
                 await sleep(50); 
              }
              continue; 
            }

            const progress = Math.round(((i + 1) / currentUsers.length) * 100);
            setStatus(`Fetching account ${i + 1}/${currentUsers.length} (${progress}%)…`);

            try {
              await processOneUidWithTimeout(uid, 40000); // 40s hard timeout per UID
              successCount++;
            } catch (err) {
              if (err && err.isHardTimeout) {
                timeoutCount++;
                pageLog("PROCESS_HARD_TIMEOUT", {
                  uid,
                  message: "UID processing exceeded 40s timeout, continuing to next UID",
                  error: err.message
                });
                updateUidHealth(uid, HEALTH_STALLED);
              } else {
                failureCount++;
                pageLog("PROCESS_FATAL", {
                  uid,
                  error: err && err.message ? err.message : String(err)
                });
              }
            }

            if (i < currentUsers.length - 1) {
              // Add random jitter (0-2s) to avoid pattern detection
              const jitter = Math.random() * 2000;
              const totalWait = BETWEEN_ACCOUNTS_MS + jitter;
              pageLog("SleepBetweenAccounts", { uid, ms: Math.round(totalWait), jitter: Math.round(jitter) });
              try {
                await sleep(Math.round(totalWait));
                pageLog("AfterSleepBetweenAccounts", { uid });
              } catch (e) {
                pageLog("SleepError", {
                  uid,
                  error: e && e.message ? e.message : String(e)
                });
              }
            }
          }
          
          lastRefreshTime = new Date();
          
          // Clear last UID marker since we completed the full refresh
          saveLastUid(null);
          
          setStatus("Manual refresh complete");
          updateSubtitle();
          pageLog("MANUAL_REFRESH_COMPLETE", {
            total: currentUsers.length,
            success: successCount,
            failed: failureCount,
            timedOut: timeoutCount
          });
        } finally {
          manualRefreshInProgress = false;
          deferRenderingDuringRefresh = false;
          
          // Render once after all updates
          renderTimeline();
          updateUidStatus();
          pageLog("TIMELINE_RENDERED", { reason: "batch_refresh_complete" });
          
          // Lift image processing deferral first, then resume downloads
          deferImageProcessing(false);
          pageLog("IMAGE_PROCESSING_RESUMED", { reason: "main_process_complete" });
          
          resumeImageDownloads();
          pageLog("IMAGE_DOWNLOADS_RESUMED", { reason: "manual_refresh_complete" });

          // Re-enable refresh button
          if (refreshBtn) {
            refreshBtn.disabled = false;
            refreshBtn.textContent = '🔄 Refresh All';
          }
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
      const oldLength = currentUsers.length;
      const validUids = currentUsers.filter(uid => {
        const h = health[uid];
        return h && h.status === HEALTH_VALID;
      });
      
      currentUsers = validUids;
      saveUsers(currentUsers);
      
      pageLog("INVALID_UIDS_REMOVED", { 
        oldCount: oldLength, 
        newCount: validUids.length,
        removedCount: oldLength - validUids.length
      });
      
      updateUidStatus();
      alert(`Successfully removed ${oldLength - validUids.length} invalid UIDs. Now following ${validUids.length} accounts.`);
    }

    tab.window.runNetworkDiagnostics = async function runNetworkDiagnostics() {
      setStatus("Running network diagnostics...");
      
      try {
        const networkInfo = getNetworkDiagnostics();
        const connectivityResults = await testWeiboConnectivity();
        
        pageLog("NETWORK_DIAGNOSTICS_COMPLETE", {
          networkInfo,
          connectivityResults,
          imageStats: {
            totalAttempts: imageFailureStats.totalAttempts,
            totalFailures: imageFailureStats.totalFailures,
            failureRate: imageFailureStats.totalAttempts > 0 ? 
              ((imageFailureStats.totalFailures / imageFailureStats.totalAttempts) * 100).toFixed(2) + '%' : '0%',
            recentFailures: imageFailureStats.recentFailures.length
          }
        });
        
        setStatus("Network diagnostics complete");
        
        // Show summary to user
        const summary = `Network Diagnostics Summary:\n\n` +
          `Online: ${networkInfo.online ? 'Yes' : 'No'}\n` +
          `Connection: ${networkInfo.connection ? networkInfo.connection.effectiveType : 'Unknown'}\n` +
          `Weibo.com: ${connectivityResults.find(r => r.url.includes('weibo.com'))?.success ? 'Reachable' : 'Not reachable'}\n` +
          `Sinaimg.cn: ${connectivityResults.find(r => r.url.includes('sinaimg.cn'))?.success ? 'Reachable' : 'Not reachable'}\n` +
          `Image Failure Rate: ${imageFailureStats.totalAttempts > 0 ? ((imageFailureStats.totalFailures / imageFailureStats.totalAttempts) * 100).toFixed(2) + '%' : '0%'}\n\n` +
          `Check the logs for detailed information.`;
        
        alert(summary);
        
      } catch (error) {
        pageLog("NETWORK_DIAGNOSTICS_ERROR", { error: error.message });
        setStatus("Network diagnostics failed");
        alert(`Network diagnostics failed: ${error.message}`);
      }
    }

    // Helper function for modal close button
    tab.window.closeModal = function() {
      const modal = doc.querySelector('div[style*="position: fixed"]');
      if (modal) {
        modal.remove();
      }
    }

    // Add the "Load More" functionality
    tab.window.loadMore = function() {
      currentRenderCount += PAGE_SIZE;
      renderTimeline(); // Re-render with higher limit
    };

    // Initial render
    renderTimeline();

    // ---------------------------------------------------------------
    // PROCESS ONE UID (now self-contained, errors won't kill loop)
    // ---------------------------------------------------------------

    async function processOneUid(uid) {
      pageLog("PROCESS_START", { uid });

      try {
        // Retry wrapper for ghost response hangs
        let json;
        let retryCount = 0;
        const MAX_RETRIES = 2;
        
        while (retryCount <= MAX_RETRIES) {
          try {
            json = await fetchUserPosts(uid, pageLog, retryCount);
            break; // Success
          } catch (err) {
            if ((err.message.includes("timeout") || err.message.includes("Ghost")) && retryCount < MAX_RETRIES) {
              pageLog("RETRY_ON_HANG", { uid, attempt: retryCount + 1, reason: err.message });
              await sleep(5000);  // 5s extra wait before retry
              retryCount++;
              continue;
            }
            throw err; // Re-throw if not a timeout or max retries exceeded
          }
        }

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
          let plainText = "";
          let createdAt = "";
          let created_ts = 0;
          
          // Handle retweets
          const isRetweet = !!mblog.retweeted_status;
          const sourceMblog = mblog.retweeted_status || mblog;
          
          if (mblog.user) {
            username =
              mblog.user.screen_name ||
              mblog.user.remark ||
              mblog.user.name ||
              "";
          }

          // Extract text from both retweet and original post
          const tmp = doc.createElement("div");
          if (isRetweet) {
            // For retweets, include both retweet text and original text
            const retweetText = (mblog.text || "").replace(/\/\/@.*$/, "").trim(); // Remove quoted user
            const originalText = (sourceMblog.text || "").trim();
            tmp.innerHTML = retweetText + (originalText ? " | " + originalText : "");
          } else {
            tmp.innerHTML = mblog.text || "";
          }
          plainText = (tmp.textContent || tmp.innerText || "").trim();

          createdAt = mblog.created_at || "";
          created_ts = parseWeiboTime(createdAt); // Use retweet time for sorting
          const link = "https://weibo.com/" + uid + "/" + bid;
          
          // Extract images from the post (handles retweets internally)
          const images = extractImages(mblog);

          timeline[key] = {
            key,
            uid,
            username,
            bid,
            text: plainText,
            createdAt,
            created_ts,
            importedAt: Date.now(),
            link,
            images: images,
            isRetweet: isRetweet
          };

          added++;
        });

        if (added > 0) {
          // --- AUTO-PRUNING LOGIC (Solution 1) ---
          const allKeys = Object.keys(timeline);
          
          if (allKeys.length > MAX_STORED_POSTS) {
            // Sort keys by creation time (Oldest first)
            allKeys.sort((a, b) => {
              return (timeline[a].created_ts || 0) - (timeline[b].created_ts || 0);
            });

            // Calculate how many to delete
            const deleteCount = allKeys.length - MAX_STORED_POSTS;
            
            // Delete the oldest ones and cleanup their blob URLs
            const deletedKeys = [];
            for (let k = 0; k < deleteCount; k++) {
              deletedKeys.push(allKeys[k]);
              delete timeline[allKeys[k]];
            }
            
            // Clean up blob URLs for deleted posts
            revokeBlobUrlsForKeys(deletedKeys);
            
            pageLog("PRUNED_POSTS", { 
              deletedCount: deleteCount, 
              remainingCount: MAX_STORED_POSTS 
            });
          }
          // ---------------------------

          updateUidHealth(uid, HEALTH_VALID, added);
          saveTimeline(timeline);
          pageLog("PROCESS_DONE", {
            uid,
            added,
            totalEntries: Object.keys(timeline).length
          });
          
          // Only render if not in batch mode during manual refresh
          if (!deferRenderingDuringRefresh) {
            renderTimeline();
            updateUidStatus();
          }
        } else {
          pageLog("PROCESS_DONE", { uid, added: 0 });
          // Always update health to track frequency counters, even if status doesn't change
          const existingHealth = getUidHealth(uid);
          let newStatus = existingHealth.status;
          
          // If previously invalid/unknown, mark as stalled (successful check but no content)
          // If already valid, keep as valid
          if (newStatus !== HEALTH_VALID) {
            newStatus = HEALTH_STALLED;
          }
          
          updateUidHealth(uid, newStatus, 0);
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