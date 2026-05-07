const db = require('better-sqlite3')('./evcharging.db');
const rows = db.prepare("SELECT name, operator FROM stations WHERE address LIKE '%Bhopal%' ORDER BY name").all();
console.log('Bhopal stations:', rows.length);
rows.forEach(r => console.log(' -', r.name, '|', r.operator));
db.close();
