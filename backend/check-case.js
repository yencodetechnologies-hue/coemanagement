const fs = require('fs');
const path = pathModule = require('path');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(file => {
    const filepath = path.join(dir, file);
    if (file === 'node_modules' || file === '.git' || file === 'check-case.js') return;
    
    if (fs.statSync(filepath).isDirectory()) {
      walkDir(filepath, callback);
    } else if (filepath.endsWith('.js')) {
      callback(filepath);
    }
  });
}

function removeComments(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*/g, '');
}

let errors = 0;
let totalChecked = 0;

walkDir(__dirname, filepath => {
  const rawContent = fs.readFileSync(filepath, 'utf8');
  const content = removeComments(rawContent);
  
  // Matches both require('path') and import ... from 'path'
  const patterns = [
    /require\(['"](\..*?)['"]\)/g,
    /import\s+[\s\S]*?\s+from\s+['"](\..*?)['"]/g,
    /import\(['"](\..*?)['"]\)/g
  ];

  patterns.forEach(regex => {
    let match;
    while ((match = regex.exec(content)) !== null) {
      totalChecked++;
      const importPath = match[1];
      const currentDir = path.dirname(filepath);
      let targetPath = path.resolve(currentDir, importPath);
      if (!targetPath.endsWith('.js') && !fs.existsSync(targetPath)) {
        targetPath += '.js';
      }

      if (!fs.existsSync(targetPath)) {
        console.error(`❌ Missing or Case-Mismatched File:\n   In File: ${path.relative(__dirname, filepath)}\n   Imports: "${importPath}"\n`);
        errors++;
      }
    }
  });
});

console.log(`🔍 Scanned ${totalChecked} total import/require paths.`);
if (errors > 0) {
  console.error(`\n🚨 Found ${errors} broken or case-mismatched file references!`);
  process.exit(1);
} else {
  console.log('✅ All backend require/import paths match case-sensitivity and exist perfectly!');
}