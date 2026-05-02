const fs = require('fs');
let c = fs.readFileSync('s:/EV MAN/server.js', 'utf8');
// The broken line has single quotes around the SQL which contains single quotes
const bad = `db.prepare('UPDATE google_users SET last_login=datetime('now'),name=?,picture=? WHERE google_id=?').run(name, picture || null, google_id);`;
const good = `db.prepare("UPDATE google_users SET last_login=datetime('now'),name=?,picture=? WHERE google_id=?").run(name, picture || null, google_id);`;
if (c.includes(bad)) {
  c = c.replace(bad, good);
  fs.writeFileSync('s:/EV MAN/server.js', c);
  console.log('Fixed!');
} else {
  console.log('Pattern not found');
  // Show line 216 vicinity
  const lines = c.split('\n');
  console.log('Line 214-218:', lines.slice(213, 218).join('\n'));
}
