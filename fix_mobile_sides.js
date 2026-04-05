const fs = require('fs');
let css = fs.readFileSync('index.css', 'utf8');
// Fix width: 100vw; which pushes edges out
css = css.replace(/width: 100vw;/g, 'width: 100%; box-sizing: border-box;');
// Enforce horizontal boundary on html, body in mobile
css = css.replace(/html, body \{/g, 'html, body {\\n        width: 100%;\\n        overflow-x: hidden;\\n        box-sizing: border-box;');
fs.writeFileSync('index.css', css, 'utf8');
console.log('Mobile sides fixed');
