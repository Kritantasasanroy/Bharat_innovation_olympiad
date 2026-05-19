const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');

const workbook = xlsx.readFile('Schools Pincodes.xlsx');
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const data = xlsx.utils.sheet_to_json(sheet);

console.log('Columns:', Object.keys(data[0] || {}));
console.log('Sample data:', data.slice(0, 3));

// Save as JSON
const outPath = path.join(__dirname, 'frontend', 'public', 'schools.json');
fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
console.log('Saved to', outPath);
