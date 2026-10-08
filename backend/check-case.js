const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir).forEach(file => {
    const filepath = path.join(dir, file);
    if (file === 'node_modules' || file === '.git' || file === 'check-all-casing.js') return;
    
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

// Strict case-sensitive file existence check across all OSs
function strictFileExists(targetPath) {
  if (!fs.existsSync(targetPath)) return false;
  const dir = path.dirname(targetPath);
  const baseName = path.basename(targetPath);
  const files = fs.readdirSync(dir);
  return files.includes(baseName);
}

let errors = 0;
let totalChecked = 0;

console.log('🔍 Scanning ALL backend files, controllers, routes, and models for case mismatches...\n');

walkDir(__dirname, filepath => {
  const rawContent = fs.readFileSync(filepath, 'utf8');
  const content = removeComments(rawContent);
  
  // Match require(...) and import ... from ...
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

      let existsStrictly = false;
      const potentialFiles = [
        targetPath,
        targetPath + '.js',
        path.join(targetPath, 'index.js')
      ];

      for (const p of potentialFiles) {
        if (strictFileExists(p)) {
          existsStrictly = true;
          break;
        }
      }

      if (!existsStrictly) {
        console.error(`❌ CASE MISMATCH or MISSING FILE:`);
        console.error(`   In File: ${path.relative(__dirname, filepath)}`);
        console.error(`   Requires: "${importPath}" (Casing does not match physical file on disk!)\n`);
        errors++;
      }
    }
  });
});

console.log('---------------------------------------------------');
console.log(`Checked ${totalChecked} total import/require statements across all folders.`);

if (errors > 0) {
  console.error(`\n🚨 FAILURE: Found ${errors} case-sensitivity or missing file error(s). Fix these before deploying!`);
  process.exit(1);
} else {
  console.log('\n✅ SUCCESS! Every single controller, route, model, and script file matches its casing 100% perfectly.');
}