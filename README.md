# Weibo Timeline Userscript

A Tampermonkey userscript that creates a clean, text-only timeline dashboard for monitoring multiple Weibo accounts. Features manual refresh, UID health management, chronological sorting, and comprehensive error handling.

## Quick Start

### Installation
1. Install [Tampermonkey](https://www.tampermonkey.net/) in your browser
2. Copy `userscript.js` to Tampermonkey
3. Configure your UIDs in the `USERS` array (empty by default)
4. Save and enable the script
5. Click the Tampermonkey icon and select "Weibo Timeline Dashboard" to open the dashboard

### Testing Without Tampermonkey
Open `tests/test-page.html` in your browser to test functionality. The test interface includes mock API responses and testing scenarios.

## Dashboard Preview

![Weibo Timeline Dashboard](Screenshot%20weibio.png)

## Features

### Chronological Timeline
- Posts sorted by actual creation time (not when discovered)
- Human-readable timestamps ("2h ago", "1d ago")
- Persistent local archive up to 3000 posts
- Image thumbnails with lazy loading
- Retweet detection and proper text extraction
- Video thumbnail support

### Manual Refresh
- Click "Refresh All" button to manually fetch posts from all monitored accounts
- Automatic retry on network timeouts (up to 2 retries)
- Real-time progress tracking during refresh
- Graceful error handling per account

### UID Management
- Health tracking for each monitored account (valid/invalid/stalled/unknown)
- Automatic validation with "Validate All UIDs" button
- Edit UIDs directly in-dashboard modal
- Export health data for backup and analysis
- Remove problematic UIDs automatically or manually

### Image Handling
- Smart image download queue with concurrency control (3 concurrent downloads)
- Automatic retry with exponential backoff (up to 3 attempts per image)
- Blob URL caching with proper cleanup
- Image placeholder and error states
- Video thumbnail extraction

### Robust Error Handling
- Per-UID error tracking and health monitoring
- 25-second hard timeout on requests
- Network failure recovery with automatic retry logic
- Ghost response detection (requests that hang indefinitely)
- Graceful degradation when individual accounts fail
- Comprehensive console logging for debugging

### Theme Support
- Dark mode support with CSS variable theming
- Responsive design for all screen sizes
- Clean, minimalist UI focused on content

## Usage

### Basic Setup
1. Install the userscript in Tampermonkey
2. Click Tampermonkey menu → "Weibo Timeline Dashboard"
3. Click "Edit UIDs" to add Weibo account IDs (6-11 digit numbers)
4. Save and the dashboard will load

### Dashboard Controls
- **Refresh All**: Manually fetch new posts from all accounts (shows progress)
- **Edit UIDs**: Add/remove accounts to monitor
- **Validate All UIDs**: Check which accounts are working
- **Manage UIDs**: Identify and remove problematic accounts
- **Export Health Data**: Download UID health status as JSON
- **Load More**: Display additional posts from the archive

## Technical Details

### Architecture
- Single-file userscript with modular internal structure
- Local Storage for persistent data (timeline, UID health, user list)
- Manual refresh mode (auto-refresh disabled for rate-limiting)
- Respectful API polling: 10 seconds between accounts, random jitter (0-2s)

### Data Structures
```javascript
// Timeline entry structure
{
  key: "uid_bid",
  uid: "user_id",
  username: "user_screen_name",
  bid: "post_id",
  text: "post_content",
  createdAt: "Wed Nov 20 10:30:00 +0800 2024",
  created_ts: 1701234567890,
  link: "https://weibo.com/uid/bid",
  images: [{url, thumbnail, alt, key}],
  isRetweet: false
}

// UID health tracking
{
  "uid": {
    status: "valid",           // valid/invalid/stalled/unknown
    lastChecked: 1701234567890,
    lastSuccess: 1701234567890
  }
}
```

### LocalStorage Keys
- `weibo_timeline_v3` - Archive of posts
- `weibo_uid_health_v1` - Health status of each UID
- `weibo_last_uid_v3` - Last successfully processed UID
- `weibo_users_v1` - List of UIDs being monitored
- `weibo_agent_mode_v1` - Current agent/theme mode

### API Configuration
- Endpoint: `https://m.weibo.cn/api/container/getIndex`
- Request timeout: 25 seconds (hard abort)
- Retry logic: Up to 2 automatic retries on timeout
- Rate limiting: 10s between accounts + 0-2s random jitter
- Max posts stored: 3000 (auto-prunes oldest when exceeded)

## Testing

### Test Files
- `tests/test-page.html` - Interactive test interface
- `tests/test-runner.js` - Test utilities
- `tests/validate-uids.js` - UID validation helpers
- `mock-gm-apis.js` - Mock Tampermonkey APIs for testing

### Running Tests
Open `tests/test-page.html` in your browser to access testing tools including:
- Mock API responses for different scenarios
- UID validation testing
- Timeline sorting verification

## Troubleshooting

### Posts Not Updating
- Check that UIDs are valid 6-11 digit numbers
- Click "Validate All UIDs" to verify accounts are accessible
- Use "Export Health Data" to see detailed status
- Manual refresh may be rate-limited by Weibo (wait and retry)

### Posts Out of Order
- Clear localStorage cache: Open DevTools → Application → Storage → Clear All
- Re-validate all UIDs
- Click "Refresh All" to fetch fresh data

### UID Errors
- Use "Manage UIDs" to identify problematic accounts
- Remove invalid UIDs using "Edit UIDs"
- Check browser console (F12) for detailed error logs

### Storage Issues
- Browser localStorage is limited to ~5-10MB
- Script auto-prunes oldest posts when exceeding 3000 total
- Export and backup important data before clearing storage

## Development Notes

### Debugging
- Open dashboard → Open browser DevTools (F12)
- All script activity logged to console with `[WeiboTimeline]` prefix
- Log categories: REQUEST, TIMEOUT_ERROR, NETWORK_ERROR, API_LOGIC_WARN, etc.

### Known Limitations
- Weibo's mobile API is undocumented and may change
- Rate limiting enforced per Weibo's anti-scraping measures
- Images download on-demand (not persisted to localStorage due to size)
- Retweets show both retweet and original post text combined

## License

This project is provided as-is for educational and personal use.

---

**Key Features**: Manual refresh • UID health management • Chronological sorting • Image support • Retweet handling • Comprehensive error recovery • Local archive (3000 posts max) • Responsive UI
