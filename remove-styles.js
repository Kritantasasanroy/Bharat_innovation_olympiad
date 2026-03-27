const fs = require('fs');
const path = require('path');

function processDirectory(dirPath, globalCssPath) {
    let globalCssAppend = '';
    
    function walk(dir) {
        const files = fs.readdirSync(dir);
        for (const file of files) {
            const fullPath = path.join(dir, file);
            if (fs.statSync(fullPath).isDirectory()) {
                walk(fullPath);
            } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
                let content = fs.readFileSync(fullPath, 'utf8');
                
                // Regex to match <style jsx>{` ... `}</style>
                const styleRegex = /<style\s+jsx>\s*\{\s*`([\s\S]*?)`\s*\}\s*<\/style>/g;
                let match;
                let modified = false;
                
                while ((match = styleRegex.exec(content)) !== null) {
                    globalCssAppend += `\n/* Extracted from ${path.basename(fullPath)} */\n` + match[1];
                    modified = true;
                }
                
                if (modified) {
                    content = content.replace(styleRegex, '');
                    fs.writeFileSync(fullPath, content, 'utf8');
                    console.log(`✅ Removed <style jsx> from ${fullPath}`);
                }
            }
        }
    }
    
    walk(dirPath);
    
    if (globalCssAppend.trim()) {
        fs.appendFileSync(globalCssPath, globalCssAppend, 'utf8');
        console.log(`📝 Appended extracted CSS to ${globalCssPath}`);
    } else {
        console.log(`⏭️ No <style jsx> found in ${dirPath}`);
    }
}

const frontendDir = path.join(__dirname, 'frontend', 'src');
const frontendCss = path.join(frontendDir, 'app', 'globals.css');

const adminDir = path.join(__dirname, 'admin-frontend', 'src');
const adminCss = path.join(adminDir, 'app', 'globals.css');

console.log('--- Processing Frontend ---');
processDirectory(frontendDir, frontendCss);

console.log('\n--- Processing Admin Frontend ---');
processDirectory(adminDir, adminCss);
