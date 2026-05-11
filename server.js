require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const path      = require('path');
const { v4: uuidv4 } = require('uuid');
const { createClient } = require('@supabase/supabase-js');
const Razorpay  = require('razorpay');
const crypto    = require('crypto');

// ─── Config ────────────────────────────────────────────────────────────────────
const SUPABASE_URL        = process.env.SUPABASE_URL        || 'https://vzurdecvrepjjgiyruwy.supabase.co';
const SUPABASE_ANON_KEY   = process.env.SUPABASE_ANON_KEY   || 'sb_publishable_wZG3ysd1_D5W_KHqxKrxxw_ZMrweJTi';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const RAZORPAY_KEY_ID     = process.env.RAZORPAY_KEY_ID     || 'rzp_test_REPLACEME';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || 'REPLACEME_SECRET';

// Admin client — bypasses RLS, server-side only
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY);

let razorpay = null;
try {
  if (RAZORPAY_KEY_ID && RAZORPAY_KEY_ID !== 'rzp_test_REPLACEME') {
    razorpay = new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET });
  } else {
    console.warn('⚠️ Razorpay keys missing. Payment simulation will bypass real Razorpay order creation.');
  }
} catch(e) {
  console.warn('⚠️ Razorpay initialization failed:', e.message);
}

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Haversine Distance (km) ───────────────────────────────────────────────────
function haversine(lat1, lon1, lat2, lon2) {
  const R    = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a    = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Auth Middleware ───────────────────────────────────────────────────────────
// Verifies Supabase JWT from x-session-token header
async function requireAuth(req, res, next) {
  const token = req.headers['x-session-token'] || (req.headers['authorization'] || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, message: 'No token' });

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.status(401).json({ success: false, message: 'Invalid or expired session' });

  req.user  = user;
  req.token = token;
  next();
}

// ─── Auth Routes ───────────────────────────────────────────────────────────────

// GET /api/auth/me — validate session token, return user + profile
app.get('/api/auth/me', async (req, res) => {
  const token = req.headers['x-session-token'] || (req.headers['authorization'] || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, message: 'No token' });

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.status(401).json({ success: false, message: 'Session expired' });

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  const { data: admin } = await supabase.from('admins').select('*').eq('user_id', user.id).single();
  res.json({ success: true, user: { ...user, ...(profile || {}), isAdmin: !!admin } });
});

// PATCH /api/auth/vehicle — save vehicle info + calculate degradation
app.patch('/api/auth/vehicle', requireAuth, async (req, res) => {
  const { vehicle_model, years_used, battery_capacity_kwh } = req.body;
  const degradation_pct  = Math.min((parseInt(years_used) || 0) * 2.3, 30);
  const effective_capacity = (parseFloat(battery_capacity_kwh) || 0) * (1 - degradation_pct / 100);

  const { data: profile, error } = await supabase
    .from('profiles')
    .update({
      vehicle_model:        vehicle_model || null,
      years_used:           parseInt(years_used) || 0,
      battery_capacity_kwh: parseFloat(battery_capacity_kwh) || null,
      degradation_pct
    })
    .eq('id', req.user.id)
    .select()
    .single();

  if (error) return res.status(500).json({ success: false, message: error.message });
  res.json({ success: true, user: profile, degradation_pct, effective_capacity: Math.round(effective_capacity * 10) / 10 });
});

// POST /api/auth/logout — Supabase handles invalidation client-side
app.post('/api/auth/logout', (req, res) => res.json({ success: true }));

// ─── Station Routes ────────────────────────────────────────────────────────────

// GET /api/stations?lat=&lng=&radius=&charger_type=&fast_only=&available_only=
app.get('/api/stations', async (req, res) => {
  const { lat, lng, radius = 50, charger_type, fast_only, available_only } = req.query;

  const { data: stations, error } = await supabase.from('stations').select('*');
  if (error) return res.status(500).json({ success: false, message: error.message });

  let result = stations.map(s => ({
    ...s,
    distance: lat && lng ? haversine(parseFloat(lat), parseFloat(lng), s.latitude, s.longitude) : null
  }));

  if (lat && lng) {
    result = result.filter(s => s.distance <= parseFloat(radius));
    result.sort((a, b) => a.distance - b.distance);
  }

  if (charger_type)           result = result.filter(s => s.charger_types.includes(charger_type));
  if (fast_only === 'true')   result = result.filter(s => s.is_fast_charger);
  if (available_only === 'true') result = result.filter(s => s.available_slots > 0);

  res.json({ success: true, count: result.length, stations: result });
});

