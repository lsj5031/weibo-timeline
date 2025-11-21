# Weibo Timeline Userscript - Testing & Improvements

This repository contains an improved version of the Weibo Timeline userscript with comprehensive testing capabilities and several key enhancements.

## 🚀 Testing Without Tampermonkey

### Quick Start
1. Open `test-page.html` in your browser
2. The test interface provides:
   - **Storage Testing**: Test localStorage functions
   - **API Testing**: Test Weibo API calls with mock data
   - **UID Validation**: Test UID format validation
   - **Timeline Preview**: View and test timeline sorting
   - **UID Management**: Add, remove, and validate UIDs

### Features of the Test Interface
- **Mock API Responses**: Edit JSON responses to simulate different Weibo API scenarios
- **Real-time Console**: All logs appear in the interface, not just browser console
- **UID Health Tracking**: Visual indicators for valid/invalid/stalled UIDs
- **Sorting Comparison**: Test current vs. improved timeline sorting
- **Export/Import**: Manage UID lists and health data

## 🎯 Key Improvements Made

### 1. **Fixed Timeline Sorting** ⭐
**Problem**: Timeline was sorted by `created_ts` (when post was added to database)
**Solution**: Now sorted by actual post creation time using `parseWeiboTime()`

```javascript
// OLD: Sort by when added to database
entries.sort((a, b) => (b.created_ts || 0) - (a.created_ts || 0));

// NEW: Sort by actual post time
entries.sort((a, b) => {
  const timeA = parseWeiboTime(a.createdAt);
  const timeB = parseWeiboTime(b.createdAt);
  return timeB - timeA;
});
```

### 2. **UID Health Management** 🏥
**Features**:
- **Health Tracking**: Each UID is tracked as valid/invalid/stalled/unknown
- **Persistent Storage**: Health data saved in localStorage
- **Validation**: Automatic UID format validation
- **Management Interface**: Add/remove UIDs through dashboard
- **Export Functionality**: Export UID health data for analysis

```javascript
// UID health states
const HEALTH_VALID = 'valid';     // API responds correctly
const HEALTH_INVALID = 'invalid';   // API errors or no data
const HEALTH_STALLED = 'stalled';   // No new posts for extended period
const HEALTH_UNKNOWN = 'unknown';   // Not yet checked
```

### 3. **Enhanced Error Handling** 🛡️
- **Granular Error Types**: Network, timeout, JSON parse, API errors
- **UID-Specific Tracking**: Errors per UID don't affect others
- **Recovery Logic**: Failed UIDs are marked but don't stop processing
- **Detailed Logging**: Comprehensive error reporting with context

### 4. **Improved Dashboard** 🎨
- **UID Status Summary**: Visual health indicators
- **Management Controls**: Validate all UIDs, export health data
- **Better Error Display**: Clear error messages and status updates
- **Additional Menu Commands**: Quick access to UID management

## 📋 How to Use the Improved Script

### Installation
1. Copy `userscript-improved.js` to Tampermonkey
2. Configure your UIDs in the `USERS` array
3. Save and enable the script

### UID Management
1. **Open Dashboard**: Click "🟠 Weibo Timeline" in Tampermonkey menu
2. **Validate UIDs**: Click "Validate All UIDs" to check health
3. **View Health**: See status summary (valid/invalid/stalled counts)
4. **Manage UIDs**: 
   - Use "Manage UIDs" to see problematic accounts
   - Manually edit the `USERS` array to remove invalid UIDs
   - Use "Export UID Health" to backup data before changes

### Timeline Behavior
- **Chronological Order**: Posts now sorted by actual posting time
- **Real-time Updates**: New posts appear in correct chronological position
- **Persistent Archive**: All posts preserved with correct timestamps

## 🔧 Technical Details

### Time Parsing
The script now properly parses Weibo's time format:
```javascript
// Input: "Wed Nov 20 10:30:00 +0800 2024"
// Output: Unix timestamp for sorting
function parseWeiboTime(timeString) {
  const match = timeString.match(/\w{3}\s+\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\+\d{4}\s+\d{4}/);
  return match ? new Date(match[0]).getTime() : 0;
}
```

