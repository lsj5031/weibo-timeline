# Debug Logging Implementation for Manual Refresh Issues

## Summary

This update adds comprehensive debug logging throughout the manual refresh flow and image download pipeline to help diagnose why refreshes fail after 1-2 UIDs and images aren't downloading/displaying.

## Changes Made

### 1. Manual Refresh Flow Logging

Added detailed logging at key checkpoints:

- **Refresh Initialization**: `REFRESH_STATE_DEBUG` - logs all control flags and queue states
- **Loop Start**: `REFRESH_LOOP_STARTING` - logs total UIDs to process and starting point
- **Per-UID Processing**: 
  - `PROCESS_UID_STARTING` - state before processing
  - `PROCESS_UID_SUCCESS` - successful completion
  - `FETCH_USER_POSTS_STARTING` / `FETCH_USER_POSTS_COMPLETE` - API call tracking
- **Between-Account Delays**: `SleepBetweenAccounts` / `AfterSleepBetweenAccounts` - track 10s delays
- **Finalization**: 
  - `MANUAL_REFRESH_FINALLY_BLOCK` - cleanup started
  - `MANUAL_REFRESH_FULLY_COMPLETE` - final summary
- **Error Handling**: `REFRESH_OUTER_ERROR` - catches any uncaught exceptions in the loop

All logs include `queueState` snapshots showing:
- `activeImageDownloads` (0-3 normal)
- `queueLength` (queued tasks)
- `pendingDownloads` (in-flight downloads)

### 2. Network Request Tracking

Enhanced `fetchWeiboApi()` function:

- **Detailed Logging**: `REQUEST_DETAILED` - logs containerid and network diagnostics at request start
- **Hard Timeout Handling**: Properly aborts request when 25s hard timeout triggers
- **Request Handle Capture**: Ensures `gmRequest` handle is captured for proper cleanup
- **Abort Failure Tracking**: Logs if `.abort()` call fails

### 3. Image Download Queue Management

Added console logs for queue operations:

- **Queue Processing**: `PROCESS_QUEUE_PAUSED` / `PROCESS_QUEUE_PROCESSING` - logs queue state
- **Task Dequeuing**: `DEQUEUING_TASK` - logs each image being pulled from queue
- **Download Resumption**:
  - `RESUME_DOWNLOADS_NOOP` - if called when already resumed
  - `IMAGE_DOWNLOADS_RESUMED_PROCESSING` - successful resume
- **Individual Downloads**: 
  - `IMAGE_FINALIZED` - tracks completion of each download
  - `FINALIZE_ALREADY_COMPLETED` - detects double-finalization (deadlock indicator)

### 4. Process Completion Tracking

Added completion logs to `processOneUid()`:

- `PROCESS_UID_COMPLETED` - logs successful completion with queue state
- Captures final queue state at UID completion for correlation

### 5. Error Tracking

Enhanced error logging:

- All catch blocks now log error type and message
- Queue state captured with all error logs
- Hard timeouts distinguished from other failures
- Outer exception handler catches uncaught errors in refresh loop

## Log Format

All logs are available through:

1. **Dashboard Log Panel** - Real-time, filtered by type (Error/Warning/Info/Debug)
2. **Browser Console** - Search for `[WeiboTimeline]` prefix for console logs

Example dashboard log:
```
[14:23:45] PROCESS_UID_STARTING {"uid":"1234567890","index":"1","totalAccounts":"5","progress":"20%",...}
```

Example console log:
```
[WeiboTimeline] DEQUEUING_TASK {key: "1234567890_img_0", queueRemaining: 12, active: 1}
```

## How to Use for Debugging

### Finding the Failure Point

1. Open Dashboard and click "Refresh All"
2. Watch the Status field - it shows which UID is being processed
3. Check logs - look for `PROCESS_FATAL` or `PROCESS_HARD_TIMEOUT` to find failing UID
4. Look at the queueState in that log:
   - `activeImageDownloads > 3` = queue deadlock
   - `queueLength` growing = downloads not being processed
   - `pendingDownloads` growing = stuck downloads

### Finding Image Download Issues

1. After refresh completes, check if images appear
2. Look for `IMAGE_DOWNLOADS_RESUMED_PROCESSING` - should appear in finally block
3. Check for `DEQUEUING_TASK` logs - should see images being downloaded
4. If no dequeue logs:
   - Queue was empty (images cached or not found)
   - Queue processor didn't run (check `paused` flag)
5. Look for `IMAGE_FINALIZED` logs showing success/failure

### Testing Network Connectivity

1. If suspicious patterns appear, click "Network Diagnostics"
2. Check results:
   - Online: true/false
   - Weibo.com: Reachable/Not reachable
   - Sinaimg.cn: Reachable/Not reachable
   - Image failure rate: percentage

## Variables to Monitor

When investigating, watch these in logs:

```
queueState: {
  activeImageDownloads: 0-3 (normal), > 3 (deadlock)
  queueLength: 0-50 (normal), > 100 (backlog)
  pendingDownloads: 0-3 (normal), growing (stuck)
  paused: true (during refresh), false (normal)
  deferred: true (during refresh), false (normal)
}
```

## Performance Impact

The debug logging has minimal performance impact:

- Console logs only occur during operations (not in loops)
- Dashboard logs are asynchronous and batched
- No additional network requests
- Queue state snapshots are O(1) operations

## Files Modified

1. **userscript.js** - Added comprehensive logging throughout
2. **DEBUG_GUIDE.md** - Detailed troubleshooting guide (new file)
3. **CHANGES_SUMMARY.md** - This file (new file)

## Next Steps

When issues occur:

1. Run the refresh operation and watch logs
2. Identify the failure point using the logs
3. Check queueState at failure
4. Run network diagnostics if needed
5. Report with:
   - Log excerpt showing the failure
   - Queue state at failure time
   - Network diagnostics results
   - Number of UIDs configured

## Integration with Existing Code

All debug logging is non-intrusive:

- Uses existing `pageLog()` function for dashboard logs
- Uses `console.log()` for low-level console logs
- No changes to core logic or algorithm
- No new dependencies
- Maintains backward compatibility
