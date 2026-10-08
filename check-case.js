const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(file => {
    const filepath = path.join(dir, file);
    if (fs.statSync(filepath).isDirectory()) {
      walkDir(filepath, callback);
    } else if (filepath.endsWith('.js')) {
      callback(filepath);
    }
  });
}

let errors = 0;
walkDir(path.join(__dirname, 'backend'), filepath => {
  const content = fs.readFileSync(filepath, 'utf8');
  // Match require('...') or require("...")
  const regex = /require\(['"](\..*?)['"]\)/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const importPath = match[1];
    const currentDir = path.dirname(filepath);
    // Resolve target file (check with and without .js)
    let targetPath = path.resolve(currentDir, importPath);
    if (!targetPath.endsWith('.js')) targetPath += '.js';

    if (!fs.existsSync(targetPath)) {
      console.error(`❌ Case Mismatch or Missing File in:\n   ${filepath}\n   Imports: "${importPath}"\n`);
      errors++;
    }
  }
});

if (errors > 0) {
  console.error(`\nFound ${errors} case-sensitivity or missing file errors!`);
  process.exit(1);
} else {
  console.log('✅ All backend require paths match case-sensitivity correctly!');
}