# Manual Refresh Timeout Fix - Test Plan

## Issue Addressed
The manual refresh process could hang if the first (or any) UID processing never completes due to network issues, timeout failures, or other problems. This would leave the entire refresh process stuck.

## Solution Implemented
Added a `processOneUidWithTimeout` wrapper function that enforces a 40-second hard timeout on each UID processing. This ensures:

1. **Guaranteed Continuation**: Even if a single UID hangs indefinitely, the refresh process will continue after 40 seconds
2. **Clear Logging**: Hard timeouts are logged with a distinct `PROCESS_HARD_TIMEOUT` log entry
3. **Health Tracking**: UIDs that timeout are marked as `HEALTH_STALLED` for tracking
4. **Summary Statistics**: The completion log now shows success/failure/timeout counts

## Key Changes

### 1. New Function: `processOneUidWithTimeout(uid, timeoutMs = 40000)`
- Wraps `processOneUid` in a Promise race condition
- Uses a separate timeout mechanism independent of the API layer timeouts
- Properly cleans up timeout handles when processing completes
- Sets `isHardTimeout` flag on timeout errors for identification

### 2. Updated Refresh Loop
- Tracks three counters: `successCount`, `failureCount`, `timeoutCount`
- Differentiates between hard timeouts and regular failures
- Logs appropriate messages for each scenario
- Continues processing remaining UIDs after any failure

### 3. Enhanced Logging
- Added `PROCESS_HARD_TIMEOUT` to log type map with error severity
- Completion summary includes breakdown of results
- Clear messaging when a UID is skipped due to timeout

## Testing Scenarios

### Test 1: Normal Operation
**Setup**: All UIDs respond normally within timeout
**Expected**: 
- All UIDs process successfully
- `successCount` equals total UIDs
- No timeouts logged

### Test 2: First UID Hangs
**Setup**: First UID never responds (simulated network hang)
**Expected**:
- First UID times out after 40s
- `PROCESS_HARD_TIMEOUT` logged for first UID
- Second and subsequent UIDs process normally
- Manual refresh completes successfully

### Test 3: Mixed Failures
**Setup**: Mix of successful, timeout, and error UIDs
**Expected**:
- Each UID handled appropriately
- Correct counts in completion summary
- Process completes for all UIDs

### Test 4: All UIDs Timeout
**Setup**: All UIDs hang
**Expected**:
- All UIDs timeout after 40s each
- Process completes (may take ~40s * UID count)
- All UIDs marked as stalled
- No hung refresh button

## Timeout Hierarchy

The system now has multiple timeout layers:

1. **Network timeout (20s)**: GM_xmlhttpRequest timeout parameter
2. **API timeout (25s)**: Hard timeout in fetchWeiboApi 
3. **Retry timeout (varies)**: Waits between retries in processOneUid
4. **Per-UID timeout (40s)**: NEW - processOneUidWithTimeout wrapper
5. **Total refresh timeout**: None (but bounded by UID count * 40s + gaps)

This ensures that no single point of failure can hang the entire process.

## Manual Testing Steps

1. Open Weibo Timeline dashboard
2. Add test UIDs (including some invalid ones)
3. Click "Refresh All"
4. Monitor the log panel for:
   - PROCESS_START for each UID
   - Either PROCESS_DONE or PROCESS_HARD_TIMEOUT for each UID
   - MANUAL_REFRESH_COMPLETE with statistics
5. Verify refresh button re-enables
6. Verify image downloads resume

## Success Criteria

✅ Manual refresh never hangs indefinitely
✅ Individual UID timeouts don't block subsequent UIDs
✅ Clear logging distinguishes between timeout types
✅ Health tracking updated appropriately
✅ Refresh button state managed correctly
✅ Image downloads pause/resume correctly
