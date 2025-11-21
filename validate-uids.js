#!/usr/bin/env node

// UID Validation and Health Analysis Script
// Run with: node validate-uids.js

// Sample problematic UIDs to test with
const sampleUids = [
  "1052404565", // Valid (existing)
  "9999999999", // Valid format but likely invalid user
  "12345",        // Too short
  "1234567890123", // Too long
  "abc123",       // Contains letters
  "",             // Empty
  "null",          // Null string
  undefined,      // Undefined
  " 1052404565",   // Duplicate to test deduplication
];

function validateUid(uid) {
  if (!uid) return { valid: false, reason: 'Empty or null' };
  
  // Basic validation: numeric and reasonable length
  if (!/^\d{6,11}$/.test(uid)) {
    return { valid: false, reason: 'Invalid format - must be 6-11 digits' };
  }
  
  return { valid: true, reason: 'Valid format' };
}

function analyzeUids(uids) {
  console.log('🔍 UID Validation Analysis');
  console.log('============================');
  
  const results = {
    total: uids.length,
    valid: 0,
    invalid: 0,
    duplicates: [],
    issues: []
  };
  
  const seen = new Set();
  
  uids.forEach((uid, index) => {
    if (typeof uid !== 'string') {
      results.invalid++;
      results.issues.push({
        uid,
        index,
        type: typeof uid,
        reason: 'Not a string'
      });
      return;
    }
    
    const validation = validateUid(uid);
    
    if (!validation.valid) {
      results.invalid++;
      results.issues.push({
        uid,
        index,
        reason: validation.reason
      });
    } else {
      results.valid++;
    }
    
    if (seen.has(uid)) {
      results.duplicates.push(uid);
    } else {
      seen.add(uid);
    }
  });
  
  // Results
  console.log(`\n📊 Summary:`);
  console.log(`Total UIDs: ${results.total}`);
  console.log(`Valid format: ${results.valid}`);
  console.log(`Invalid format: ${results.invalid}`);
  console.log(`Duplicates: ${results.duplicates.length}`);
  
  if (results.issues.length > 0) {
    console.log(`\n❌ Issues Found:`);
    results.issues.forEach(issue => {
      console.log(`  Index ${issue.index}: "${issue.uid}" - ${issue.reason}`);
    });
  }
  
  if (results.duplicates.length > 0) {
    console.log(`\n🔄 Duplicate UIDs:`);
    results.duplicates.forEach(uid => {
      console.log(`  "${uid}" appears multiple times`);
    });
  }
  
  return results;
}

function generateHealthReport(uids) {
  console.log('\n🏥 Health Report Recommendations:');
  console.log('================================');
  
  const results = analyzeUids(uids);
  
  console.log('\n📋 Recommended Actions:');
  
  if (results.invalid > 0) {
    console.log(`1. Remove ${results.invalid} invalid UIDs`);
    }
  
  if (results.duplicates.length > 0) {
    console.log(`2. Remove ${results.duplicates.length} duplicate UIDs`);
  }
  
  console.log('3. Run validation on remaining UIDs');
  console.log('4. Monitor UID health in dashboard');
  console.log('5. Export health data for backup');
  
  console.log('\n🔧 Commands for userscript-improved.js:');
  console.log('- Use "Validate All UIDs" button in dashboard');
  console.log('- Use "Export UID Health" to backup data');
  console.log('- Use "Manage UIDs" to see problematic accounts');
}

// Test with sample data
console.log('Testing with sample UIDs...');
generateHealthReport(sampleUids);

// Test with actual UIDs from userscript
const actualUids = [
  "1052404565", "1080201461", "1147851595", "1222135407", "1344386244",
  "1393477857", "1401902522", "1444865141", "1540883530", "1610356014",
  "1644225642", "1645776681", "1652595727", "1663311732", "1670659923",
  "1672283232", "1695350712", "1698243607", "1701816363", "1702208197",
  "1707465002", "1712462832", "1714261292", "1743951792", "1746222377",
  "1752928750", "1764452651", "1768354461", "1769173661", "1791808013",
  "1805789162", "1826017297", "1873999810", "1884548883", "1891727991",
  "1899123755", "1917885853", "1928552571", "1965945984", "1971929971",
  "1980508763", "1989660417", "2018499075", "2031030981", "2032999983",
  "2094390301", "2123664205", "2155926845", "2173291530", "2189745412",
  "2203034695", "2218472014", "2269761153", "2389742313", "2436298991",
  "2535898204", "2580392892", "2588011444", "2615626492", "2681847263",
  "2775449205", "2810904414", "3010420480", "3083216765", "3103768347",
  "3130653487", "3177420971", "3194061481", "3199840270", "3218434004",
  "3317930660", "3699880234", "3978383590", "5597705779", "5628021879",
  "5655200015", "5690608944", "5750138957", "5835994414", "5843992636",
  "5991211490", "6069805893", "6147017411", "6254321002", "6431633590",
  "6557248346", "6723106704", "6755891821", "6831021550", "6850068687",
  "6851371740", "7163959006", "7378646514", "7384845399", "7393169813",
  "7540852197", "7745842993", "7797020453", "7825510109"
];

console.log('\n\nTesting with actual UIDs from userscript...');
generateHealthReport(actualUids);