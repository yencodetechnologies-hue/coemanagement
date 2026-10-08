const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir).forEach(file => {
    const filepath = path.join(dir, file);
    if (file === 'node_modules' || file === '.git' || file === 'check-strict.js') return;
    
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

// Strict case-sensitive file existence check for Windows/Linux
function strictFileExists(targetPath) {
  if (!fs.existsSync(targetPath)) return false;
  
  const dir = path.dirname(targetPath);
  const baseName = path.basename(targetPath);
  const filesInDir = fs.readdirSync(dir);
  
  // Check if the exact filename and casing exist in the directory
  return filesInDir.includes(baseName);
}

let errors = 0;
let totalChecked = 0;

console.log('🔍 Running strict case-sensitivity check on backend imports...\n');

walkDir(__dirname, filepath => {
  const rawContent = fs.readFileSync(filepath, 'utf8');
  const content = removeComments(rawContent);
  
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
      
      let matchedPath = '';
      let existsStrictly = false;

      const potentialFiles = [
        targetPath,
        targetPath + '.js',
        path.join(targetPath, 'index.js')
      ];

      for (const p of potentialFiles) {
        if (strictFileExists(p)) {
          existsStrictly = true;
          matchedPath = p;
          break;
        }
      }

      if (!existsStrictly) {
        console.error(`❌ MISTAKE / BROKEN IMPORT FOUND:`);
        console.error(`   File:    ${path.relative(__dirname, filepath)}`);
        console.error(`   Imports: "${importPath}" (File or exact case does not exist!)\n`);
        errors++;
      }
    }
  });
});

console.log(`-------------------------------------------`);
console.log(`Checked ${totalChecked} total import/require statements.`);
if (errors > 0) {
  console.error(`\n🚨 FAILURE: Found ${errors} case-sensitivity or missing file error(s)! Fix these before pushing.`);
  process.exit(1);
} else {
  console.log('\n✅ SUCCESS! Every single file and capitalization matches 100% strictly.');
}