# Changelog - v4.4.2

## 🛠 Fixes

### 1. Network Diagnostic Failure on Weibo.com
**Problem**: The "Network Diagnostics" tool reported `NetworkError` for `https://weibo.com/` even when the site was accessible.
**Cause**: The diagnostic check used the native `fetch` API with `mode: 'no-cors'`, which was being blocked by the browser or server configuration for `weibo.com`.
**Solution**: Switched to using `GM_xmlhttpRequest` (via the `gmRequest` wrapper) for connectivity checks.
**Impact**: 
- Network diagnostics now correctly report "Reachable" for `weibo.com` if the userscript can access it.
- Eliminates false positives in the "Image Failure Pattern" detection log.

## 📝 Technical Details

- Replaced `fetch` loop in `testWeiboConnectivity` with `gmRequest` wrapped in a Promise.
- Preserved `HEAD` method and user-agent masking.
- Maintained compatibility with the existing `results` structure.

---

**Released**: December 9, 2024 (Late)
**Version**: 4.4.2
