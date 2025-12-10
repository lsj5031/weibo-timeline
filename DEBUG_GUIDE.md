# Debug Guide for Weibo Timeline Manual Refresh & Image Download Issues

## Overview

This guide documents all debug logging that has been added to help troubleshoot issues with manual refresh failing after 1-2 UIDs and images not downloading/displaying.

## How to Access the Logs

1. **Dashboard Log Panel**: Open the Weibo Timeline dashboard and check the log panel at the top. It shows real-time logs with filtering options (Errors, Warnings, Info, Debug).

2. **Browser Console**: Press `F12` in your browser to open Developer Tools → Console tab. Look for logs starting with `[WeiboTimeline]`.

3. **Dashboard Log Panel Filtering**: Use the checkboxes to filter logs by type:
   - Errors (red)
   - Warnings (yellow)
   - Info (blue)
   - Debug (purple)

## Key Debug Log Points

### Manual Refresh Flow

#### 1. Refresh Initiation
```
REFRESH_STATE_DEBUG
- Logs: manualRefreshInProgress, deferRenderingDuringRefresh, imageDownloadsPaused, imageProcessingDeferred, activeImageDownloads, queueLength, pendingDownloads
- Purpose: Verify all flags are properly set before refresh starts
```

#### 2. Refresh Loop Start
```
REFRESH_LOOP_STARTING
- startIndex: Where in the UID list we're starting (0 for fresh, higher if resuming)
- totalToProcess: Number of UIDs to process
- Purpose: Track loop initialization and resume logic
```

#### 3. Per-UID Processing
```
PROCESS_UID_STARTING
- uid, index, totalAccounts, progress, queueState, health
- queueState: activeImageDownloads, queueLength, pendingDownloads, paused, deferred
- Purpose: Verify each UID starts processing with correct queue state

PROCESS_UID_SUCCESS
- uid, index, successCount, queueState
- Purpose: Confirm UID processed successfully

PROCESS_FATAL / PROCESS_HARD_TIMEOUT
- uid, index, error, errorType, queueState
- Purpose: Track failures and timeouts with queue state for correlation
```

#### 4. Network Request Details
```
REQUEST_DETAILED
- uid, logLabel, startTime, containerid, networkDiagnostics
- networkDiagnostics: online status, connection type, effective type, RTT
- Purpose: Detect if network issues occur early in refresh
```

#### 5. Between-Account Sleep
```
SleepBetweenAccounts
- uid, nextUid, ms (total wait time), jitter, queueState
- Purpose: Track 10s wait between accounts

AfterSleepBetweenAccounts
- uid, nextIndex, nextUid, queueState
- Purpose: Verify sleep completed and queue state before next UID
```

#### 6. Refresh Finalization
```
MANUAL_REFRESH_FINALLY_BLOCK
- successCount, failureCount, timeoutCount, totalProcessed, totalUids, queueState, flags
- Purpose: Final state snapshot before cleanup

MANUAL_REFRESH_FULLY_COMPLETE
- duration, successCount, failureCount, timeoutCount
- Purpose: Complete refresh summary
```

### Image Download Queue Management

#### Queue Processing
```
PROCESS_QUEUE_PAUSED
- paused, active, queue
- Purpose: Diagnose if queue is paused (expected during refresh)

PROCESS_QUEUE_PROCESSING
- active, concurrency, queue
- Purpose: Track when queue starts processing

DEQUEUING_TASK
- key, queueRemaining, active
- Purpose: Monitor individual tasks being dequeued
```

#### Download Resumption
```
RESUME_DOWNLOADS_NOOP
- paused, active, queue
- Purpose: Track if resume was called when already resumed (redundant call)

IMAGE_DOWNLOADS_RESUMED_PROCESSING
- paused, active, queueLength, pendingDownloads
- Purpose: Confirm downloads are actually resuming
```

### Individual Image Download Tracking

```
IMAGE_FINALIZED
- key, attempt, success, duration, activeAfter, queueLength
- Purpose: Track each image download completion

IMAGE_DOWNLOAD_FAILED / IMAGE_DOWNLOAD_RETRY
- key, attempt, error, duration, networkInfo
- Purpose: Diagnose image download failures
```

## Troubleshooting Workflow

### Issue: Manual Refresh Fails After 1-2 UIDs

