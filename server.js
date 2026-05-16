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
  
  const { data: managers } = await supabase
    .from('station_managers')
    .select('*, stations(name, address)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1);

  const manager = managers && managers.length > 0 ? managers[0] : null;
  const isManagerVerified = !!manager;
  const managerStation = manager ? { id: manager.station_id, name: manager.stations?.name, address: manager.stations?.address } : null;

  res.json({ success: true, user: { ...user, ...(profile || {}), isAdmin: !!admin, isManagerVerified, managerStation } });
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

// PATCH /api/auth/manager — save manager verification info
app.patch('/api/auth/manager', requireAuth, async (req, res) => {
  const { verified_id, station_id } = req.body;
  
  if (!verified_id || !station_id) return res.status(400).json({ success: false, message: 'Please provide both Verified ID and Station ID' });

  // Check if station exists
  const { data: station } = await supabase.from('stations').select('id').eq('id', station_id).single();
  if (!station) return res.status(404).json({ success: false, message: 'Invalid Station ID. Please check and try again.' });

  const { data: manager, error } = await supabase
    .from('station_managers')
    .insert({
      user_id: req.user.id,
      station_id: station_id,
      verified_id: verified_id
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') return res.status(400).json({ success: false, message: 'You are already registered as a manager for this station.' });
    return res.status(500).json({ success: false, message: error.message });
  }

  res.json({ success: true, manager });
});

// POST /api/auth/logout — Supabase handles invalidation client-side
app.post('/api/auth/logout', (req, res) => res.json({ success: true }));

// GET /api/health — diagnostic endpoint
app.get('/api/health', async (req, res) => {
  const { count, error } = await supabase.from('stations').select('id', { count: 'exact', head: true });
  res.json({
    success: !error,
    database: error ? 'disconnected' : 'connected',
    stationCount: count || 0,
    env: {
      supabaseUrl: !!process.env.SUPABASE_URL,
      supabaseServiceKey: !!process.env.SUPABASE_SERVICE_KEY,
      supabaseAnonKey: !!process.env.SUPABASE_ANON_KEY
    }
  });
});

// ─── Station Routes ────────────────────────────────────────────────────────────

// GET /api/stations?lat=&lng=&radius=&charger_type=&fast_only=&available_only=&search=
app.get('/api/stations', async (req, res) => {
  const { lat, lng, radius = 50, charger_type, fast_only, available_only, search } = req.query;

  let query = supabase.from('stations').select('*');

  // Backend search using ilike for partial name/address matches
  if (search) {
    const searchTerm = `%${search}%`;
    query = query.or(`name.ilike.${searchTerm},address.ilike.${searchTerm},operator.ilike.${searchTerm}`);
  }

  const { data: stations, error } = await query;
  if (error) return res.status(500).json({ success: false, message: error.message });

  // Remove duplicates based on ID (to handle potential DB redundancy)
  const uniqueStations = Array.from(new Map(stations.map(s => [s.id, s])).values());

  let result = uniqueStations.map(s => {
    // Try to extract city from address if not present
    const addrParts = s.address ? s.address.split(',').map(p => p.trim()) : [];
    const city = addrParts.length >= 2 ? addrParts[addrParts.length - 2] : (addrParts[0] || 'Unknown');
    
    return {
      ...s,
      city: s.city || city,
      distance: lat && lng ? haversine(parseFloat(lat), parseFloat(lng), s.latitude, s.longitude) : null
    };
  });

  if (lat && lng) {
    const r = parseFloat(radius);
    const nearby = result.filter(s => s.distance <= r);
    
    // Fallback: If no stations in radius, return the closest 10 nationwide
    if (nearby.length === 0 && !search && !charger_type && !fast_only && !available_only) {
      result.sort((a, b) => a.distance - b.distance);
      result = result.slice(0, 10);
    } else {
      result = nearby;
      result.sort((a, b) => a.distance - b.distance);
    }
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

// ─── Favorites Routes ──────────────────────────────────────────────────────

// GET /api/favorites — retrieve user's favorite station IDs
app.get('/api/favorites', requireAuth, async (req, res) => {
  const { data: favs, error } = await supabase
    .from('user_favorites')
    .select('station_id')
    .eq('user_id', req.user.id);

  if (error) return res.status(500).json({ success: false, message: error.message });
  const stationIds = (favs || []).map(f => f.station_id);
  res.json({ success: true, favorites: stationIds });
});

// POST /api/favorites — save user's favorite station IDs (replace all)
app.post('/api/favorites', requireAuth, async (req, res) => {
  const { station_ids } = req.body;
  if (!Array.isArray(station_ids)) {
    return res.status(400).json({ success: false, message: 'station_ids must be an array' });
  }

  // Delete existing favorites for user, then insert new set
  await supabase.from('user_favorites').delete().eq('user_id', req.user.id);

  if (station_ids.length > 0) {
    const inserts = station_ids.map(station_id => ({
      user_id: req.user.id,
      station_id
    }));
    const { error: insErr } = await supabase.from('user_favorites').insert(inserts);
    if (insErr) return res.status(500).json({ success: false, message: insErr.message });
  }

  res.json({ success: true, favorites: station_ids });
});

// DELETE /api/favorites/:stationId — remove single favorite
app.delete('/api/favorites/:stationId', requireAuth, async (req, res) => {
  const { error } = await supabase
    .from('user_favorites')
    .delete()
    .eq('user_id', req.user.id)
    .eq('station_id', req.params.stationId);

  if (error) return res.status(500).json({ success: false, message: error.message });
  res.json({ success: true });
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

  // Check explicitly blocked slots
  const { data: blockedRows } = await supabase
    .from('station_slots')
    .select('slot_time')
    .eq('station_id', req.params.id)
    .like('slot_time', `${targetDate}%`)
    .eq('is_available', false);
  const blockedSlots = (blockedRows || []).map(r => r.slot_time);

  const slots = [];
  for (let h = 6; h <= 22; h++) {
    const timeStr = `${targetDate}T${String(h).padStart(2, '0')}:00:00`;
    const booked  = bookedSlots.filter(s => s.startsWith(timeStr)).length;
    const isBlocked = blockedSlots.includes(timeStr);
    
    slots.push({
      time:     timeStr,
      display:  `${String(h).padStart(2, '0')}:00`,
      available: isBlocked ? 0 : Math.max(0, station.total_slots - booked),
      total:     station.total_slots,
      is_peak:  (h >= 8 && h <= 10) || (h >= 17 && h <= 20)
    });
  }
  res.json({ success: true, date: targetDate, slots });
});

// ─── Manager Routes ────────────────────────────────────────────────────────────

// GET /api/manager/dashboard
app.get('/api/manager/dashboard', requireAuth, async (req, res) => {
  const { data: managers } = await supabase.from('station_managers').select('*').eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(1);
  const manager = managers && managers.length > 0 ? managers[0] : null;
  if (!manager) return res.status(403).json({ success: false, message: 'Not a manager' });

  // Get total bookings for their station
  const { count: totalBookings } = await supabase.from('bookings').select('*', { count: 'exact', head: true })
    .eq('station_id', manager.station_id);

  // Get today's revenue
  const today = new Date().toISOString().split('T')[0];
  const { data: todayBookings } = await supabase.from('bookings').select('amount')
    .eq('station_id', manager.station_id)
    .like('slot_time', `${today}%`);
  
  const revenue = (todayBookings || []).reduce((sum, b) => sum + (b.amount || 0), 0);

  res.json({ success: true, stats: { totalBookings: totalBookings || 0, todayRevenue: revenue } });
});

// GET /api/manager/slots
app.get('/api/manager/slots', requireAuth, async (req, res) => {
  const { date } = req.query;
  const targetDate = date || new Date().toISOString().split('T')[0];
  
  const { data: managers } = await supabase.from('station_managers').select('*').eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(1);
  const manager = managers && managers.length > 0 ? managers[0] : null;
  if (!manager) return res.status(403).json({ success: false, message: 'Not a manager' });

  const { data: station } = await supabase.from('stations').select('total_slots').eq('id', manager.station_id).single();
  
  const { data: bookedRows } = await supabase.from('bookings').select('slot_time')
    .eq('station_id', manager.station_id).eq('status', 'confirmed').like('slot_time', `${targetDate}%`);
  const bookedSlots = (bookedRows || []).map(r => r.slot_time);

  const { data: blockedRows } = await supabase.from('station_slots').select('slot_time, is_available')
    .eq('station_id', manager.station_id).like('slot_time', `${targetDate}%`).eq('is_available', false);
  const blockedSlots = (blockedRows || []).map(r => r.slot_time);

  const slots = [];
  for (let h = 6; h <= 22; h++) {
    const timeStr = `${targetDate}T${String(h).padStart(2, '0')}:00:00`;
    const booked = bookedSlots.filter(s => s.startsWith(timeStr)).length;
    const isBlocked = blockedSlots.includes(timeStr);
    
    slots.push({
      time: timeStr,
      display: `${String(h).padStart(2, '0')}:00`,
      booked_count: booked,
      total_capacity: station.total_slots,
      is_blocked: isBlocked
    });
  }
  res.json({ success: true, slots });
});

// POST /api/manager/slots/toggle
app.post('/api/manager/slots/toggle', requireAuth, async (req, res) => {
  const { slot_time, is_available } = req.body;
  const { data: managers } = await supabase.from('station_managers').select('*').eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(1);
  const manager = managers && managers.length > 0 ? managers[0] : null;
  if (!manager) return res.status(403).json({ success: false });

  const { error } = await supabase.from('station_slots').upsert({
    station_id: manager.station_id,
    slot_time,
    is_available
  });

  if (error) return res.status(500).json({ success: false, message: error.message });
  res.json({ success: true });
});

// ─── Booking Routes ────────────────────────────────────────────────────────────

// POST /api/bookings
app.post('/api/bookings', requireAuth, async (req, res) => {
  const { station_id, slot_time, duration_hours = 1,
          charger_type, tx_hash, wallet_address, payment_method = 'simulated' } = req.body;

  // Use authenticated user's ID - prevent IDOR by ignoring user_id from body
  const user_id = req.user.id;

  if (!station_id || !slot_time || !charger_type)
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

  // Update CO2 savings and check for achievements after confirmed booking
  const kwh_consumed = 7.4 * parseFloat(duration_hours);
  await supabase.rpc('update_co2_savings', { p_user_id: user_id, p_kwh_consumed: kwh_consumed });

  // Check if first booking - award first charge achievement
  const { count: userBookingCount } = await supabase
    .from('bookings')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user_id);
  if (userBookingCount === 1) {
    await supabase.rpc('award_achievement', {
      p_user_id: user_id,
      p_type: 'first_charge',
      p_title: 'First Charge',
      p_description: 'Completed your first charging session',
      p_points: 10
    });
  }

  res.json({ success: true, message: 'Booking confirmed!', booking });
});

// GET /api/bookings — returns bookings for authenticated user only
app.get('/api/bookings', requireAuth, async (req, res) => {
  // Only return the authenticated user's bookings - prevent IDOR
  let query = supabase
    .from('bookings')
    .select('*, stations(name, address, latitude, longitude)')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false });

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
app.patch('/api/bookings/:id/cancel', requireAuth, async (req, res) => {
  const { data: booking } = await supabase.from('bookings').select('*').eq('id', req.params.id).single();
  if (!booking)                    return res.status(404).json({ success: false, message: 'Booking not found' });
  if (booking.status === 'cancelled') return res.status(400).json({ success: false, message: 'Already cancelled' });

  // IDOR protection: ensure user owns this booking
  if (booking.user_id !== req.user.id) {
    return res.status(403).json({ success: false, message: 'Not authorized to cancel this booking' });
  }

  await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', req.params.id);

  const { data: station } = await supabase.from('stations').select('*').eq('id', booking.station_id).single();
  if (station) {
    await supabase.from('stations')
      .update({ available_slots: Math.min(station.total_slots, station.available_slots + 1) })
      .eq('id', booking.station_id);
  }

  res.json({ success: true, message: 'Booking cancelled successfully' });
});

// ─── Leaderboard Route ─────────────────────────────────────────────────────────

// GET /api/leaderboard — returns top 10 users from leaderboard view
app.get('/api/leaderboard', async (req, res) => {
  const { data: leaderboard, error } = await supabase
    .from('leaderboard')
    .select('*')
    .order('rank', { ascending: true })
    .limit(10);

  if (error) return res.status(500).json({ success: false, message: error.message });
  res.json({ success: true, leaderboard });
});

// ─── User Profile Route ─────────────────────────────────────────────────────────

// GET /api/profile — returns authenticated user profile and achievements
app.get('/api/profile', requireAuth, async (req, res) => {
  // Fetch user profile data
  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('user_id', req.user.id)
    .single();

  if (profileError && profileError.code !== 'PGRST116') {
    return res.status(500).json({ success: false, message: profileError.message });
  }

  // Fetch user's achievements
  const { data: achievements, error: achError } = await supabase
    .from('achievements')
    .select('*')
    .eq('user_id', req.user.id)
    .order('awarded_at', { ascending: false });

  if (achError) return res.status(500).json({ success: false, message: achError.message });

  // Calculate rank from leaderboard
  const { data: rankData } = await supabase
    .from('leaderboard')
    .select('rank')
    .eq('user_id', req.user.id)
    .single();

  res.json({
    success: true,
    profile: profile || null,
    achievements: achievements || [],
    rank: rankData?.rank || null
  });
});

// ─── User Insights Route ─────────────────────────────────────────────────────────

// GET /api/user/insights — aggregated charging stats for the dashboard
app.get('/api/user/insights', requireAuth, async (req, res) => {
  // Fetch all confirmed bookings for this user
  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('*, stations(price_per_kwh)')
    .eq('user_id', req.user.id)
    .eq('status', 'confirmed')
    .order('slot_time', { ascending: true });

  if (error) return res.status(500).json({ success: false, message: error.message });

  // Calculate aggregates
  let totalSpent = 0;
  let totalKwh = 0;
  const monthlyData = {};

  for (const booking of (bookings || [])) {
    const amount = booking.amount || 0;
    totalSpent += amount;

    // Estimate kWh from amount and station price
    const pricePerKwh = booking.stations?.price_per_kwh || 14; // default fallback
    const kwh = pricePerKwh > 0 ? amount / pricePerKwh : 0;
    totalKwh += kwh;

    // Group by month
    const date = new Date(booking.slot_time);
    const monthKey = date.toLocaleString('en-US', { month: 'short', year: '2-digit' }); // e.g., "May 26"
    if (!monthlyData[monthKey]) {
      monthlyData[monthKey] = { month: monthKey, kwh: 0 };
    }
    monthlyData[monthKey].kwh += kwh;
  }

  // CO2 savings: ~0.21 kg CO2 avoided per kWh vs petrol (~2.5 kg/L, 15 km/L = ~0.167 kg/km, EV uses ~0.15 kWh/km)
  const totalCo2 = totalKwh * 0.21;

  // Format history as array (last 6 months or available)
  const history = Object.values(monthlyData).slice(-6);

  res.json({
    success: true,
    data: {
      total_kwh: Math.round(totalKwh * 10) / 10,
      total_spent: Math.round(totalSpent),
      total_co2: Math.round(totalCo2 * 10) / 10,
      history
    }
  });
});

// ─── Razorpay Routes ───────────────────────────────────────────────────────────

// POST /api/payment/create-order
app.post('/api/payment/create-order', requireAuth, async (req, res) => {
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
app.post('/api/payment/verify', requireAuth, async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature,
          station_id, slot_time, charger_type, duration_hours } = req.body;

  // Use authenticated user's ID - prevent IDOR by ignoring user_id from body
  const user_id = req.user.id;

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

  // Update CO2 savings and check for achievements after confirmed booking
  const kwh_consumed = 7.4 * parseFloat(duration_hours || 1);
  await supabase.rpc('update_co2_savings', { p_user_id: user_id, p_kwh_consumed: kwh_consumed });

  // Check if first booking - award first charge achievement
  const { count: userBookingCount } = await supabase
    .from('bookings')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user_id);
  if (userBookingCount === 1) {
    await supabase.rpc('award_achievement', {
      p_user_id: user_id,
      p_type: 'first_charge',
      p_title: 'First Charge',
      p_description: 'Completed your first charging session',
      p_points: 10
    });
  }

  console.log(`✅ Razorpay payment verified: ${razorpay_payment_id}`);
  res.json({ success: true, booking });
});

// ─── Phase 3: Community & Rewards ─────────────────────────────────────────────

// GET /api/leaderboard
app.get('/api/leaderboard', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('leaderboard')
      .select('*')
      .limit(10);
    
    if (error) throw error;
    res.json({ success: true, leaderboard: data });
  } catch (e) {
    console.error('Leaderboard fetch error:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/profile
app.get('/api/profile', requireAuth, async (req, res) => {
  try {
    const user_id = req.user.id;
    const { data: profile, error: pErr } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', user_id)
      .single();
    
    if (pErr) throw pErr;

    const { data: achievements } = await supabase
      .from('achievements')
      .select('*')
      .eq('user_id', user_id);

    res.json({ success: true, profile, achievements });
  } catch (e) {
    console.error('Profile fetch error:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ─── Stats Route ───────────────────────────────────────────────────────────────
app.get('/api/stats', requireAuth, async (req, res) => {
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

module.exports = app;