// GET /api/stations/:id
app.get('/api/stations/:id', async (req, res) => {
  const { data: station, error } = await supabase
    .from('stations').select('*').eq('id', req.params.id).single();
  if (error || !station) return res.status(404).json({ success: false, message: 'Station not found' });
  res.json({ success: true, station });
});

// GET /api/stations/:id/slots?date=
app.get('/api/stations/:id/slots', async (req, res) => {
  const { date } = req.query;
  const targetDate = date || new Date().toISOString().split('T')[0];

  const { data: station, error: sErr } = await supabase
    .from('stations').select('*').eq('id', req.params.id).single();
  if (sErr || !station) return res.status(404).json({ success: false, message: 'Station not found' });

  const { data: bookedRows } = await supabase
    .from('bookings')
    .select('slot_time')
    .eq('station_id', req.params.id)
    .eq('status', 'confirmed')
    .like('slot_time', `${targetDate}%`);

  const bookedSlots = (bookedRows || []).map(r => r.slot_time);

  const slots = [];
  for (let h = 6; h <= 22; h++) {
    const timeStr = `${targetDate}T${String(h).padStart(2, '0')}:00:00`;
    const booked  = bookedSlots.filter(s => s.startsWith(timeStr)).length;
    slots.push({
      time:     timeStr,
      display:  `${String(h).padStart(2, '0')}:00`,
      available: Math.max(0, station.total_slots - booked),
      total:     station.total_slots,
      is_peak:  (h >= 8 && h <= 10) || (h >= 17 && h <= 20)
    });
  }
  res.json({ success: true, date: targetDate, slots });
});

// ─── Booking Routes ────────────────────────────────────────────────────────────

// POST /api/bookings
app.post('/api/bookings', async (req, res) => {
  const { user_id, station_id, slot_time, duration_hours = 1,
          charger_type, tx_hash, wallet_address, payment_method = 'simulated' } = req.body;

  if (!user_id || !station_id || !slot_time || !charger_type)
    return res.status(400).json({ success: false, message: 'Missing required fields' });

  const { data: station } = await supabase.from('stations').select('*').eq('id', station_id).single();
  if (!station) return res.status(404).json({ success: false, message: 'Station not found' });

  const { count } = await supabase
    .from('bookings')
    .select('*', { count: 'exact', head: true })
    .eq('station_id', station_id)
    .eq('slot_time', slot_time)
    .eq('status', 'confirmed');

  if (count >= station.total_slots)
    return res.status(409).json({ success: false, message: 'Slot fully booked' });

  const amount  = station.price_per_kwh * 7.4 * parseFloat(duration_hours);
  const booking = {
    id: uuidv4(),
    user_id, station_id, slot_time,
    duration_hours:  parseFloat(duration_hours),
    charger_type,
    status:          'confirmed',
    amount:          Math.round(amount * 100) / 100,
    payment_method,
    tx_hash:         tx_hash || null,
    wallet_address:  wallet_address || null
  };

  const { error: bErr } = await supabase.from('bookings').insert(booking);
  if (bErr) return res.status(500).json({ success: false, message: bErr.message });

  await supabase.from('stations')
    .update({ available_slots: Math.max(0, station.available_slots - 1) })
    .eq('id', station_id);

  res.json({ success: true, message: 'Booking confirmed!', booking });
});

// GET /api/bookings?user_id=
app.get('/api/bookings', async (req, res) => {
  const { user_id } = req.query;
  let query = supabase
    .from('bookings')
    .select('*, stations(name, address, latitude, longitude)')
    .order('created_at', { ascending: false });

  if (user_id) query = query.eq('user_id', user_id);

  const { data: bookings, error } = await query;
  if (error) return res.status(500).json({ success: false, message: error.message });

  const result = (bookings || []).map(b => ({
    ...b,
    station_name: b.stations?.name,
    address:      b.stations?.address,
    latitude:     b.stations?.latitude,
    longitude:    b.stations?.longitude,
    stations:     undefined
  }));

  res.json({ success: true, bookings: result });
});

// PATCH /api/bookings/:id/cancel
app.patch('/api/bookings/:id/cancel', async (req, res) => {
  const { data: booking } = await supabase.from('bookings').select('*').eq('id', req.params.id).single();
  if (!booking)                    return res.status(404).json({ success: false, message: 'Booking not found' });
  if (booking.status === 'cancelled') return res.status(400).json({ success: false, message: 'Already cancelled' });

  await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', req.params.id);

  const { data: station } = await supabase.from('stations').select('*').eq('id', booking.station_id).single();
  if (station) {
    await supabase.from('stations')
      .update({ available_slots: Math.min(station.total_slots, station.available_slots + 1) })
      .eq('id', booking.station_id);
  }

  res.json({ success: true, message: 'Booking cancelled successfully' });
});

