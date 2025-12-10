# AGENTS.md - Development Notes for AI Agents

This document captures lessons learned from debugging sessions to help AI agents avoid common pitfalls when working with this codebase.

## Userscript Environment Quirks

### 1. Temporal Dead Zone (TDZ) Issues in Firefox/Greasemonkey

**Problem**: Firefox's userscript execution context (Tampermonkey/Greasemonkey) has unusual scoping behavior that causes TDZ errors even when variables appear to be declared before use.

**Symptoms**:
```
"can't access lexical declaration 'variableName' before initialization"
```

**Solution**: Use `var` instead of `let` or `const` for variables that are:
- Accessed within nested functions
- Used in closures (especially IntersectionObserver callbacks)
- Referenced across the popup window context

```javascript
// BAD - causes TDZ errors in userscript context
let imageObserver = null;
const observerContext = { ... };

// GOOD - avoids TDZ issues
var imageObserver = null;
var observerContext = { ... };
```

**Affected variables in this codebase**:
- `imageObserver`
- `layoutDebounceTimer`
- Any closure-captured variables inside `GM_registerMenuCommand` callback

### 2. Popup Window Context

The dashboard opens in a new popup window (`window.open("about:blank")`). All JavaScript runs in the **parent script's context**, not the popup's. The popup only receives HTML via `doc.write()`.

**Implications**:
- DOM manipulation targets `doc` (popup's document)
- Functions and variables are in the parent's scope
- IntersectionObserver callbacks need careful reference handling

### 3. Arrow Functions vs Regular Functions

In userscript closures, prefer regular `function(){}` syntax over arrow functions for better compatibility:

```javascript
// Prefer this in IntersectionObserver callbacks
imageObserver = new IntersectionObserver(function(entries) {
  entries.forEach(function(entry) {
    // ...
  });
}, options);
```

## Image Loading Architecture

### Flow Overview
1. **Initial Render**: Posts render immediately with placeholder images
2. **IDB Cache Load**: IndexedDB cache loaded in background (async)
3. **Cache Apply**: Cached images applied to already-rendered placeholders
4. **Background Queue**: Uncached images queued for download (drip-feed)
5. **IntersectionObserver**: Visible images get priority download

### Priority Queue Fix
When user clicks "Show 50 more", visible images should load first, not wait behind thousands of background-queued images:

```javascript
// Prioritize visible images (from observer) by adding to front of queue
if (isFromObserver) {
  imageDownloadQueue.unshift(task);  // Front of queue
} else {
  imageDownloadQueue.push(task);     // Back of queue
}
```

### Key Constants
- `IMAGE_DOWNLOAD_CONCURRENCY = 6` - parallel downloads
- `IMAGE_CACHE_SOFT_LIMIT = 2000` - memory cache limit
- `IMAGE_CACHE_VALIDITY_MS = 7 days` - IDB cache retention

## Debugging Tips

### Log Categories
Logs are categorized and filterable. Important ones for debugging:
- `RENDER_STEP_*` - tracks render progress
- `IMAGE_OBSERVER_TRIGGERED` - confirms observer is firing
- `INIT_ASYNC_RUNNING` - confirms async init started
- `*_ERROR` - any error logs

### Enable Debug Logs
Check the "Debug" checkbox in the log panel to see all logs (some are hidden by default).

### Common Issues

| Symptom | Likely Cause | Solution |
|---------|--------------|----------|
| No posts render | renderTimeline() crashing | Check RENDER_STEP_* logs |
| Posts render, no images | Observer not firing or TDZ error | Check IMAGE_OBSERVER_* logs |
| Images stuck on "Loading" | Download queue stuck or priority issue | Check queue priority logic |
| Logs stop mid-render | TDZ error in a function | Change `let`/`const` to `var` |

## File Structure

```
userscript.js          - Main userscript (single file, ~4000 lines)
├── CONFIG section     - Constants and keys
├── UTILITIES section  - Helper functions
├── IndexedDB section  - Persistent image cache
├── Image download     - Queue and download logic
├── API LAYER         - Weibo API calls
└── MAIN DASHBOARD    - GM_registerMenuCommand callback
    ├── HTML template (doc.write)
    ├── pageLog function
    ├── Masonry layout engine
    ├── IntersectionObserver setup
    ├── renderTimeline function
    └── Async init block
```

## Testing Checklist

Before considering a fix complete:
1. [ ] Dashboard opens without errors
2. [ ] Posts render (check RENDER_STEP_12 shows renderedCount > 0)
3. [ ] Images load (either from cache or download)
4. [ ] "Show X more" loads new posts with images
5. [ ] No TDZ errors in console
6. [ ] Masonry layout arranges cards properly

---
*Last updated after debugging session on 2025-12-10*
