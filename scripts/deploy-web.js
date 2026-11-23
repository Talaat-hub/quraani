// Builds the web version and publishes it to the gh-pages branch (GitHub Pages: https://talaat-hub.github.io/quraani/).
// Usage: npm run deploy:web
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const run = (cmd, cwd = process.cwd()) => execSync(cmd, { cwd, stdio: 'inherit' });
const dist = path.join(__dirname, '..', 'dist');
const remote = execSync('git remote get-url origin').toString().trim();

fs.rmSync(dist, { recursive: true, force: true });
run('npx expo export -p web');
fs.copyFileSync(path.join(dist, 'index.html'), path.join(dist, '404.html')); // Pages serves 404.html for app routes
fs.writeFileSync(path.join(dist, '.nojekyll'), ''); // Jekyll would drop the _expo folder

run('git init -q -b gh-pages', dist);
run('git add -A', dist);
run('git commit -q -m "Deploy web version"', dist);
run(`git push -f ${remote} gh-pages`, dist);
