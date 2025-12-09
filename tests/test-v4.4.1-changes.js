// Simple validation test for v4.4.1 changes
// This is not a full test suite, just validation of key patterns

const fs = require('fs');
const path = require('path');

const scriptPath = path.join(__dirname, '..', 'userscript.js');
const scriptContent = fs.readFileSync(scriptPath, 'utf8');

console.log('🧪 Testing v4.4.1 changes...\n');

let allPassed = true;

// Test 1: Check version bump to 4.4.1
console.log('Test 1: Version update');
if (scriptContent.includes('// @version      4.4.1')) {
  console.log('  ✅ Version bumped to 4.4.1');
} else {
  console.log('  ❌ Version not updated to 4.4.1');
  allPassed = false;
}

if (scriptContent.includes('v4.4.1')) {
  console.log('  ✅ v4.4.1 mentioned in description');
} else {
  console.log('  ❌ v4.4.1 not in description');
  allPassed = false;
}

// Test 2: Check for observerContext (scope binding fix)
console.log('\nTest 2: Observer context for scope binding');
if (scriptContent.includes('const observerContext = {')) {
  console.log('  ✅ observerContext object created');
} else {
  console.log('  ❌ observerContext object not found');
  allPassed = false;
}

if (scriptContent.includes('observerContext.getImagesCache')) {
  console.log('  ✅ observerContext.getImagesCache used');
} else {
  console.log('  ❌ observerContext.getImagesCache not used');
  allPassed = false;
}

if (scriptContent.includes('observerContext.downloadImage')) {
  console.log('  ✅ observerContext.downloadImage used');
} else {
  console.log('  ❌ observerContext.downloadImage not used');
  allPassed = false;
}

// Test 3: Check for improved error isolation
console.log('\nTest 3: Error isolation improvements');
if (scriptContent.includes('} catch (observerError) {')) {
  console.log('  ✅ Observer error catch block added');
} else {
  console.log('  ❌ Observer error catch block missing');
  allPassed = false;
}

if (scriptContent.includes('console.error("[WeiboTimeline] Observer error:"')) {
  console.log('  ✅ Observer error logging added');
} else {
  console.log('  ❌ Observer error logging missing');
  allPassed = false;
}

// Test 4: Check for lightbox error handling
console.log('\nTest 4: Lightbox error handling');
if (scriptContent.includes('} catch (e) {') && scriptContent.includes('[WeiboTimeline] Lightbox error')) {
  console.log('  ✅ Lightbox error handling added');
} else {
  console.log('  ❌ Lightbox error handling missing');
  allPassed = false;
}

// Test 5: Check for fixed console.log usage in main scope
console.log('\nTest 5: Console logging fixes in main scope');
if (scriptContent.includes('console.log("[WeiboTimeline] IMAGE_CACHE_EVICTED"')) {
  console.log('  ✅ IMAGE_CACHE_EVICTED uses console.log (not pageLog)');
} else {
  console.log('  ❌ IMAGE_CACHE_EVICTED should use console.log');
  allPassed = false;
}

if (scriptContent.includes('console.log("[WeiboTimeline] CLEANUP_STALE_DOWNLOADS"')) {
  console.log('  ✅ CLEANUP_STALE_DOWNLOADS uses console.log');
} else {
  console.log('  ❌ CLEANUP_STALE_DOWNLOADS should use console.log');
  allPassed = false;
}

if (scriptContent.includes('console.log("[WeiboTimeline] IMAGE_FAILURE_PATTERN_DETECTED"')) {
  console.log('  ✅ IMAGE_FAILURE_PATTERN_DETECTED uses console.log');
} else {
  console.log('  ❌ IMAGE_FAILURE_PATTERN_DETECTED should use console.log');
  allPassed = false;
}

// Test 6: Check for LRU tracking improvements
console.log('\nTest 6: LRU tracking improvements');
const lastAccessedUpdateCount = (scriptContent.match(/lastAccessed = Date\.now\(\)/g) || []).length;
if (lastAccessedUpdateCount >= 2) {
  console.log(`  ✅ lastAccessed updated in ${lastAccessedUpdateCount} places`);
} else {
  console.log(`  ❌ lastAccessed should be updated in multiple places (found ${lastAccessedUpdateCount})`);
  allPassed = false;
}

// Test 7: Verify new log types for v4.4.1
console.log('\nTest 7: New log types for v4.4.1');
const newLogTypes = [
  'IMAGE_CACHE_APPLIED',
  'IMAGE_RENDER_TIMEOUT',
  'IMAGE_RENDER_APPLIED',
  'IMAGE_RENDER_FAILED'
];

let logTypesOk = true;
newLogTypes.forEach(logType => {
  if (scriptContent.includes(`'${logType}'`)) {
    // Log type exists
  } else {
    console.log(`  ❌ Log type ${logType} not found`);
    logTypesOk = false;
    allPassed = false;
  }
});

if (logTypesOk) {
  console.log('  ✅ All new log types present');
}

// Test 8: Verify critical functions still preserved
console.log('\nTest 8: Critical functions preserved');
const criticalFunctions = [
  'renderTimeline',
  'processOneUid',
  'downloadImage',
  'getImagesCache',
  'refreshAll',
  'setupImageObserver'
];

let functionsOk = true;
criticalFunctions.forEach(fn => {
  if (scriptContent.includes(`function ${fn}(`) || scriptContent.includes(`${fn} = function`)) {
    // Function exists
  } else {
    console.log(`  ❌ Critical function ${fn} not found`);
    functionsOk = false;
    allPassed = false;
  }
});

if (functionsOk) {
  console.log('  ✅ All critical functions present');
}

// Test 9: v4.4.1 specific description elements
console.log('\nTest 9: v4.4.1 description elements');
if (scriptContent.includes('scope issues')) {
  console.log('  ✅ "scope issues" mentioned in description');
} else {
  console.log('  ❌ "scope issues" not in description');
  allPassed = false;
}

if (scriptContent.includes('error isolation')) {
  console.log('  ✅ "error isolation" mentioned in description');
} else {
  console.log('  ❌ "error isolation" not in description');
  allPassed = false;
}

// Summary
console.log('\n' + '='.repeat(50));
if (allPassed) {
  console.log('✅ All tests passed! v4.4.1 changes validated.');
  process.exit(0);
} else {
  console.log('❌ Some tests failed. Review changes.');
  process.exit(1);
}