### UID Health Storage
```javascript
// Health data structure
{
  "1234567890": {
    status: "valid",           // valid/invalid/stalled/unknown
    lastChecked: 1701234567890, // timestamp of last check
    lastSuccess: 1701234567890  // timestamp of last successful fetch
  }
}
```

### Error Recovery
- **Network Errors**: Mark UID as invalid, continue processing
- **Timeout Errors**: Mark UID as stalled, retry next cycle
- **API Errors**: Log specific error, mark UID appropriately
- **JSON Errors**: Log parsing issues, continue with other UIDs

## 🧪 Testing Scenarios

### Test Different API Responses
Use the "Mock API Response Editor" to simulate:
- **Empty Responses**: Test handling of no data
- **Error Responses**: Test error handling
- **Rate Limiting**: Test timeout scenarios
- **Malformed Data**: Test JSON parsing errors

### UID Validation Testing
- **Valid UIDs**: 6-11 digit numbers
- **Invalid Formats**: Non-numeric, too short/long
- **Edge Cases**: Special characters, empty strings

### Timeline Sorting Testing
- **Mixed Timestamps**: Posts from different times
- **Same Timestamps**: Posts with identical times
- **Missing Timestamps**: Posts without time data
- **Invalid Formats**: Malformed time strings

## 📊 Migration from Original

### Backup Data
Before upgrading:
1. Export current timeline data from localStorage
2. Note any custom UIDs you've added
3. Check current UID health manually

### Upgrade Steps
1. Install the improved script
2. Add your UIDs to the `USERS` array
3. Use "Validate All UIDs" to check health
4. Remove any problematic UIDs

### Expected Changes
- **Timeline Order**: Posts will reorder by actual posting time
- **New Storage**: Additional health data in localStorage
- **New UI Elements**: UID status indicators and management controls

## 🐛 Development & Testing

### Local Development
1. Open `test-page.html` in browser
2. Use browser dev tools for debugging
3. Mock different API scenarios
4. Test UID validation logic

### Continuous Integration
- **Unit Tests**: Individual function testing via test interface
- **Integration Tests**: Full workflow testing
- **Error Scenarios**: Failure mode testing
- **Performance**: Large dataset handling

## 📝 Troubleshooting

### Common Issues
1. **Timeline Not Updating**: Check UID health, validate UIDs
2. **Posts Out of Order**: Clear cache, re-validate all UIDs
3. **UID Errors**: Use UID management to identify problems
4. **Storage Issues**: Check localStorage quota and permissions

### Debug Information
- **Console Logs**: Detailed logging in dashboard
- **Health Data**: Export UID health for analysis
- **API Responses**: Mock response testing
- **Network Issues**: Check browser network permissions

## 🚀 Future Enhancements

### Potential Improvements
1. **Auto-UID Discovery**: Suggest UIDs based on existing posts
2. **Rate Limiting**: Intelligent throttling based on API responses
3. **Content Filtering**: Filter by keywords, users, or content type
4. **Backup/Sync**: Cloud storage and cross-device synchronization
5. **Analytics**: Post frequency analysis and user activity patterns

### API Considerations
- **Weibo API Changes**: Monitor for API updates and breaking changes
- **Browser Compatibility**: Test across different browsers and versions
- **Performance**: Optimize for large UID lists and timelines
- **Security**: Validate data integrity and sanitize inputs

## 📄 Contributing

### Development Setup
1. Fork this repository
2. Create feature branch
3. Make changes with comprehensive testing
4. Submit pull request with test coverage

### Testing Requirements
- All new features must include tests
- UI changes need screenshot documentation
- API changes need mock response examples
- Bug fixes need regression tests

---

## 🎉 Summary

The improved Weibo Timeline userscript addresses your core requirements:

✅ **Timeline Sorting**: Now properly sorted by actual post creation time
✅ **UID Management**: Comprehensive health tracking and management interface  
✅ **Testing Framework**: Complete testing setup without Tampermonkey
✅ **Error Handling**: Robust error recovery and detailed logging
✅ **User Experience**: Enhanced dashboard with management capabilities

The testing interface allows thorough validation of all functionality without requiring Tampermonkey installation, making development and troubleshooting much more efficient.