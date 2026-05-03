/**
 * This script force-fixes all datetime("now") → datetime('now') in server.js
 * and verifies the result by printing all datetime lines.
 */
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'server.js');
let content = fs.readFileSync(filePath, 'utf8');

// Show what we're working with - hex dump of the problem area
const lines = content.split('\n');
let fixed = 0;
const newLines = lines.map((line, idx) => {
  if (line.includes('datetime') && (line.includes('datetime("now")') || line.includes("datetime('now')"))) {
    const original = line;
    // Replace any variant of datetime("now") with datetime('now')
    const newLine = line.replace(/datetime\(["']now["']\)/g, "datetime('now')");
    if (newLine !== original) {
      console.log(`Fixed line ${idx + 1}`);
      fixed++;
    }
    return newLine;
  }
  return line;
});

content = newLines.join('\n');
fs.writeFileSync(filePath, content, 'utf8');

console.log(`\nTotal fixes: ${fixed}`);
console.log('\nAll datetime lines:');
content.split('\n').forEach((line, i) => {
  if (line.includes('datetime')) {
    console.log(`  Line ${i+1}: ${line.trim()}`);
  }
});

// Check if any bad ones remain
const hasBad = content.includes('datetime("now")');
console.log('\nStatus:', hasBad ? '❌ STILL HAS DOUBLE QUOTES' : '✅ ALL FIXED');
