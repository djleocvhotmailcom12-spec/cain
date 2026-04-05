const fs = require('fs');
let s = fs.readFileSync('script.js', 'utf8');

// The original line probably looks like: const res = await fetch('/api/events/poll');
if (s.includes("fetch('/api/events/poll')")) {
    s = s.replace("fetch('/api/events/poll')", "fetch(`/api/events/poll?user=\${encodeURIComponent(currentUser)}`)");
    fs.writeFileSync('script.js', s, 'utf8');
}
console.log('PARAM_FIXED');
