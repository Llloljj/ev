const express = require('express');
const Database = require('better-sqlite3');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { OAuth2Client } = require('google-auth-library');

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '340559256597-kud6141s27hbjh92dr7m10ofkq9cmane.apps.googleusercontent.com';
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Database Setup ────────────────────────────────────────────────────────────
const db = new Database(path.join(__dirname, 'evcharging.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS stations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    charger_types TEXT NOT NULL,        -- JSON array: ["CCS","CHAdeMO","Type2"]
    total_slots INTEGER NOT NULL,
    available_slots INTEGER NOT NULL,
    price_per_kwh REAL NOT NULL,
    avg_wait_minutes INTEGER NOT NULL,
    amenities TEXT NOT NULL,            -- JSON array: ["Restroom","WiFi","Cafe"]
    rating REAL NOT NULL,
    operator TEXT NOT NULL,
    power_kw REAL NOT NULL,
    is_fast_charger INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT,
    vehicle_model TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    station_id TEXT NOT NULL,
    slot_time TEXT NOT NULL,
    duration_hours REAL NOT NULL DEFAULT 1,
    charger_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'confirmed', -- confirmed | cancelled | completed
    amount REAL NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (station_id) REFERENCES stations(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS google_users (
    id TEXT PRIMARY KEY,
    google_id TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    picture TEXT,
    vehicle_model TEXT,
    years_used INTEGER DEFAULT 0,
    battery_capacity_kwh REAL,
    degradation_pct REAL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_login TEXT
  );

  CREATE TABLE IF NOT EXISTS user_sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES google_users(id)
  );
`);

// ─── Seed Demo Data ────────────────────────────────────────────────────────────
const seedStations = () => {
  const count = db.prepare('SELECT COUNT(*) as c FROM stations').get();
  if (count.c > 0) return;

  const stations = [
    {
      id: uuidv4(), name: 'EV PATH Hub - Connaught Place', address: 'Connaught Place, New Delhi, 110001',
      latitude: 28.6315, longitude: 77.2167, charger_types: JSON.stringify(['CCS2', 'Type2', 'CHAdeMO']),
      total_slots: 8, available_slots: 5, price_per_kwh: 12.5, avg_wait_minutes: 10,
      amenities: JSON.stringify(['Restroom', 'WiFi', 'Cafe', 'Parking']), rating: 4.7,
      operator: 'Tata Power EV', power_kw: 150, is_fast_charger: 1
    },
    {
      id: uuidv4(), name: 'GreenCharge - Bandra West', address: 'Linking Road, Bandra West, Mumbai 400050',
      latitude: 19.0596, longitude: 72.8295, charger_types: JSON.stringify(['CCS2', 'Type2']),
      total_slots: 6, available_slots: 2, price_per_kwh: 14.0, avg_wait_minutes: 25,
      amenities: JSON.stringify(['Restroom', 'Shopping Mall']), rating: 4.2,
      operator: 'BPCL EV', power_kw: 60, is_fast_charger: 0
    },
    {
      id: uuidv4(), name: 'SpeedCharge - Koramangala', address: '5th Block, Koramangala, Bengaluru 560095',
      latitude: 12.9352, longitude: 77.6245, charger_types: JSON.stringify(['CCS2', 'CHAdeMO']),
      total_slots: 10, available_slots: 8, price_per_kwh: 11.0, avg_wait_minutes: 5,
      amenities: JSON.stringify(['Restroom', 'WiFi', 'Snacks', 'Lounge']), rating: 4.9,
      operator: 'Ather Grid', power_kw: 180, is_fast_charger: 1
    },
    {
      id: uuidv4(), name: 'EcoStation - Anna Nagar', address: 'Anna Nagar, Chennai 600040',
      latitude: 13.0878, longitude: 80.2100, charger_types: JSON.stringify(['Type2', 'CCS2']),
      total_slots: 5, available_slots: 3, price_per_kwh: 10.5, avg_wait_minutes: 15,
      amenities: JSON.stringify(['Restroom', 'Parking']), rating: 4.0,
      operator: 'TANGEDCO EV', power_kw: 50, is_fast_charger: 0
    },
    {
      id: uuidv4(), name: 'MetroCharge - Salt Lake City', address: 'Sector V, Salt Lake City, Kolkata 700091',
      latitude: 22.5726, longitude: 88.4320, charger_types: JSON.stringify(['CCS2', 'Type2']),
      total_slots: 7, available_slots: 0, price_per_kwh: 9.5, avg_wait_minutes: 45,
      amenities: JSON.stringify(['Restroom', 'Food Court']), rating: 3.8,
      operator: 'CESC EV', power_kw: 60, is_fast_charger: 0
    },
    {
      id: uuidv4(), name: 'TurboVolt - Cyber City', address: 'DLF Cyber City, Gurugram 122002',
      latitude: 28.4947, longitude: 77.0880, charger_types: JSON.stringify(['CCS2', 'CHAdeMO', 'Type2', 'GB/T']),
      total_slots: 12, available_slots: 9, price_per_kwh: 13.0, avg_wait_minutes: 5,
      amenities: JSON.stringify(['Restroom', 'WiFi', 'Cafe', 'Gym', 'Concierge']), rating: 4.8,
      operator: 'MG Motors EV Hub', power_kw: 240, is_fast_charger: 1
    },
    {
      id: uuidv4(), name: 'NexCharge - Wakad', address: 'Wakad, Pune 411057',
      latitude: 18.5980, longitude: 73.7598, charger_types: JSON.stringify(['CCS2', 'Type2']),
      total_slots: 4, available_slots: 4, price_per_kwh: 10.0, avg_wait_minutes: 0,
      amenities: JSON.stringify(['Parking', 'WiFi']), rating: 4.5,
      operator: 'Charge Zone', power_kw: 100, is_fast_charger: 1
    },
    {
      id: uuidv4(), name: 'ZapPoint - Jubilee Hills', address: 'Jubilee Hills Road No. 36, Hyderabad 500033',
      latitude: 17.4322, longitude: 78.4075, charger_types: JSON.stringify(['CCS2', 'Type2']),
      total_slots: 6, available_slots: 1, price_per_kwh: 11.5, avg_wait_minutes: 30,
      amenities: JSON.stringify(['Restroom', 'Shopping']), rating: 4.1,
      operator: 'TSREDCO EV', power_kw: 60, is_fast_charger: 0
    },
    {
      id: uuidv4(), name: 'FlashCharge - Viman Nagar', address: 'Viman Nagar, Pune 411014',
      latitude: 18.5679, longitude: 73.9143, charger_types: JSON.stringify(['CHAdeMO', 'CCS2', 'Type2']),
      total_slots: 8, available_slots: 6, price_per_kwh: 12.0, avg_wait_minutes: 8,
      amenities: JSON.stringify(['Restroom', 'WiFi', 'Lounge', 'EV Helpdesk']), rating: 4.6,
      operator: 'Tata Power EV', power_kw: 150, is_fast_charger: 1
    },
    {
      id: uuidv4(), name: 'CleanEnergy Hub - Whitefield', address: 'ITPL Road, Whitefield, Bengaluru 560066',
      latitude: 12.9783, longitude: 77.7408, charger_types: JSON.stringify(['CCS2', 'Type2']),
      total_slots: 15, available_slots: 11, price_per_kwh: 11.5, avg_wait_minutes: 5,
      amenities: JSON.stringify(['Restroom', 'WiFi', 'Food Court', 'Parking', 'Security']), rating: 4.7,
      operator: 'Ather Grid', power_kw: 200, is_fast_charger: 1
    }
  ];

  const insert = db.prepare(`
    INSERT INTO stations (id,name,address,latitude,longitude,charger_types,total_slots,
      available_slots,price_per_kwh,avg_wait_minutes,amenities,rating,operator,power_kw,is_fast_charger)
    VALUES (@id,@name,@address,@latitude,@longitude,@charger_types,@total_slots,
      @available_slots,@price_per_kwh,@avg_wait_minutes,@amenities,@rating,@operator,@power_kw,@is_fast_charger)
  `);
  stations.forEach(s => insert.run(s));
  console.log(`✅ Seeded ${stations.length} EV charging stations`);
};

const seedUsers = () => {
  const count = db.prepare('SELECT COUNT(*) as c FROM users').get();
  if (count.c > 0) return;
  const insert = db.prepare(`INSERT INTO users (id,name,email,phone,vehicle_model) VALUES (?,?,?,?,?)`);
  insert.run('user-demo-1', 'Arjun Sharma', 'arjun@evdemo.in', '9876543210', 'Tata Nexon EV');
  insert.run('user-demo-2', 'Priya Patel', 'priya@evdemo.in', '9123456789', 'MG ZS EV');
  console.log('✅ Seeded demo users');
};

seedStations();
seedUsers();

// ─── Haversine Distance (km) ───────────────────────────────────────────────────
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Auth Routes ───────────────────────────────────────────────────────────────

// POST /api/auth/google — Verify Google ID token, upsert user, create session
app.post('/api/auth/google', async (req, res) => {
  const { credential } = req.body;
  if (!credential) return res.status(400).json({ success: false, message: 'No credential provided' });
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID || undefined,
    });
    const payload = ticket.getPayload();
    const { sub: google_id, email, name, picture } = payload;

    let user = db.prepare('SELECT * FROM google_users WHERE google_id=?').get(google_id);
    if (!user) {
      const id = uuidv4();
      db.prepare('INSERT INTO google_users (id,google_id,email,name,picture) VALUES (?,?,?,?,?)').run(id, google_id, email, name, picture || null);
      user = db.prepare('SELECT * FROM google_users WHERE id=?').get(id);
    } else {
      db.prepare("UPDATE google_users SET last_login=datetime('now'),name=?,picture=? WHERE google_id=?").run(name, picture || null, google_id);
      user = db.prepare('SELECT * FROM google_users WHERE google_id=?').get(google_id);
    }

    const token = uuidv4();
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare('INSERT INTO user_sessions (token,user_id,expires_at) VALUES (?,?,?)').run(token, user.id, expires);

    console.log(`✅ Google login: ${email}`);
    res.json({ success: true, token, user });
  } catch (e) {
    console.error('Google auth error:', e.message);
    res.status(401).json({ success: false, message: 'Invalid Google token: ' + e.message });
  }
});

// GET /auth/callback — OAuth2 redirect callback (exchanges code for user info)
app.get('/auth/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error || !code) {
    return res.redirect('/login.html?error=' + encodeURIComponent(error || 'no_code'));
  }

  const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
  const redirectUri = (process.env.RENDER_EXTERNAL_URL || 'http://localhost:' + PORT) + '/auth/callback';

  try {
    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      })
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.id_token) throw new Error('No id_token: ' + JSON.stringify(tokenData));

    // Verify the id_token
    const ticket = await googleClient.verifyIdToken({
      idToken: tokenData.id_token,
      audience: GOOGLE_CLIENT_ID
    });
    const payload = ticket.getPayload();
    const { sub: google_id, email, name, picture } = payload;

    // Upsert user
    let user = db.prepare('SELECT * FROM google_users WHERE google_id=?').get(google_id);
    if (!user) {
      const id = uuidv4();
      db.prepare('INSERT INTO google_users (id,google_id,email,name,picture) VALUES (?,?,?,?,?)').run(id, google_id, email, name, picture || null);
      user = db.prepare('SELECT * FROM google_users WHERE id=?').get(id);
    } else {
      db.prepare("UPDATE google_users SET last_login=datetime('now'),name=?,picture=? WHERE google_id=?").run(name, picture || null, google_id);
      user = db.prepare('SELECT * FROM google_users WHERE google_id=?').get(google_id);
    }

    // Create session
    const sessionToken = uuidv4();
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare('INSERT INTO user_sessions (token,user_id,expires_at) VALUES (?,?,?)').run(sessionToken, user.id, expires);

    console.log(`✅ Google OAuth callback: ${email}`);

    // Redirect to login page with token; JS will store it and route appropriately
    const needsVehicle = !user.vehicle_model;
    res.redirect(`/login.html?token=${sessionToken}&step=${needsVehicle ? 2 : 'done'}`);
  } catch (e) {
    console.error('OAuth callback error:', e.message);
    res.redirect('/login.html?error=' + encodeURIComponent('Auth failed: ' + e.message));
  }
});

// GET /api/auth/me — Get current user by session token
app.get('/api/auth/me', (req, res) => {
  const token = req.headers['x-session-token'];
  if (!token) return res.status(401).json({ success: false, message: 'No token' });
  const session = db.prepare("SELECT * FROM user_sessions WHERE token=? AND expires_at > datetime('now')").get(token);
  if (!session) return res.status(401).json({ success: false, message: 'Session expired' });
  const user = db.prepare('SELECT * FROM google_users WHERE id=?').get(session.user_id);
  res.json({ success: true, user });
});

// PATCH /api/auth/vehicle — Save vehicle model + degradation calc
app.patch('/api/auth/vehicle', (req, res) => {
  const token = req.headers['x-session-token'];
  if (!token) return res.status(401).json({ success: false });
  const session = db.prepare("SELECT * FROM user_sessions WHERE token=? AND expires_at > datetime('now')").get(token);
  if (!session) return res.status(401).json({ success: false, message: 'Session expired' });

  const { vehicle_model, years_used, battery_capacity_kwh } = req.body;
  // Industry avg Li-ion degradation: ~2.3% per year, capped at 30%
  const degradation_pct = Math.min((parseInt(years_used) || 0) * 2.3, 30);
  const effective_capacity = (parseFloat(battery_capacity_kwh) || 0) * (1 - degradation_pct / 100);

  db.prepare('UPDATE google_users SET vehicle_model=?,years_used=?,battery_capacity_kwh=?,degradation_pct=? WHERE id=?')
    .run(vehicle_model || null, parseInt(years_used) || 0, parseFloat(battery_capacity_kwh) || null, degradation_pct, session.user_id);

  const user = db.prepare('SELECT * FROM google_users WHERE id=?').get(session.user_id);
  res.json({ success: true, user, degradation_pct, effective_capacity: Math.round(effective_capacity * 10) / 10 });
});

// POST /api/auth/logout
app.post('/api/auth/logout', (req, res) => {
  const token = req.headers['x-session-token'];
  if (token) db.prepare('DELETE FROM user_sessions WHERE token=?').run(token);
  res.json({ success: true });
});

// ─── API Routes ────────────────────────────────────────────────────────────────

// GET /api/stations?lat=&lng=&radius=&charger_type=&fast_only=&available_only=
app.get('/api/stations', (req, res) => {
  const { lat, lng, radius = 50, charger_type, fast_only, available_only } = req.query;
  let stations = db.prepare('SELECT * FROM stations').all();

  stations = stations.map(s => ({
    ...s,
    charger_types: JSON.parse(s.charger_types),
    amenities: JSON.parse(s.amenities),
    is_fast_charger: s.is_fast_charger === 1,
    distance: lat && lng ? haversine(parseFloat(lat), parseFloat(lng), s.latitude, s.longitude) : null
  }));

  if (lat && lng) {
    stations = stations.filter(s => s.distance <= parseFloat(radius));
    stations.sort((a, b) => a.distance - b.distance);
  }

  if (charger_type) stations = stations.filter(s => s.charger_types.includes(charger_type));
  if (fast_only === 'true') stations = stations.filter(s => s.is_fast_charger);
  if (available_only === 'true') stations = stations.filter(s => s.available_slots > 0);

  res.json({ success: true, count: stations.length, stations });
});

// GET /api/stations/:id
app.get('/api/stations/:id', (req, res) => {
  const s = db.prepare('SELECT * FROM stations WHERE id=?').get(req.params.id);
  if (!s) return res.status(404).json({ success: false, message: 'Station not found' });
  res.json({
    success: true,
    station: {
      ...s,
      charger_types: JSON.parse(s.charger_types),
      amenities: JSON.parse(s.amenities),
      is_fast_charger: s.is_fast_charger === 1
    }
  });
});

// GET /api/stations/:id/slots?date=
app.get('/api/stations/:id/slots', (req, res) => {
  const { date } = req.query;
  const targetDate = date || new Date().toISOString().split('T')[0];
  const station = db.prepare('SELECT * FROM stations WHERE id=?').get(req.params.id);
  if (!station) return res.status(404).json({ success: false, message: 'Station not found' });

  const bookedSlots = db.prepare(`
    SELECT slot_time FROM bookings
    WHERE station_id=? AND date(slot_time)=? AND status='confirmed'
  `).all(req.params.id, targetDate).map(r => r.slot_time);

  // Generate hourly slots 06:00 - 22:00
  const slots = [];
  for (let h = 6; h <= 22; h++) {
    const timeStr = `${targetDate}T${String(h).padStart(2, '0')}:00:00`;
    const booked = bookedSlots.filter(s => s.startsWith(timeStr)).length;
    slots.push({
      time: timeStr,
      display: `${String(h).padStart(2, '0')}:00`,
      available: Math.max(0, station.total_slots - booked),
      total: station.total_slots,
      is_peak: (h >= 8 && h <= 10) || (h >= 17 && h <= 20)
    });
  }
  res.json({ success: true, date: targetDate, slots });
});

// POST /api/bookings
app.post('/api/bookings', (req, res) => {
  const { user_id, station_id, slot_time, duration_hours = 1, charger_type } = req.body;
  if (!user_id || !station_id || !slot_time || !charger_type)
    return res.status(400).json({ success: false, message: 'Missing required fields' });

  const station = db.prepare('SELECT * FROM stations WHERE id=?').get(station_id);
  if (!station) return res.status(404).json({ success: false, message: 'Station not found' });

  const date = slot_time.split('T')[0];
  const existingBookings = db.prepare(`
    SELECT COUNT(*) as c FROM bookings
    WHERE station_id=? AND slot_time=? AND status='confirmed'
  `).get(station_id, slot_time);

  if (existingBookings.c >= station.total_slots)
    return res.status(409).json({ success: false, message: 'Slot fully booked' });

  const amount = station.price_per_kwh * 7.4 * duration_hours; // ~7.4 kWh avg per hour
  const booking = {
    id: uuidv4(),
    user_id, station_id, slot_time,
    duration_hours: parseFloat(duration_hours),
    charger_type,
    status: 'confirmed',
    amount: Math.round(amount * 100) / 100
  };

  db.prepare(`
    INSERT INTO bookings (id,user_id,station_id,slot_time,duration_hours,charger_type,status,amount)
    VALUES (@id,@user_id,@station_id,@slot_time,@duration_hours,@charger_type,@status,@amount)
  `).run(booking);

  // Update available_slots
  db.prepare('UPDATE stations SET available_slots = MAX(0, available_slots - 1) WHERE id=?').run(station_id);

  res.json({ success: true, message: 'Booking confirmed!', booking });
});

// GET /api/bookings?user_id=
app.get('/api/bookings', (req, res) => {
  const { user_id } = req.query;
  const query = user_id
    ? `SELECT b.*, s.name as station_name, s.address, s.latitude, s.longitude
       FROM bookings b JOIN stations s ON b.station_id = s.id
       WHERE b.user_id=? ORDER BY b.created_at DESC`
    : `SELECT b.*, s.name as station_name FROM bookings b JOIN stations s ON b.station_id=s.id ORDER BY b.created_at DESC`;

  const bookings = user_id
    ? db.prepare(query).all(user_id)
    : db.prepare(query).all();

  res.json({ success: true, bookings });
});

// PATCH /api/bookings/:id/cancel
app.patch('/api/bookings/:id/cancel', (req, res) => {
  const booking = db.prepare('SELECT * FROM bookings WHERE id=?').get(req.params.id);
  if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
  if (booking.status === 'cancelled') return res.status(400).json({ success: false, message: 'Already cancelled' });

  db.prepare("UPDATE bookings SET status='cancelled' WHERE id=?").run(req.params.id);
  db.prepare('UPDATE stations SET available_slots = MIN(total_slots, available_slots + 1) WHERE id=?').run(booking.station_id);

  res.json({ success: true, message: 'Booking cancelled successfully' });
});

// GET /api/users/:id
app.get('/api/users/:id', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  res.json({ success: true, user });
});

// GET /api/stats - admin dashboard stats
app.get('/api/stats', (req, res) => {
  const totalStations = db.prepare('SELECT COUNT(*) as c FROM stations').get().c;
  const totalSlots = db.prepare('SELECT SUM(total_slots) as s FROM stations').get().s;
  const availableSlots = db.prepare('SELECT SUM(available_slots) as s FROM stations').get().s;
  const totalBookings = db.prepare("SELECT COUNT(*) as c FROM bookings WHERE status='confirmed'").get().c;
  const revenue = db.prepare("SELECT SUM(amount) as s FROM bookings WHERE status='confirmed'").get().s || 0;
  const popularStation = db.prepare(`
    SELECT s.name, COUNT(b.id) as cnt
    FROM bookings b JOIN stations s ON b.station_id=s.id
    WHERE b.status='confirmed'
    GROUP BY b.station_id ORDER BY cnt DESC LIMIT 1
  `).get();

  res.json({
    success: true,
    stats: {
      totalStations, totalSlots, availableSlots,
      occupancyRate: Math.round(((totalSlots - availableSlots) / totalSlots) * 100),
      totalBookings,
      revenue: Math.round(revenue),
      popularStation: popularStation ? popularStation.name : 'N/A'
    }
  });
});

// Fallback to index.html
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n⚡ EV PATH Charging Platform`);
  console.log(`🌐 Running at http://localhost:${PORT}`);
  console.log(`📊 Admin panel at http://localhost:${PORT}/admin.html\n`);
});
