const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const outDir = path.join(rootDir, 'out');
const readmeSrc = path.join(rootDir, 'docs', 'README.vsix.md');
const readmeDest = path.join(rootDir, 'README.md');

console.log('Running functionality of vscode:prepublish...');

// 1. Clean out dir
if (fs.existsSync(outDir)) {
    console.log(`Cleaning ${outDir}...`);
    fs.rmSync(outDir, { recursive: true, force: true });
}

// 2. Build
console.log('Running esbuild...');
try {
    execSync('npm run esbuild-base -- --minify', { cwd: rootDir, stdio: 'inherit' });
} catch (e) {
    console.error('Build failed.');
    process.exit(1);
}

// 3. Copy README
if (fs.existsSync(readmeSrc)) {
    console.log(`Copying ${readmeSrc} to ${readmeDest}...`);
    fs.copyFileSync(readmeSrc, readmeDest);
} else {
    console.warn(`Warning: ${readmeSrc} not found.`);
}