1. **Check PROCESS_UID_STARTING logs**
   - Look at the `queueState` for each UID
   - Is `activeImageDownloads` growing? Should stay ≤ 3
   - Is `queueLength` growing unbounded?

2. **Look for PROCESS_FATAL or PROCESS_HARD_TIMEOUT**
   - Which UID failed?
   - What's the error message?
   - Check `queueState` - is queue stuck?

3. **Check AfterSleepBetweenAccounts logs**
   - Does the queue state change after the 10s sleep?
   - If queue grows during sleep, images are queuing up

4. **Look for REFRESH_OUTER_ERROR**
   - This catches uncaught exceptions
   - Shows exact error type and partial stack trace

### Issue: Images Not Downloading/Displaying

1. **Check PROCESS_QUEUE_PAUSED logs**
   - Queue should be paused during refresh
   - Resume should happen in MANUAL_REFRESH_FINALLY_BLOCK

2. **Check DEQUEUING_TASK logs**
   - After refresh completes, should see image tasks being dequeued
   - If no dequeue logs, queue processor isn't running

3. **Check IMAGE_FINALIZED logs**
   - For each image, should see finalization
   - If `success: false`, check the error

4. **Network Diagnostics**
   - If seeing IMAGE_FAILURE_PATTERN_DETECTED logs
   - Click "Network Diagnostics" button to test connectivity

### Issue: Loop Stops at UID 2-3

1. **Find the specific UID in logs**
   - Look for PROCESS_UID_STARTING for the problematic UID
   - Note the queueState

2. **Check for timeout**
   - PROCESS_HARD_TIMEOUT means it hit the 40s limit
   - Look at REQUEST_DETAILED logs - did request take too long?

3. **Check for uncaught error**
   - REFRESH_OUTER_ERROR will show any exception
   - Check browser console for JavaScript errors

4. **Check queue corruption**
   - If activeImageDownloads > 3, there's a deadlock
   - pendingDownloads growing without decreasing?

## Expected Log Sequence for Successful Refresh

```
1. REFRESH_STATE_DEBUG - Setup
2. REFRESH_LOOP_STARTING - Begin loop
3. Loop for each UID:
   - PROCESS_UID_STARTING
   - FETCH_USER_POSTS_STARTING
   - FETCH_USER_POSTS_COMPLETE (or FETCH_USER_POSTS_ERROR)
   - PROCESS_UID_SUCCESS (or PROCESS_FATAL)
   - SleepBetweenAccounts
   - AfterSleepBetweenAccounts
4. MANUAL_REFRESH_COMPLETE - Loop finished
5. MANUAL_REFRESH_FINALLY_BLOCK - Cleanup started
6. RENDERING_TIMELINE
7. TIMELINE_RENDERED
8. DEFERRAL_BEING_LIFTED
9. IMAGE_PROCESSING_RESUMED
10. RESUMING_DOWNLOADS
11. IMAGE_DOWNLOADS_RESUMED
12. MANUAL_REFRESH_FULLY_COMPLETE
13. (Image tasks dequeued): DEQUEUING_TASK, IMAGE_FINALIZED
```

## Console vs Dashboard Logs

- **Console logs** (`console.log`): Start with `[WeiboTimeline]`, show queue state details, used for low-level debugging
- **Dashboard logs** (`pageLog`): Appear in dashboard panel, searchable, color-coded by type, include timestamps

Both sources of information are complementary.

## Important Variables to Watch

When investigating, watch these queue variables in logs:

- `activeImageDownloads` - Should be 0-3 during normal operation
- `queueLength` - Should go up during refresh, then down as downloads complete
- `pendingDownloads` - Should match downloads in flight
- `paused` / `deferred` - Should only be true during refresh
- `duration` - Per-request times should be < 25s (hard timeout)

## Network Diagnostics

If you see suspicious patterns:

1. Click "Network Diagnostics" button in dashboard
2. Check the output:
   - Online status
   - Connection effectiveness (4g, 3g, etc.)
   - Weibo.com and Sinaimg.cn reachability
   - Image failure rate

## Getting Help

When reporting issues, include:

1. **Dashboard logs** - Copy from the log panel during the failure
2. **Browser console output** - All `[WeiboTimeline]` messages
3. **Description** - At which UID/image did it fail?
4. **Network state** - Run diagnostics and include results
5. **UID count** - How many UIDs are configured?
