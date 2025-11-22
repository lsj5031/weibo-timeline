# Weibo Timeline Userscript

A Tampermonkey userscript that creates a clean, text-only timeline dashboard for monitoring multiple Weibo accounts. Features chronological sorting, UID health management, and comprehensive testing capabilities.

## 🚀 Quick Start

### Installation
1. Install [Tampermonkey](https://www.tampermonkey.net/) in your browser
2. Copy `userscript.js` to Tampermonkey
3. Configure your UIDs in the `USERS` array
4. Save and enable the script

### Testing Without Tampermonkey
Open `test-page.html` in your browser to test functionality without installing Tampermonkey. The test interface includes:
- Mock API responses and testing scenarios
- UID validation and health tracking
- Timeline sorting verification
- Real-time console output

## ✨ Features

### 📅 Chronological Timeline
- Posts sorted by actual creation time (not when discovered)
- Human-readable timestamps ("2h ago", "1d ago")
- Persistent archive with proper time ordering

### 👥 UID Management
- Health tracking for each monitored account
- Automatic validation and problem detection
- Export/import functionality for backup
- Visual status indicators (valid/invalid/stalled)

### 🎨 Agent Mode Themes
Four color schemes for different workflows:
- **SMART** (Green): Balanced, focused browsing
- **FREE** (Blue): Creative, exploratory mode
- **RUSH** (Gold): Fast-paced, urgent tasks
- **PLAN** (Purple): Strategic, planning mode

### 🖼️ Enhanced Media Experience
- Built-in image lightbox (no new tabs)
- Smart image grids based on count
- Hover-revealed actions for cleaner UI
- Responsive design for all screen sizes

### 🛡️ Robust Error Handling
- Granular error types and recovery
- UID-specific error tracking
- Comprehensive logging and debugging
- Graceful degradation on failures

## 📖 Usage

### Basic Setup
1. Install the userscript in Tampermonkey
2. Edit the `USERS` array with Weibo UIDs to monitor
3. Access the dashboard via the Tampermonkey menu

### Dashboard Features
- **Timeline View**: Chronological feed of all monitored posts
- **UID Management**: Validate and manage monitored accounts
- **Agent Mode**: Switch between color themes
- **Export Tools**: Backup data and health information

### UID Management
- Click "Validate All UIDs" to check account health
- Use "Manage UIDs" to identify problematic accounts
- Export health data for backup and analysis
- Remove invalid UIDs directly from the `USERS` array

## 🔧 Technical Details

### Architecture
- **Modular Design**: Separate utilities, API layer, and UI components
- **Local Storage**: Persistent data storage in browser
- **Error Resilience**: Robust error handling and recovery
- **Rate Limiting**: Respectful API polling intervals

### Data Structures
```javascript
// Timeline entry structure
{
  id: "unique_post_id",
  user: "username",
  text: "post_content",
  createdAt: "Wed Nov 20 10:30:00 +0800 2024",
  images: ["url1", "url2"],
  created_ts: 1701234567890
}

// UID health tracking
{
  "1234567890": {
    status: "valid",           // valid/invalid/stalled/unknown
    lastChecked: 1701234567890,
    lastSuccess: 1701234567890
  }
}
```

## 🧪 Testing

### Test Interface
Open `tests/test-page.html` to access comprehensive testing tools:
- Mock API responses for different scenarios
- UID validation and health tracking
- Timeline sorting verification
- Error handling simulation

### Test Scenarios
- **API Responses**: Empty data, errors, rate limiting
- **UID Validation**: Valid formats, invalid formats, edge cases
- **Timeline Sorting**: Mixed timestamps, missing data, malformed dates
- **Error Recovery**: Network failures, timeouts, parsing errors

## 🐛 Troubleshooting

### Common Issues
- **Timeline Not Updating**: Validate UIDs and check health status
- **Posts Out of Order**: Clear cache and re-validate all UIDs
- **UID Errors**: Use management tools to identify problems
- **Storage Issues**: Check browser localStorage permissions

### Debug Tools
- Console logging in dashboard
- Export UID health data for analysis
- Mock API response testing
- Browser developer tools integration

### Documentation
- **Performance Guide**: See `docs/PERFORMANCE_GUIDE.md` for optimization details
- **Agent Modes**: See `docs/AGENT_MODES.md` for theme documentation
- **Visual Guide**: See `docs/BEFORE_AFTER_GUIDE.md` for performance comparisons

## 📄 License

This project is provided as-is for educational and personal use.

---

**Key Features**: Chronological sorting • UID health management • Agent mode themes • Image lightbox • Comprehensive testing • Error resilience