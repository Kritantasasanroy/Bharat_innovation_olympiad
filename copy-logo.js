const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, 'Lemon-Ideas-Final-Logo.png');
const destDir = path.join(__dirname, 'frontend', 'public');
const dest = path.join(destDir, 'lemon-ideas-logo.png');
if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);
console.log('Logo copied to', dest);
