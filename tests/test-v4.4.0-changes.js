// Simple validation test for v4.4.0 changes
// This is not a full test suite, just validation of key patterns

const fs = require('fs');
const path = require('path');

const scriptPath = path.join(__dirname, '..', 'userscript.js');
const scriptContent = fs.readFileSync(scriptPath, 'utf8');

console.log('🧪 Testing v4.4.0 changes...\n');

let allPassed = true;

// Test 1: Check for deferRenderingDuringRefresh flag
console.log('Test 1: Batched rendering flag');
if (scriptContent.includes('let deferRenderingDuringRefresh = false;')) {
  console.log('  ✅ Flag declared');
} else {
  console.log('  ❌ Flag not found');
  allPassed = false;
}

if (scriptContent.includes('if (!deferRenderingDuringRefresh)')) {
  console.log('  ✅ Conditional rendering check present');
} else {
  console.log('  ❌ Conditional rendering check missing');
  allPassed = false;
}

if (scriptContent.includes('deferRenderingDuringRefresh = true;')) {
  console.log('  ✅ Flag set during refresh');
} else {
  console.log('  ❌ Flag not set during refresh');
  allPassed = false;
}

// Test 2: Check for IntersectionObserver
console.log('\nTest 2: Lazy image loading');
if (scriptContent.includes('new IntersectionObserver')) {
  console.log('  ✅ IntersectionObserver created');
} else {
  console.log('  ❌ IntersectionObserver not found');
  allPassed = false;
}

if (scriptContent.includes('setupImageObserver')) {
  console.log('  ✅ setupImageObserver function exists');
} else {
  console.log('  ❌ setupImageObserver function missing');
  allPassed = false;
}

if (scriptContent.includes('observer.observe(img)')) {
  console.log('  ✅ Observer attached to images');
} else {
  console.log('  ❌ Observer not attached to images');
  allPassed = false;
}

// Test 3: Check for cache eviction
console.log('\nTest 3: Image cache eviction');
if (scriptContent.includes('IMAGE_CACHE_SOFT_LIMIT')) {
  console.log('  ✅ Soft limit constant defined');
} else {
  console.log('  ❌ Soft limit constant missing');
  allPassed = false;
}

if (scriptContent.includes('lastAccessed')) {
  console.log('  ✅ LRU tracking with lastAccessed');
} else {
  console.log('  ❌ LRU tracking missing');
  allPassed = false;
}

if (scriptContent.match(/setInterval.*300000/s)) {
  console.log('  ✅ Periodic cleanup scheduled');
} else {
  console.log('  ❌ Periodic cleanup not found');
  allPassed = false;
}

// Test 4: Check version bump (now 4.4.1+)
console.log('\nTest 4: Version update');
if (scriptContent.includes('// @version      4.4.') && (scriptContent.includes('4.4.0') || scriptContent.includes('4.4.1'))) {
  console.log('  ✅ Version is 4.4.x');
} else {
  console.log('  ❌ Version not updated');
  allPassed = false;
}

// Test 5: Check log types added
console.log('\nTest 5: New log types');
if (scriptContent.includes("'IMAGE_CACHE_EVICTED'")) {
  console.log('  ✅ IMAGE_CACHE_EVICTED log type added');
} else {
  console.log('  ❌ IMAGE_CACHE_EVICTED log type missing');
  allPassed = false;
}

if (scriptContent.includes("'TIMELINE_RENDERED'")) {
  console.log('  ✅ TIMELINE_RENDERED log type added');
} else {
  console.log('  ❌ TIMELINE_RENDERED log type missing');
  allPassed = false;
}

// Test 6: Verify no breaking changes
console.log('\nTest 6: Critical functions preserved');
const criticalFunctions = [
  'renderTimeline',
  'processOneUid',
  'downloadImage',
  'getImagesCache',
  'refreshAll'
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

// Summary
console.log('\n' + '='.repeat(50));
if (allPassed) {
  console.log('✅ All tests passed! v4.4.0 changes validated.');
  process.exit(0);
} else {
  console.log('❌ Some tests failed. Review changes.');
  process.exit(1);
}