// ─── Razorpay Routes ───────────────────────────────────────────────────────────

// POST /api/payment/create-order
app.post('/api/payment/create-order', async (req, res) => {
  const { amount, station_id, slot_time, charger_type, duration_hours } = req.body;
  if (!amount || !station_id || !slot_time || !charger_type)
    return res.status(400).json({ success: false, message: 'Missing fields' });
  try {
    if (!razorpay) {
      // Simulate an order id for dev if razorpay is missing
      return res.json({ success: true, order_id: `sim_order_${uuidv4().slice(0, 8)}`, amount: Math.round((amount + 5) * 100), currency: 'INR', key_id: 'sim_key' });
    }
    const order = await razorpay.orders.create({
      amount:   Math.round((amount + 5) * 100),
      currency: 'INR',
      receipt:  `evpath_${uuidv4().slice(0, 8)}`,
      notes:    { station_id, slot_time, charger_type, duration_hours }
    });
    res.json({ success: true, order_id: order.id, amount: order.amount, currency: order.currency, key_id: RAZORPAY_KEY_ID });
  } catch (e) {
    console.error('Razorpay order error:', e);
    res.status(500).json({ success: false, message: 'Could not create payment order' });
  }
});

// POST /api/payment/verify
app.post('/api/payment/verify', async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature,
          user_id, station_id, slot_time, charger_type, duration_hours } = req.body;

  if (razorpay) {
    const body     = razorpay_order_id + '|' + razorpay_payment_id;
    const expected = crypto.createHmac('sha256', RAZORPAY_KEY_SECRET).update(body).digest('hex');
    if (expected !== razorpay_signature)
      return res.status(400).json({ success: false, message: 'Payment verification failed' });
  } else {
    // Simulated payment verification
    console.log('⚠️ Simulating payment verification since Razorpay keys are missing');
  }

  const { data: station } = await supabase.from('stations').select('*').eq('id', station_id).single();
  if (!station) return res.status(404).json({ success: false, message: 'Station not found' });

  const amount  = station.price_per_kwh * 7.4 * parseFloat(duration_hours || 1);
  const booking = {
    id: uuidv4(), user_id: user_id || null,
    station_id, slot_time,
    duration_hours:  parseFloat(duration_hours || 1),
    charger_type,
    status:          'confirmed',
    amount:          Math.round(amount * 100) / 100,
    payment_method:  'razorpay',
    tx_hash:         razorpay_payment_id,
    wallet_address:  null
  };

  await supabase.from('bookings').insert(booking);
  await supabase.from('stations')
    .update({ available_slots: Math.max(0, station.available_slots - 1) })
    .eq('id', station_id);

  console.log(`✅ Razorpay payment verified: ${razorpay_payment_id}`);
  res.json({ success: true, booking });
});

// ─── Stats Route ───────────────────────────────────────────────────────────────
app.get('/api/stats', async (req, res) => {
  const { count: totalStations } = await supabase.from('stations').select('*', { count: 'exact', head: true });
  const { data: slotData }       = await supabase.from('stations').select('total_slots, available_slots');
  const totalSlots     = (slotData || []).reduce((s, r) => s + r.total_slots, 0);
  const availableSlots = (slotData || []).reduce((s, r) => s + r.available_slots, 0);

  const { count: totalBookings } = await supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('status', 'confirmed');
  const { data: revenueData }    = await supabase.from('bookings').select('amount').eq('status', 'confirmed');
  const revenue = (revenueData || []).reduce((s, b) => s + b.amount, 0);

  res.json({
    success: true,
    stats: {
      totalStations, totalSlots, availableSlots,
      occupancyRate: totalSlots ? Math.round(((totalSlots - availableSlots) / totalSlots) * 100) : 0,
      totalBookings,
      revenue:        Math.round(revenue),
      popularStation: 'N/A'
    }
  });
});

// ─── Config endpoint for frontend ─────────────────────────────────────────────
// Safely exposes only the public anon key to the browser
app.get('/api/config', (req, res) => {
  res.json({
    supabaseUrl:    SUPABASE_URL,
    supabaseAnonKey: SUPABASE_ANON_KEY
  });
});

// ─── Fallback ──────────────────────────────────────────────────────────────────
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n⚡ EV PATH Charging Platform`);
  console.log(`🌐 Running at http://localhost:${PORT}`);
  console.log(`📊 Admin panel at http://localhost:${PORT}/admin.html`);
  console.log(`🗄  Database: Supabase (${SUPABASE_URL})\n`);
});
