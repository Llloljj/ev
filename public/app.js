/* ── EV PATH Frontend ── */
const API = window.location.origin + '/api';
let DEMO_USER = null;
let DEMO_USER_NAME = null;

// ── Helpers ────────────────────────────────────────────────────
function ensureArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try { return JSON.parse(val); } catch(e) { return []; }
}

let map, userMarker, stationMarkers = [], allStations = [], selectedStation = null, selectedSlot = null;
let routeLayer = null;
let userLat = null, userLng = null;
let vehicleProfile = JSON.parse(localStorage.getItem('evpath_vehicle') || 'null');
let heatmapLayers = [], heatmapOn = false;
let pendingBookingData = null;

// ── Favourites & Sort ──────────────────────────────────────────
let favorites = new Set();
let currentSort = 'default';

// Load favorites from backend on init
async function loadFavoritesFromBackend() {
  const token = localStorage.getItem('ev_session_token');
  if (!token) return;
  try {
    const res = await fetch(`${API}/favorites`, {
      headers: { 'x-session-token': token }
    });
    const data = await res.json();
    if (data.success && data.favorites) {
      favorites = new Set(data.favorites);
      localStorage.setItem('evpath_favs', JSON.stringify([...favorites]));
    }
  } catch (e) {
    // Fall back to localStorage
    favorites = new Set(JSON.parse(localStorage.getItem('evpath_favs') || '[]'));
  }
}

// Sync favorites to backend (non-blocking)
async function syncFavoritesToBackend() {
  const token = localStorage.getItem('ev_session_token');
  if (!token) return;
  try {
    await fetch(`${API}/favorites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-session-token': token },
      body: JSON.stringify({ station_ids: [...favorites] })
    });
  } catch (e) {
    // Silent fail - localStorage already has the data
  }
}

// ── Theme ──────────────────────────────────────────────────────
let isDark = localStorage.getItem('evpath_theme') !== 'light';

// ── Init (Supabase Auth Check) ──
window.addEventListener('DOMContentLoaded', async () => {
  const sessionUser = JSON.parse(localStorage.getItem('ev_user'));
  if (!sessionUser) {
    window.location.href = '/login.html';
    return;
  }

  DEMO_USER = sessionUser.id;
  DEMO_USER_NAME = sessionUser.user_metadata?.full_name || sessionUser.email.split('@')[0];

  // Load favorites from backend (non-blocking)
  loadFavoritesFromBackend(); // fire and forget

  // Default vehicle profile if none saved
  if (!vehicleProfile) {
    vehicleProfile = {
      model: 'Tata Nexon EV',
      yearsUsed: 1,
      rangeKm: 312,
      batteryPct: 80,
      degradationPct: 2.3
    };
    localStorage.setItem('evpath_vehicle', JSON.stringify(vehicleProfile));
  }

  // Update navbar user badge
  const navBadge = document.querySelector('.user-badge');
  if (navBadge) {
    const avatar = sessionUser.user_metadata?.avatar_url;
    const initial = DEMO_USER_NAME.charAt(0).toUpperCase();

    if (avatar) {
      navBadge.innerHTML = `
        <img src="${avatar}" style="width:26px;height:26px;border-radius:50%;object-fit:cover;">
        <span id="user-name-nav">${DEMO_USER_NAME}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;opacity:.4"><polyline points="6 9 12 15 18 9"/></svg>
      `;
    } else {
      navBadge.innerHTML = `
        <div style="width:26px;height:26px;border-radius:50%;background:linear-gradient(135deg,var(--primary),#06B6D4);color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800">${initial}</div>
        <span id="user-name-nav">${DEMO_USER_NAME}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;opacity:.4"><polyline points="6 9 12 15 18 9"/></svg>
      `;
    }
  }

  // ── Boot app ────────────────────────────────────────────────
  initMap();
  checkPage();
  applyVehicleProfileUI();
  updateNavUser();
  loadHeroStats();
  initTheme();
  initLiveTicker();
  
  // Load all stations across India by default at start
  loadStations(null, null);
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    document.querySelectorAll('.modal-backdrop.open').forEach(m => m.classList.remove('open'));
    closeStationDetail();
  });
});


function checkPage() {
  const hash = location.hash;
  if (hash === '#bookings') showPage('bookings');
}

// ── Map ────────────────────────────────────────────────────────
function initMap() {
  map = L.map('map', { zoomControl: false, center: [20.5937, 78.9629], zoom: 5 });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap',
    maxZoom: 19
  }).addTo(map);
}

function getUserLocation() {
  showToast('Detecting your location...', 'info');
  navigator.geolocation.getCurrentPosition(pos => {
    userLat = pos.coords.latitude;
    userLng = pos.coords.longitude;
    map.setView([userLat, userLng], 12);
    if (userMarker) userMarker.remove();
    userMarker = L.circleMarker([userLat, userLng], {
      radius: 10, fillColor: '#3B82F6', color: '#fff',
      weight: 3, fillOpacity: 1
    }).addTo(map).bindPopup('<b>You are here</b>').openPopup();
    loadStations(userLat, userLng);
  }, () => {
    showToast('Location access denied. Loading all stations...', 'error');
    loadStations(null, null);
  });
}

// ── Stations ───────────────────────────────────────────────────
async function loadStations(lat, lng, searchQuery) {
  const charger = document.getElementById('filter-charger').value;
  const radius = document.getElementById('filter-radius').value;
  const fast = document.getElementById('filter-fast').checked;
  const avail = document.getElementById('filter-available').checked;

  let url = `${API}/stations?radius=${radius}`;
  if (lat) url += `&lat=${lat}&lng=${lng}`;
  if (charger) url += `&charger_type=${charger}`;
  if (fast) url += `&fast_only=true`;
  if (avail) url += `&available_only=true`;
  if (searchQuery) url += `&search=${encodeURIComponent(searchQuery)}`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    allStations = data.stations;
    renderStationList(allStations);
    renderMapMarkers(allStations);
  } catch (err) {
    console.error('Stations load error:', err);
    showToast('Failed to load stations. Check console.', 'error');
  }
}

function applyFilters() { loadStations(userLat, userLng); }

// ── Search Filter ──────────────────────────────────────────────
function filterBySearch(query) {
  const clearBtn = document.getElementById('search-clear');
  clearBtn.style.display = query.length > 0 ? 'flex' : 'none';
  const q = query.toLowerCase().trim();
  if (!q) { renderStationList(allStations); return; }
  const filtered = allStations.filter(s => 
    (s.name?.toLowerCase().includes(q)) || 
    (s.address?.toLowerCase().includes(q)) || 
    (s.operator?.toLowerCase().includes(q))
  );
  renderStationList(filtered);
}

function clearSearch() {
  const input = document.getElementById('station-search');
  input.value = '';
  document.getElementById('search-clear').style.display = 'none';
  renderStationList(allStations);
  input.focus();
}

function renderStationList(stations) {
  const el = document.getElementById('station-list');
  let list = [...stations];
  // Client-side favourites filter
  if (document.getElementById('filter-favs')?.checked) {
    list = list.filter(s => favorites.has(s.id));
  }
  // Client-side sort
  list = sortStations(list);
  if (!list.length) {
    el.innerHTML = `<div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M8 12h8M12 8v8"/></svg>
      <h3>No stations found</h3><p>Try adjusting filters or expanding radius</p>
    </div>`; return;
  }
  el.innerHTML = list.map(s => stationCardHTML(s)).join('');
}

function stationCardHTML(s) {
  const avail = s.available_slots;
  const pct = avail / s.total_slots;
  const badge = avail === 0 ? 'full' : pct <= 0.3 ? 'limited' : 'available';
  const label = avail === 0 ? 'Full' : `${avail}/${s.total_slots} free`;
  const dist = s.distance != null ? `${s.distance.toFixed(1)} km` : '';
  const fast = s.is_fast_charger ? `<span class="sc-tag sc-fast"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>Fast</span>` : '';
  const barColor = avail === 0 ? '#EF4444' : pct <= 0.3 ? '#F59E0B' : '#10B981';
  const barWidth = Math.round(pct * 100);
  const isFav = favorites.has(s.id);

  let isOutOfRange = false;
  if (vehicleProfile && s.distance != null) {
    const remaining = (vehicleProfile.batteryPct / 100) * vehicleProfile.rangeKm;
    if (s.distance > remaining) isOutOfRange = true;
  }
  const rangeBadge = isOutOfRange ? `<span class="sc-tag" style="background:rgba(239,68,68,.1);color:var(--danger);border:1px solid rgba(239,68,68,.2)">Out of Range</span>` : '';
  const cardStyle = isOutOfRange ? 'opacity:.45;filter:grayscale(.8)' : '';

  return `<div class="station-card ${isOutOfRange ? 'out-of-range' : ''}" onclick="openStationDetail('${s.id}')" id="sc-${s.id}" style="${cardStyle}">
    <div class="sc-header">
      <div class="sc-name">${s.name}</div>
      <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
        <span class="availability-badge ${badge}">${label}</span>
        <button class="fav-btn ${isFav ? 'active' : ''}" onclick="toggleFavorite('${s.id}',event)" title="${isFav ? 'Remove favourite' : 'Add favourite'}">
          <svg viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        </button>
      </div>
    </div>
    <div class="sc-meta">
      ${fast}
      ${rangeBadge}
      <span class="sc-tag"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>${s.power_kw}kW</span>
      <span class="sc-tag"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>${s.avg_wait_minutes}min</span>
      <span class="sc-tag">${ensureArray(s.charger_types).slice(0, 2).join(', ')}</span>
    </div>
    <div class="sc-avail-bar"><div style="width:${barWidth}%;background:${barColor}"></div></div>
    <div class="sc-footer">
      <span class="sc-price">₹${s.price_per_kwh}/kWh</span>
      <span class="sc-stars">★ ${s.rating}</span>
      <span class="sc-dist">${dist}</span>
    </div>
  </div>`;
}

// ── Map Markers ────────────────────────────────────────────────
function renderMapMarkers(stations) {
  stationMarkers.forEach(m => m.remove());
  stationMarkers = [];
  stations.forEach(s => {
    const avail = s.available_slots;
    const color = avail === 0 ? '#EF4444' : avail <= 2 ? '#F59E0B' : '#10B981';
    const icon = L.divIcon({
      html: `<div style="background:${color};width:32px;height:32px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,.4);border:2px solid rgba(255,255,255,.3)">
        <svg style="transform:rotate(45deg);width:16px;height:16px;color:#fff" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
      </div>`,
      className: '', iconSize: [32, 32], iconAnchor: [16, 32], popupAnchor: [0, -36]
    });
    const m = L.marker([s.latitude, s.longitude], { icon }).addTo(map);
    m.bindPopup(`<div class="popup-content">
      <h4>${s.name}</h4>
      <div class="popup-avail" style="color:${color}">${avail}/${s.total_slots} slots available</div>
      <button class="popup-btn" onclick="map.closePopup(); openStationDetail('${s.id}')">View & Book</button>
    </div>`);
    m.on('click', () => openStationDetail(s.id));
    stationMarkers.push(m);
  });
  
  // If no user location, zoom map to show all stations
  if (stations.length > 0 && !userLat) {
    const group = new L.featureGroup(stationMarkers);
    map.fitBounds(group.getBounds().pad(0.1));
  }
}

// ── Station Detail ─────────────────────────────────────────────
async function openStationDetail(id) {
  document.querySelectorAll('.station-card').forEach(c => c.classList.remove('selected'));
  const card = document.getElementById(`sc-${id}`);
  if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  if (card) card.classList.add('selected');

  try {
    const res = await fetch(`${API}/stations/${id}`);
    const data = await res.json();
    const s = data.station;
    selectedStation = s;

    const avail = s.available_slots;
    const pct = Math.round((1 - avail / s.total_slots) * 100);
    const fillColor = avail === 0 ? '#EF4444' : avail <= 2 ? '#F59E0B' : '#10B981';

    const chargers = ensureArray(s.charger_types);
    const amenities = ensureArray(s.amenities);

    const chargerChips = chargers.map(c => {
      const fast = ['CCS2', 'CHAdeMO', 'GB/T'].includes(c);
      return `<span class="charger-chip ${fast ? 'fast' : ''}">${c}</span>`;
    }).join('');

    const amenityItems = amenities.map(a => `<span class="amenity-item">${a}</span>`).join('');

    document.getElementById('station-detail-content').innerHTML = `
      <div class="sd-inner">
        <div class="sd-top">
          <div class="sd-name">${s.name}</div>
          <div class="sd-address">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1118 0z"/><circle cx="12" cy="10" r="3"/></svg>
            ${s.address}
          </div>
          <div class="sd-id-tag" style="margin-top:8px;font-size:0.7rem;color:var(--text3);font-family:monospace;cursor:pointer" onclick="copyToClipboard('${s.id}')" title="Click to copy Station ID">
            ID: ${s.id} <svg style="width:10px;height:10px;margin-left:4px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </div>
        </div>
        <div class="sd-stats">
          <div class="sd-stat"><div class="sd-stat-val">${avail}</div><div class="sd-stat-lbl">Available</div></div>
          <div class="sd-stat"><div class="sd-stat-val">${s.power_kw}kW</div><div class="sd-stat-lbl">Max Power</div></div>
          <div class="sd-stat"><div class="sd-stat-val">₹${s.price_per_kwh}</div><div class="sd-stat-lbl">Per kWh</div></div>
          <div class="sd-stat"><div class="sd-stat-val">${s.avg_wait_minutes}m</div><div class="sd-stat-lbl">Wait Time</div></div>
        </div>
        <div class="sd-section">
          <div class="sd-section-title">Occupancy</div>
          <div style="display:flex;align-items:center;gap:10px">
            <div class="occupancy-bar" style="flex:1"><div class="occupancy-fill" style="width:${pct}%;background:${fillColor}"></div></div>
            <span style="font-size:.8rem;color:var(--text2)">${pct}% full</span>
          </div>
        </div>
        <div class="sd-section">
          <div class="sd-section-title">Charger Types</div>
          <div class="charger-chips">${chargerChips}</div>
        </div>
        <div class="sd-section">
          <div class="sd-section-title">Amenities</div>
          <div class="amenity-list">${amenityItems}</div>
        </div>
        <div class="sd-section">
          <div class="sd-section-title">Operator</div>
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span>
              <span style="font-size:.9rem;font-weight:600">${s.operator}</span>
              <span style="font-size:.8rem;color:var(--warning);margin-left:8px">★ ${s.rating}</span>
            </span>
            <button class="btn-manager-link" onclick="goToManagerRegistration('${s.id}')" style="font-size:0.7rem;padding:4px 8px;border-radius:6px;background:rgba(59,130,246,0.1);color:var(--primary);border:1px solid rgba(59,130,246,0.2);cursor:pointer">
              Manage this Station
            </button>
          </div>
        </div>
        <div class="sd-actions">
          <button class="btn-primary" onclick="openBookingModal('${s.id}')" ${avail === 0 ? 'disabled style="opacity:.5;cursor:not-allowed"' : ''}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            ${avail === 0 ? 'Station Full' : 'Book Slot'}
          </button>
          <button class="btn-secondary" onclick="navigateToStation(${s.latitude},${s.longitude})">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
            Navigate
          </button>
        </div>
      </div>`;

    const panel = document.getElementById('station-detail');
    panel.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');
    map.setView([s.latitude, s.longitude], 14);
    // Draw actual road route if user location is known
    drawRoadRoute(s.latitude, s.longitude);
  } catch (err) {
    console.error('Station detail error:', err);
    showToast('Failed to load station details', 'error');
  }
}

function closeStationDetail() {
  const panel = document.getElementById('station-detail');
  panel.classList.remove('open');
  panel.setAttribute('aria-hidden', 'true');
  document.querySelectorAll('.station-card').forEach(c => c.classList.remove('selected'));
  if (routeLayer) { routeLayer.remove(); routeLayer = null; }
}

function navigateToStation(lat, lng) {
  window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`, '_blank');
}

// ── Road Route (OSRM free routing) ─────────────────────────────
async function drawRoadRoute(sLat, sLng) {
  if (routeLayer) { routeLayer.remove(); routeLayer = null; }
  if (!userLat || !userLng) return; // need user location
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${userLng},${userLat};${sLng},${sLat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.code !== 'Ok' || !data.routes[0]) return;
    const geojson = data.routes[0].geometry;
    const distKm = (data.routes[0].distance / 1000).toFixed(1);
    const durMin = Math.round(data.routes[0].duration / 60);
    routeLayer = L.geoJSON(geojson, {
      style: { color: '#3B82F6', weight: 4, opacity: 0.85, dashArray: '10 6', lineCap: 'round' }
    }).addTo(map);
    // Fit map to show both user and station
    const bounds = L.latLngBounds([[userLat, userLng], [sLat, sLng]]);
    map.fitBounds(bounds, { padding: [60, 60] });
    showToast(`Route: ${distKm} km · ~${durMin} min drive`, 'info');
  } catch {
    // OSRM unavailable — silently skip, navigation still works via Google Maps
  }
}

// ── Booking Modal ──────────────────────────────────────────────
async function openBookingModal(stationId) {
  const s = allStations.find(x => x.id === stationId) || selectedStation;
  document.getElementById('modal-station-name').textContent = s.name;
  closeStationDetail();
  document.getElementById('booking-modal').classList.add('open');

  const today = new Date().toISOString().split('T')[0];
  document.getElementById('modal-body').innerHTML = `
    <div class="form-group">
      <label class="form-label" for="book-date">Select Date</label>
      <input class="form-control" type="date" id="book-date" min="${today}" value="${today}" onchange="loadSlots('${stationId}')">
    </div>
    <div class="form-group">
      <label class="form-label">Select Time Slot</label>
      <div class="slot-grid" id="slot-grid"><div class="loading-text">Loading slots…</div></div>
    </div>
    <div class="form-group">
      <label class="form-label" for="book-charger">Charger Type</label>
      <select class="form-control" id="book-charger">
        ${ensureArray(s.charger_types).map(c => `<option value="${c}">${c}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label class="form-label" for="book-duration">Duration (hours)</label>
      <select class="form-control" id="book-duration" onchange="updatePriceSummary(${s.price_per_kwh})">
        <option value="1">1 hour</option>
        <option value="2">2 hours</option>
        <option value="3">3 hours</option>
        <option value="4">4 hours</option>
      </select>
    </div>
    <div class="price-summary" id="price-summary">
      <div class="price-row"><span>Charging rate</span><span>₹${s.price_per_kwh}/kWh</span></div>
      <div class="price-row"><span>Estimated energy</span><span>~7.4 kWh/hr</span></div>
      <div class="price-row"><span>Duration</span><span id="ps-dur">1 hour</span></div>
      <div class="price-row"><span>Total Estimate</span><span id="ps-total">₹${(s.price_per_kwh * 7.4).toFixed(0)}</span></div>
    </div>
    <button class="btn-primary" style="width:100%;justify-content:center" onclick="confirmBooking('${stationId}')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
      Confirm Booking
    </button>`;

  loadSlots(stationId);
}

async function loadSlots(stationId) {
  const date = document.getElementById('book-date').value;
  selectedSlot = null;
  const grid = document.getElementById('slot-grid');
  grid.innerHTML = '<div class="loading-text">Loading…</div>';
  try {
    const res = await fetch(`${API}/stations/${stationId}/slots?date=${date}`);
    const data = await res.json();
    grid.innerHTML = data.slots.map(slot => {
      const disabled = slot.available === 0 ? 'disabled' : '';
      const peakClass = slot.is_peak ? 'peak' : '';
      return `<button class="slot-btn ${peakClass}" ${disabled}
        onclick="selectSlot(this, '${slot.time}', ${slot.available === 0})">
        ${slot.display}
        <div class="slot-avail">${slot.available > 0 ? `${slot.available} left` : 'Full'}</div>
      </button>`;
    }).join('');
  } catch {
    grid.innerHTML = '<div class="loading-text">Failed to load slots</div>';
  }
}

function selectSlot(btn, time, full) {
  if (full) return;
  document.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  selectedSlot = time;
}

function updatePriceSummary(pricePerKwh) {
  const dur = parseFloat(document.getElementById('book-duration').value);
  document.getElementById('ps-dur').textContent = `${dur} hour${dur > 1 ? 's' : ''}`;
  document.getElementById('ps-total').textContent = `₹${(pricePerKwh * 7.4 * dur).toFixed(0)}`;
}

async function confirmBooking(stationId) {
  if (!selectedSlot) { showToast('Please select a time slot', 'error'); return; }
  const charger = document.getElementById('book-charger').value;
  const duration = parseFloat(document.getElementById('book-duration').value);
  const s = allStations.find(x => x.id === stationId) || selectedStation;
  const amount = Math.round(s.price_per_kwh * 7.4 * duration);

  // Store slot in pendingBookingData BEFORE closeBookingModal nulls selectedSlot
  pendingBookingData = { stationId, charger, duration, station: s, amount, slotTime: selectedSlot };
  closeBookingModal();
  openPaymentModal(amount);
}

// ── Post-Booking Receipt Modal ─────────────────────────────────
function showNavModal(station, slotTime, booking, txHash) {
  const dt = new Date(slotTime);
  const timeStr = dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  const dateStr = dt.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
  const bookingId = booking ? booking.id.substring(0, 8).toUpperCase() : '--------';
  const amount = booking ? `₹${Math.round(booking.amount + 5)}` : '';
  const gmapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${station.latitude},${station.longitude}&travelmode=driving`;

  document.getElementById('nav-modal-title').textContent = 'Booking Confirmed!';
  document.getElementById('nav-modal-sub').textContent = `Booking ID: #${bookingId}`;
  document.getElementById('nav-modal-station').textContent = station.name;
  document.getElementById('nav-modal-addr').textContent = `${dateStr} at ${timeStr}`;
  document.getElementById('nav-modal-gmaps').href = gmapsUrl;

  // Receipt detail
  let detail = document.getElementById('receipt-detail');
  if (!detail) {
    detail = document.createElement('div');
    detail.id = 'receipt-detail';
    detail.style.cssText = 'margin-top:12px;padding:12px 14px;border-radius:10px;background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.2);font-size:.85rem';
    document.getElementById('nav-modal-card').insertAdjacentElement('afterend', detail);
  }

  let receiptHtml = `<div style="display:flex;justify-content:space-between;margin-bottom:6px"><span style="color:var(--text2)">Amount Paid</span><span style="font-weight:800;color:var(--success)">${amount}</span></div>`;

  if (txHash) {
    const short = txHash.slice(0, 10) + '...' + txHash.slice(-8);
    const etherscanUrl = `https://sepolia.etherscan.io/tx/${txHash}`;
    receiptHtml += `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;padding-top:8px;border-top:1px solid rgba(16,185,129,.2)">
        <span style="color:var(--text2);display:flex;align-items:center;gap:6px">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#F6851B" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
          Tx Hash
        </span>
        <a href="${etherscanUrl}" target="_blank" style="color:#F6851B;font-weight:700;font-family:monospace;font-size:.78rem;text-decoration:none" title="${txHash}">${short} ↗</a>
      </div>
      <div style="margin-top:6px;font-size:.75rem;color:var(--text3);text-align:center">
        Verified on Sepolia Blockchain · <a href="${etherscanUrl}" target="_blank" style="color:#F6851B">View on Etherscan</a>
      </div>`;
  }

  detail.innerHTML = receiptHtml;
  const modal = document.getElementById('nav-modal');
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
}

function closeNavModal(e) {
  if (e.target.id === 'nav-modal') document.getElementById('nav-modal').classList.remove('open');
}

function closeBookingModal() {
  document.getElementById('booking-modal').classList.remove('open');
  selectedSlot = null;
}
function closeModal(e) { if (e.target.id === 'booking-modal') closeBookingModal(); }

// ── Bookings Page ──────────────────────────────────────────────
async function loadBookings() {
  const res = await fetch(`${API}/bookings?user_id=${DEMO_USER}`);
  const data = await res.json();
  const bookings = data.bookings;

  const confirmed = bookings.filter(b => b.status === 'confirmed').length;
  const totalSpent = bookings.filter(b => b.status !== 'cancelled').reduce((s, b) => s + b.amount, 0);
  document.getElementById('booking-stats-row').innerHTML = `
    <div class="bstat-card"><div class="bstat-val">${bookings.length}</div><div class="bstat-lbl">Total Bookings</div></div>
    <div class="bstat-card"><div class="bstat-val">${confirmed}</div><div class="bstat-lbl">Upcoming</div></div>
    <div class="bstat-card"><div class="bstat-val">₹${Math.round(totalSpent)}</div><div class="bstat-lbl">Total Spent</div></div>`;

  const grid = document.getElementById('bookings-grid');
  if (!bookings.length) {
    grid.innerHTML = `<div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:52px;height:52px;margin-bottom:14px;color:var(--text3)"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/></svg>
      <h3>No bookings yet</h3>
      <p>Find a station and book your first charging slot!</p>
      <button class="btn-primary" style="margin-top:18px;justify-content:center" onclick="showPage('map')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1118 0z"/><circle cx="12" cy="10" r="3"/></svg>
        Find a Station
      </button>
    </div>`;
    return;
  }

  grid.innerHTML = bookings.map(b => {
    const dt = new Date(b.slot_time);
    const dateStr = dt.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
    const timeStr = dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    const cancelBtn = b.status === 'confirmed' ? `<button class="btn-danger" onclick="cancelBooking('${b.id}')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Cancel</button>` : '';
    const navBtn = b.status === 'confirmed' ? `<button class="btn-secondary" style="padding:8px 14px;font-size:.8rem" onclick="navigateToStation(${b.latitude},${b.longitude})">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>Navigate</button>` : '';
    return `<div class="booking-card ${b.status}">
      <div class="bc-left">
        <div class="bc-station">${b.station_name}</div>
        <div class="bc-meta">
          <span class="bc-chip"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></svg>${dateStr} at ${timeStr}</span>
          <span class="bc-chip"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>${b.charger_type} · ${b.duration_hours}hr</span>
        </div>
        <div style="display:flex;gap:8px;margin-top:6px">${cancelBtn}${navBtn}</div>
      </div>
      <div class="bc-right">
        <span class="bc-status ${b.status}">${b.status.charAt(0).toUpperCase() + b.status.slice(1)}</span>
        <span class="bc-amount">₹${b.amount.toFixed(0)}</span>
      </div>
    </div>`;
  }).join('');
}

async function cancelBooking(id) {
  try {
    const res = await fetch(`${API}/bookings/${id}/cancel`, { method: 'PATCH' });
    const data = await res.json();
    if (!data.success) throw new Error(data.message);
    showToast('Booking cancelled', 'info');
    loadBookings();
    loadStations(userLat, userLng);
  } catch (e) {
    showToast(e.message || 'Cancel failed', 'error');
  }
}

// ── Page Nav ───────────────────────────────────────────────────
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  
  const page = document.getElementById(`page-${name}`);
  if (page) page.classList.add('active');
  
  const nl = document.getElementById(`nav-${name}`);
  if (nl) nl.classList.add('active');
  
  if (name === 'bookings') loadBookings();
  if (name === 'dashboard') initDashboard();
  if (name === 'leaderboard') loadLeaderboard();
  if (name === 'profile') loadUserProfile();
  if (name === 'map' && map) setTimeout(() => map.invalidateSize(), 100);
  
  // Close station detail panel when navigating away from map
  if (name !== 'map') closeStationDetail();
  
  // Hide hero if navigating to any page
  document.getElementById('hero-section').style.display = 'none';
}

/** ── Dashboard Logic ── **/
let energyChart = null;

async function initDashboard() {
  // Show loading skeleton if needed
  const kpis = ['energy', 'savings', 'co2'];
  kpis.forEach(id => document.getElementById(`kpi-${id}`).innerText = '...');
  
  try {
    // 1. Fetch data from Claude's new endpoint (with local mock fallback)
    let data;
    try {
      const res = await fetch(`${API}/user/insights`, {
        headers: { 'x-session-token': localStorage.getItem('evpath_session') }
      });
      const json = await res.json();
      data = json.success ? json.data : getMockInsights();
    } catch(e) {
      data = getMockInsights();
    }

    // 2. Animate KPI numbers
    animateValue('kpi-energy', 0, data.total_kwh, 1500, ' kWh');
    animateValue('kpi-savings', 0, data.total_spent, 1500, '₹', true);
    animateValue('kpi-co2', 0, data.total_co2, 1500, ' kg');

    // 3. Render Chart
    initEnergyCharts(data.history);

  } catch (err) {
    console.error('Dashboard init failed:', err);
  }
}

function animateValue(id, start, end, duration, suffix = '', prefix = false) {
  const obj = document.getElementById(id);
  let startTimestamp = null;
  const step = (timestamp) => {
    if (!startTimestamp) startTimestamp = timestamp;
    const progress = Math.min((timestamp - startTimestamp) / duration, 1);
    const val = (progress * (end - start) + start).toFixed(id === 'kpi-savings' ? 0 : 1);
    obj.innerHTML = prefix ? suffix + val : val + suffix;
    if (progress < 1) {
      window.requestAnimationFrame(step);
    }
  };
  window.requestAnimationFrame(step);
}

function initEnergyCharts(history) {
  const options = {
    series: [{
      name: 'Energy Consumed',
      data: history.map(h => h.kwh)
    }],
    chart: {
      type: 'area',
      height: 350,
      toolbar: { show: false },
      background: 'transparent',
      foreColor: '#94a3b8'
    },
    colors: ['#3B82F6'],
    dataLabels: { enabled: false },
    stroke: { curve: 'smooth', width: 3 },
    fill: {
      type: 'gradient',
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.45,
        opacityTo: 0.05,
        stops: [20, 100]
      }
    },
    grid: { borderColor: 'rgba(255,255,255,0.05)', strokeDashArray: 4 },
    xaxis: {
      categories: history.map(h => h.month),
      axisBorder: { show: false },
    }
  };

  if (energyChart) energyChart.destroy();
  energyChart = new ApexCharts(document.querySelector("#energy-chart"), options);
  energyChart.render();
}

/** ── Leaderboard Logic ── **/
async function loadLeaderboard() {
  const list = document.getElementById('leaderboard-list');
  try {
    const res = await fetch(`${API}/leaderboard`, {
      headers: { 'x-session-token': localStorage.getItem('evpath_session') }
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    list.innerHTML = data.leaderboard.map((user, idx) => `
      <div class="leaderboard-row">
        <div class="rank-number">${idx + 1}</div>
        <div class="leaderboard-user">
          <img src="${user.avatar_url || 'https://ui-avatars.com/api/?name='+user.username}" class="leaderboard-avatar">
          <div class="leaderboard-name">${user.username}</div>
        </div>
        <div class="leaderboard-points">
          <span class="lb-val">${user.co2_saved_kg.toFixed(1)}</span>
          <span class="lb-lbl">kg CO2</span>
        </div>
      </div>
    `).join('');
  } catch (err) {
    list.innerHTML = '<div class="error-text">Failed to load leaderboard.</div>';
  }
}

/** ── Profile Logic ── **/
async function loadUserProfile() {
  try {
    const res = await fetch(`${API}/profile`, {
      headers: { 'x-session-token': localStorage.getItem('evpath_session') }
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    const profile = data.profile;
    document.getElementById('profile-name').innerText = profile.username;
    document.getElementById('profile-car').innerText = profile.car_model || 'EV Enthusiast';
    document.getElementById('profile-avatar').src = profile.avatar_url || `https://ui-avatars.com/api/?name=${profile.username}&background=00ff88&color=0a0a0a`;
    document.getElementById('profile-level').innerText = `Lv. ${profile.level || 1}`;
    
    animateValue('stat-points', 0, profile.green_points, 1000);
    animateValue('stat-co2', 0, profile.co2_saved_kg, 1000);

    renderAchievements(data.achievements);
  } catch (err) {
    console.error('Profile load error:', err);
  }
}

function renderAchievements(achievements) {
  const container = document.getElementById('profile-achievements');
  const allBadges = [
    { type: 'FIRST_CHARGE', title: 'Pioneer', icon: '⚡' },
    { type: 'CO2_WARRIOR', title: 'Eco Hero', icon: '🌿' },
    { type: 'NIGHT_OWL', title: 'Night Owl', icon: '🌙' },
    { type: 'STREAK_7', title: 'Consistency', icon: '🔥' }
  ];

  container.innerHTML = allBadges.map(badge => {
    const isUnlocked = achievements.some(a => a.achievement_type === badge.type);
    return `
      <div class="achievement-item ${isUnlocked ? 'unlocked' : 'locked'}" title="${isUnlocked ? 'Unlocked!' : 'Locked'}">
        <div class="badge-icon">${badge.icon}</div>
        <span>${badge.title}</span>
      </div>
    `;
  }).join('');
}
      axisTicks: { show: false }
    },
    yaxis: { labels: { formatter: (v) => v + ' kWh' } },
    tooltip: { theme: 'dark' }
  };

  if (energyChart) energyChart.destroy();
  energyChart = new ApexCharts(document.querySelector("#energy-chart"), options);
  energyChart.render();
}

function getMockInsights() {
  return {
    total_kwh: 482.4,
    total_spent: 8450,
    total_co2: 124.5,
    history: [
      { month: 'Dec', kwh: 65 },
      { month: 'Jan', kwh: 82 },
      { month: 'Feb', kwh: 74 },
      { month: 'Mar', kwh: 91 },
      { month: 'Apr', kwh: 85 },
      { month: 'May', kwh: 85.4 }
    ]
  };
}

function toggleMobileMenu() {
  const links = document.querySelector('.nav-links');
  links.style.display = links.style.display === 'flex' ? 'none' : 'flex';
}

// ── Vehicle Profile ────────────────────────────────────────────
function openVehicleProfile() {
  const modal = document.getElementById('vehicle-modal');
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  // Pre-fill from saved profile
  if (vehicleProfile) {
    const sel = document.getElementById('v-model');
    const isPreset = [...sel.options].some(o => o.value === vehicleProfile.model);
    sel.value = isPreset ? vehicleProfile.model : 'Other';
    document.getElementById('v-custom').value = vehicleProfile.customModel || '';
    document.getElementById('v-years').value = vehicleProfile.yearsUsed || 0;
    document.getElementById('v-years-val').textContent = vehicleProfile.yearsUsed || 0;
    document.getElementById('v-range').value = vehicleProfile.rangeKm || 300;
    document.getElementById('v-range-val').textContent = vehicleProfile.rangeKm || 300;
    document.getElementById('v-battery').value = vehicleProfile.batteryPct || 80;
    updateBatterySlider(vehicleProfile.batteryPct || 80);
  }
}

function updateBatterySlider(val) {
  const pct = parseInt(val);
  document.getElementById('v-battery-val').textContent = pct;
  const fill = document.getElementById('battery-fill');
  if (fill) {
    fill.style.width = pct + '%';
    fill.style.background = pct <= 20 ? '#EF4444' : pct <= 50 ? '#F59E0B' : '#10B981';
  }
  const warn = document.getElementById('battery-warning');
  if (warn) warn.style.display = pct <= 20 ? 'block' : 'none';
}

function saveVehicleProfile() {
  const modelSel = document.getElementById('v-model').value;
  const custom = document.getElementById('v-custom').value.trim();
  const model = modelSel === 'Other' ? (custom || 'Custom EV') : modelSel;
  if (!model) { showToast('Please select a vehicle model', 'error'); return; }
  vehicleProfile = {
    model,
    customModel: custom,
    yearsUsed: parseInt(document.getElementById('v-years').value),
    rangeKm: parseInt(document.getElementById('v-range').value),
    batteryPct: parseInt(document.getElementById('v-battery').value)
  };
  localStorage.setItem('evpath_vehicle', JSON.stringify(vehicleProfile));
  closeVehicleProfileModal();
  applyVehicleProfileUI();
  showToast(`Vehicle saved: ${model}`, 'success');
}

function applyVehicleProfileUI() {
  const strip = document.getElementById('vehicle-strip');
  if (!vehicleProfile) { strip.style.display = 'none'; return; }
  strip.style.display = 'flex';
  document.getElementById('vehicle-strip-text').textContent = vehicleProfile.model;
  const pct = vehicleProfile.batteryPct || 0;
  const bar = document.getElementById('battery-strip-bar');
  const color = pct <= 20 ? '#EF4444' : pct <= 50 ? '#F59E0B' : '#10B981';
  bar.style.background = `linear-gradient(90deg, ${color} ${pct}%, rgba(255,255,255,.1) ${pct}%)`;
  document.getElementById('vehicle-strip-pct').textContent = pct + '%';
  document.getElementById('vehicle-strip-pct').style.color = color;
  // Pulse strip if low battery
  if (pct <= 20) strip.classList.add('low-battery'); else strip.classList.remove('low-battery');
  
  // Re-render station list to update range-based dimming
  if (allStations && allStations.length > 0) {
    renderStationList(allStations);
  }
}

function closeVehicleProfileModal() {
  document.getElementById('vehicle-modal').classList.remove('open');
}
function closeVehicleModal(e) {
  if (e.target.id === 'vehicle-modal') closeVehicleProfileModal();
}

// ── Toast ──────────────────────────────────────────────────────
function showToast(msg, type = 'info') {
  const icons = {
    success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
  };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `${icons[type]}<span>${msg}</span>`;
  document.getElementById('toast-container').appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

// ── Hero ───────────────────────────────────────────────────────
function startWithLocation() {
  skipHero();
  getUserLocation();
}
function skipHero() {
  const hero = document.getElementById('hero-section');
  const mapPage = document.getElementById('page-map');
  hero.classList.add('hero-exit');
  setTimeout(() => {
    hero.style.display = 'none';
    mapPage.style.display = '';
    mapPage.classList.add('active');
    if (map) map.invalidateSize();
  }, 420);
}
async function loadHeroStats() {
  try {
    const res = await fetch(`${API}/stats`);
    const data = await res.json();
    // API returns data.stats.totalStations / totalSlots
    const s = data.stats || {};
    animateCounter('hstat-stations', s.totalStations || 10);
    animateCounter('hstat-slots', s.totalSlots || 80);
    animateCounter('hstat-cities', 6); // fixed city count from seed data
  } catch {
    animateCounter('hstat-stations', 10);
    animateCounter('hstat-slots', 81);
    animateCounter('hstat-cities', 6);
  }
}
function animateCounter(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  let start = 0;
  const duration = 1500;
  const step = timestamp => {
    if (!start) start = timestamp;
    const progress = Math.min((timestamp - start) / duration, 1);
    el.textContent = Math.round(progress * target) + (progress < 1 ? '' : '+');
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ── Heatmap ────────────────────────────────────────────────────
function toggleHeatmap() {
  const btn = document.getElementById('heatmap-btn');
  if (heatmapOn) {
    heatmapLayers.forEach(l => l.remove());
    heatmapLayers = [];
    heatmapOn = false;
    btn.classList.remove('active');
    showToast('Demand heatmap off', 'info');
  } else {
    allStations.forEach(s => {
      const occ = 1 - (s.available_slots / s.total_slots);
      const color = occ >= 0.7 ? '#EF4444' : occ >= 0.4 ? '#F59E0B' : '#10B981';
      const circle = L.circle([s.latitude, s.longitude], {
        radius: Math.max(occ, 0.1) * 8000,
        fillColor: color, fillOpacity: 0.22,
        color: color, weight: 1, opacity: 0.4
      }).addTo(map);
      heatmapLayers.push(circle);
    });
    heatmapOn = true;
    btn.classList.add('active');
    showToast('Demand heatmap on — red = busy', 'info');
    // AI insight banner
    showAIInsight();
  }
}
function showAIInsight() {
  const existing = document.getElementById('ai-insight-banner');
  if (existing) existing.remove();
  const full = allStations.filter(s => s.available_slots === 0);
  const hour = new Date().getHours();
  let msg;
  if (full.length > 0) msg = `High demand: ${full.length} station(s) fully booked. Reserve early!`;
  else if (hour >= 8 && hour <= 10 || hour >= 17 && hour <= 20) msg = 'Peak hours ahead — book your slot now to skip the queue.';
  else msg = 'Low demand right now — great time to charge at off-peak rates!';
  const banner = document.createElement('div');
  banner.id = 'ai-insight-banner';
  banner.className = 'ai-insight-banner';
  banner.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg><span>${msg}</span><button onclick="this.parentElement.remove()">&#10005;</button>`;
  document.getElementById('station-list').insertAdjacentElement('beforebegin', banner);
}

// ── Live Ticker ────────────────────────────────────────────────
const TICKER_EVENTS = [
  "Tata Nexon EV connected @ Bhopal Central",
  "Ola S1 Pro finished charging @ Indore City",
  "New 120kW Fast Slot available @ MG Road",
  "Ather 450X charging @ 18kW in Gwalior",
  "MG ZS EV charging @ 50kW in Jabalpur",
  "Station 'EcoCharge' now 100% online",
  "Peak demand detected in Bengaluru central",
  "User 'Rahul' just booked @ SpeedCharge",
  "BYD Atto 3 connected @ Highway 44 Plaza"
];

function initLiveTicker() {
  const ticker = document.getElementById('pulse-ticker');
  if (!ticker) return;
  
  let currentIdx = 0;
  
  // Create ticker items
  ticker.innerHTML = TICKER_EVENTS.map(ev => {
    const parts = ev.split('@');
    if (parts.length > 1) {
      return `<div class="ticker-item"><strong>${parts[0].trim()}</strong> <span>@ ${parts[1].trim()}</span></div>`;
    }
    return `<div class="ticker-item">${ev}</div>`;
  }).join('') + `<div class="ticker-item"><strong>Tata Nexon EV</strong> <span>@ Bhopal Central</span></div>`; // loop back item

  setInterval(() => {
    currentIdx++;
    ticker.style.transform = `translateY(-${currentIdx * 20}px)`;
    
    if (currentIdx >= TICKER_EVENTS.length) {
      setTimeout(() => {
        ticker.style.transition = 'none';
        currentIdx = 0;
        ticker.style.transform = `translateY(0)`;
        setTimeout(() => {
          ticker.style.transition = 'transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)';
        }, 50);
      }, 500);
    }
  }, 3500);
}

// ── User Profile Modal ──────────────────────────────────────────────
function openUserProfile() {
  const modal = document.getElementById('user-profile-modal');
  modal.classList.add('open');
}

function closeUserProfile(e) {
  if (e.target.id === 'user-profile-modal') document.getElementById('user-profile-modal').classList.remove('open');
}

async function logoutUser() {
  localStorage.removeItem('ev_session_token');
  localStorage.removeItem('ev_user');
  localStorage.removeItem('evpath_vehicle');

  // Clear Supabase's internal tokens so it doesn't auto-login again
  Object.keys(localStorage).forEach(key => {
    if (key.startsWith('sb-')) {
      localStorage.removeItem(key);
    }
  });

  window.location.href = '/login.html';
}
function updateNavUser() {
  const el = document.getElementById('user-name-nav');
  if (el) el.textContent = DEMO_USER_NAME;
}

// ── Payment Simulation ─────────────────────────────────────────
function openPaymentModal(amount) {
  document.getElementById('pay-base').textContent = `\u20B9${amount}`;
  document.getElementById('pay-total').textContent = `\u20B9${amount + 5}`;
  document.getElementById('pay-amount-sub').textContent = `Charging slot \u2022 \u20B9${amount + 5} due`;
  document.getElementById('pay-btn-text').textContent = `Pay \u20B9${amount + 5}`;
  const modal = document.getElementById('payment-modal');
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
}
function closePaymentModal() {
  document.getElementById('payment-modal').classList.remove('open');
  pendingBookingData = null;
}
function selectPayMethod(el) {
  document.querySelectorAll('.pay-method').forEach(m => m.classList.remove('selected'));
  el.classList.add('selected');
}
async function processPayment() {
  if (!pendingBookingData) return;

  const { stationId, charger, duration, station, slotTime, amount } = pendingBookingData;
  const btn = document.getElementById('pay-btn');
  const txt = document.getElementById('pay-btn-text');
  btn.disabled = true;
  txt.textContent = 'Opening Razorpay...';

  try {
    // Step 1 — Create Razorpay order on backend
    const orderRes = await fetch(`${API}/payment/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-session-token': localStorage.getItem('ev_session_token') },
      body: JSON.stringify({ amount, station_id: stationId, slot_time: slotTime, charger_type: charger, duration_hours: duration })
    });
    const orderData = await orderRes.json();
    if (!orderData.success) throw new Error(orderData.message);

    // Step 2 — Open Razorpay Checkout popup
    await new Promise((resolve, reject) => {
      const rzp = new Razorpay({
        key: orderData.key_id,
        amount: orderData.amount,
        currency: orderData.currency,
        order_id: orderData.order_id,
        name: 'EV PATH',
        description: `Charging slot at ${station.name}`,
        image: 'https://ev-path-awfc.onrender.com/logo.png',
        prefill: {
          name: DEMO_USER_NAME || 'EV User',
          email: '',
          contact: ''
        },
        config: {
          display: {
            // Show GPay/UPI first
            preferences: { show_default_blocks: true }
          }
        },
        theme: { color: '#3B82F6' },
        modal: {
          ondismiss: () => reject(new Error('Payment cancelled'))
        },
        handler: async (response) => {
          // Step 3 — Verify signature on backend → creates booking
          try {
            const verifyRes = await fetch(`${API}/payment/verify`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-session-token': localStorage.getItem('ev_session_token') },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                user_id: DEMO_USER,
                station_id: stationId,
                slot_time: slotTime,
                charger_type: charger,
                duration_hours: duration
              })
            });
            const verifyData = await verifyRes.json();
            if (!verifyData.success) throw new Error('Verification failed');
            resolve(verifyData.booking);
          } catch (e) {
            reject(e);
          }
        }
      });
      rzp.open();
    }).then(booking => {
      document.getElementById('payment-modal').classList.remove('open');
      pendingBookingData = null;
      loadStations(userLat, userLng);
      if (selectedStation) openStationDetail(selectedStation.id);
      showNavModal(station, slotTime, booking, null);
      showToast('✅ Payment successful via Razorpay!', 'success');
    });

  } catch (e) {
    showToast(e.message || 'Payment failed', 'error');
  } finally {
    btn.disabled = false;
    txt.textContent = 'Pay Now';
  }
}


// ── Dark / Light Theme ─────────────────────────────────────────
function initTheme() {
  if (!isDark) document.body.classList.add('light-mode');
  syncThemeIcon();
}
function toggleTheme() {
  isDark = !isDark;
  document.body.classList.toggle('light-mode', !isDark);
  localStorage.setItem('evpath_theme', isDark ? 'dark' : 'light');
  syncThemeIcon();
}
function syncThemeIcon() {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  btn.innerHTML = isDark
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
}

// ── Favourites ─────────────────────────────────────────────────
function toggleFavorite(id, e) {
  e.stopPropagation();
  const wasFav = favorites.has(id);
  if (wasFav) favorites.delete(id); else favorites.add(id);

  // Update UI immediately (optimistic)
  const isFav = favorites.has(id);
  const btn = document.querySelector(`#sc-${id} .fav-btn`);
  if (btn) {
    btn.classList.toggle('active', isFav);
    btn.querySelector('svg').setAttribute('fill', isFav ? 'currentColor' : 'none');
    btn.title = isFav ? 'Remove favourite' : 'Add favourite';
  }

  // Persist to localStorage immediately
  localStorage.setItem('evpath_favs', JSON.stringify([...favorites]));

  // Sync to backend (non-blocking)
  syncFavoritesToBackend();

  showToast(isFav ? 'Added to favourites \u2665' : 'Removed from favourites', 'info');
  if (document.getElementById('filter-favs')?.checked) renderStationList(allStations);
}

// ── Sort ───────────────────────────────────────────────────────
function applySort(val) {
  currentSort = val;
  renderStationList(allStations);
}
function sortStations(stations) {
  const s = [...stations];
  switch (currentSort) {
    case 'distance': return s.sort((a, b) => (a.distance ?? 9999) - (b.distance ?? 9999));
    case 'rating': return s.sort((a, b) => b.rating - a.rating);
    case 'price': return s.sort((a, b) => a.price_per_kwh - b.price_per_kwh);
    case 'available': return s.sort((a, b) => b.available_slots - a.available_slots);
    default: return s;
  }
}

// ── Price Estimator ────────────────────────────────────────────
function openPriceEstimator() {
  if (!selectedStation) { showToast('Select a station first to estimate cost', 'info'); return; }
  const s = selectedStation;
  const vp = vehicleProfile;
  document.getElementById('est-station-name').textContent = s.name;
  document.getElementById('est-rate').textContent = `\u20b9${s.price_per_kwh}/kWh`;
  const cap = document.getElementById('est-capacity');
  cap.value = vp ? Math.round(vp.rangeKm / 6) : 30;
  const fromEl = document.getElementById('est-from');
  fromEl.value = vp ? vp.batteryPct : 20;
  document.getElementById('est-from-val').textContent = fromEl.value;
  document.getElementById('est-to').value = 80;
  document.getElementById('est-to-val').textContent = 80;
  calcEstimate();
  document.getElementById('estimator-modal').classList.add('open');
}
function calcEstimate() {
  if (!selectedStation) return;
  const cap = parseFloat(document.getElementById('est-capacity').value) || 30;
  const from = parseFloat(document.getElementById('est-from').value);
  const to = parseFloat(document.getElementById('est-to').value);
  const kwh = cap * Math.max(0, to - from) / 100;
  const cost = kwh * selectedStation.price_per_kwh;
  const hrs = kwh / 7.4;
  document.getElementById('est-kwh').textContent = kwh.toFixed(1) + ' kWh';
  document.getElementById('est-cost').textContent = '\u20b9' + Math.round(cost + 5);
  document.getElementById('est-hrs').textContent = hrs < 1 ? `~${Math.round(hrs * 60)} min` : `~${hrs.toFixed(1)} hrs`;
}
function closeEstimatorModal() {
  document.getElementById('estimator-modal').classList.remove('open');
}

// ══════════════════════════════════════════════════════════════════
// ── Trip Planner ─────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════
let tripDestLat = null;
let tripDestLng = null;
let tripDestName = '';
let tripRouteLayer = null;
let tripDestMarker = null;
let nominatimTimer = null;
let suggestionsData = [];

// ── 1. Input change → debounced Nominatim search ─────────────────
function onTripInputChange(val) {
  const clearBtn = document.getElementById('tp-clear');
  clearBtn.style.display = val.length > 0 ? 'flex' : 'none';

  clearTimeout(nominatimTimer);
  if (val.length < 3) {
    hideSuggestions();
    return;
  }
  nominatimTimer = setTimeout(() => fetchNominatimSuggestions(val), 400);
}

async function fetchNominatimSuggestions(query) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=6&countrycodes=in&addressdetails=1`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    const data = await res.json();
    suggestionsData = data;
    renderSuggestions(data);
  } catch {
    hideSuggestions();
  }
}

function renderSuggestions(results) {
  const box = document.getElementById('tp-suggestions');
  if (!results.length) { hideSuggestions(); return; }
  box.innerHTML = results.map((r, i) => {
    const icon = r.type === 'fuel' || (r.display_name || '').toLowerCase().includes('charge') ? '⚡' :
      r.class === 'highway' ? '🛣️' :
        r.class === 'railway' ? '🚉' :
          r.class === 'aeroway' ? '✈️' : '📍';
    const parts = r.display_name.split(',');
    const main = parts[0].trim();
    const sub = parts.slice(1, 3).join(',').trim();
    return `<div class="tp-suggestion" onclick="selectSuggestion(${i})" tabindex="0">
      <span class="tp-sug-icon">${icon}</span>
      <div class="tp-sug-text">
        <div class="tp-sug-main">${main}</div>
        <div class="tp-sug-sub">${sub}</div>
      </div>
    </div>`;
  }).join('');
  box.style.display = 'block';
}

function hideSuggestions() {
  document.getElementById('tp-suggestions').style.display = 'none';
}

function selectSuggestion(idx) {
  const r = suggestionsData[idx];
  tripDestLat = parseFloat(r.lat);
  tripDestLng = parseFloat(r.lon);
  tripDestName = r.display_name.split(',')[0].trim();
  document.getElementById('tp-input').value = tripDestName;
  document.getElementById('tp-clear').style.display = 'flex';
  hideSuggestions();
}

// ── 2. Keyboard nav in suggestions ───────────────────────────────
function onTripInputKeydown(e) {
  if (e.key === 'Enter') { confirmTripDestination(); return; }
  if (e.key === 'Escape') { hideSuggestions(); return; }
  const items = document.querySelectorAll('.tp-suggestion');
  if (!items.length) return;
  // arrow nav
  if (e.key === 'ArrowDown') { e.preventDefault(); items[0].focus(); }
}

// ── 3. Confirm — draw route + recommend station ───────────────────
async function confirmTripDestination() {
  hideSuggestions();
  const inputVal = document.getElementById('tp-input').value.trim();

  // If no suggestion was selected, geocode the raw text first
  if (!tripDestLat || !tripDestName || tripDestName !== inputVal) {
    if (!inputVal) { showToast('Enter a destination first', 'error'); return; }
    showToast('Searching for destination…', 'info');
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(inputVal)}&format=json&limit=1&countrycodes=in`, { headers: { 'Accept-Language': 'en' } });
      const data = await res.json();
      if (!data.length) { showToast('Destination not found. Try being more specific.', 'error'); return; }
      tripDestLat = parseFloat(data[0].lat);
      tripDestLng = parseFloat(data[0].lon);
      tripDestName = data[0].display_name.split(',')[0].trim();
      document.getElementById('tp-input').value = tripDestName;
    } catch {
      showToast('Could not geocode destination', 'error');
      return;
    }
  }

  if (!userLat || !userLng) {
    showToast('Getting your location first…', 'info');
    navigator.geolocation.getCurrentPosition(pos => {
      userLat = pos.coords.latitude;
      userLng = pos.coords.longitude;
      if (userMarker) userMarker.remove();
      userMarker = L.circleMarker([userLat, userLng], {
        radius: 10, fillColor: '#3B82F6', color: '#fff', weight: 3, fillOpacity: 1
      }).addTo(map).bindPopup('<b>You are here</b>');
      drawTripRoute();
    }, () => showToast('Location access denied. Enable GPS to plan routes.', 'error'));
    return;
  }

  drawTripRoute();
}

// ── 4. Draw blue route via OSRM + place destination pin ──────────
async function drawTripRoute() {
  // Clean previous trip
  if (tripRouteLayer) { tripRouteLayer.remove(); tripRouteLayer = null; }
  if (tripDestMarker) { tripDestMarker.remove(); tripDestMarker = null; }

  // Destination pin
  const destIcon = L.divIcon({
    html: `<div style="
      background:#EF4444;width:36px;height:36px;border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;
      box-shadow:0 4px 16px rgba(239,68,68,.6);border:2px solid rgba(255,255,255,.4)">
      <svg style="transform:rotate(45deg);width:16px;height:16px;color:#fff"
        viewBox="0 0 24 24" fill="currentColor"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3" fill="#fff"/></svg>
    </div>`,
    className: '', iconSize: [36, 36], iconAnchor: [18, 36], popupAnchor: [0, -40]
  });
  tripDestMarker = L.marker([tripDestLat, tripDestLng], { icon: destIcon })
    .addTo(map)
    .bindPopup(`<div class="popup-content"><h4>🏁 ${tripDestName}</h4><div class="popup-avail" style="color:var(--text2)">Destination</div></div>`);

  document.getElementById('tp-route-chip').style.display = 'flex';
  document.getElementById('tp-route-info').textContent = 'Calculating route…';

  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${userLng},${userLat};${tripDestLng},${tripDestLat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.code !== 'Ok' || !data.routes[0]) throw new Error('No route');

    const geojson = data.routes[0].geometry;
    const distKm = (data.routes[0].distance / 1000).toFixed(1);
    const durMin = Math.round(data.routes[0].duration / 60);
    const durStr = durMin >= 60
      ? `${Math.floor(durMin / 60)}h ${durMin % 60}m`
      : `${durMin} min`;

    // Draw thick blue road route
    tripRouteLayer = L.geoJSON(geojson, {
      style: {
        color: '#3B82F6', weight: 5, opacity: 0.9,
        dashArray: '12 6', lineCap: 'round', lineJoin: 'round'
      }
    }).addTo(map);

    // Fit map to show full route
    const bounds = L.latLngBounds([[userLat, userLng], [tripDestLat, tripDestLng]]);
    map.fitBounds(bounds, { padding: [60, 60] });

    // Update chip
    document.getElementById('tp-route-info').textContent =
      `📍 ${distKm} km  ·  ⏱ ${durStr}  →  ${tripDestName}`;

    // 5. Recommend best station
    recommendStationForTrip(parseFloat(distKm));

  } catch {
    document.getElementById('tp-route-info').textContent = 'Route unavailable — straight-line shown';
    // Fallback: straight line
    tripRouteLayer = L.polyline([[userLat, userLng], [tripDestLat, tripDestLng]], {
      color: '#3B82F6', weight: 4, opacity: 0.7, dashArray: '10 8'
    }).addTo(map);
    map.fitBounds([[userLat, userLng], [tripDestLat, tripDestLng]], { padding: [60, 60] });
    recommendStationForTrip(null);
  }
}

// ── 5. Recommendation engine ──────────────────────────────────────
function recommendStationForTrip(routeDistKm) {
  const rec = document.getElementById('tp-recommendation');

  if (!vehicleProfile || !vehicleProfile.batteryPct || !vehicleProfile.rangeKm) {
    rec.style.display = 'block';
    rec.innerHTML = `<div class="tp-rec-card tp-rec-warn">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <div>
        <div class="tp-rec-title">Set your vehicle profile first</div>
        <div class="tp-rec-sub">We need your battery % and range to recommend a charging stop.</div>
      </div>
      <button class="tp-rec-action" onclick="openVehicleProfile()">Set Vehicle</button>
    </div>`;
    return;
  }

  const battPct = vehicleProfile.batteryPct || 80;
  const rangeKm = vehicleProfile.rangeKm || 300;
  const actualKm = (battPct / 100) * rangeKm;          // real remaining range
  const safeRadius = actualKm * 0.50;                    // 50% of remaining = safe stop zone

  // Filter stations within safeRadius from user, with available slots
  const candidates = allStations
    .filter(s => {
      if (!userLat || !userLng) return true;
      const d = haversineJS(userLat, userLng, s.latitude, s.longitude);
      s._tripDist = d;
      return d <= safeRadius && s.available_slots > 0;
    })
    .sort((a, b) => {
      // prefer fast chargers, then closest, then best rating
      if (b.is_fast_charger !== a.is_fast_charger) return b.is_fast_charger - a.is_fast_charger;
      return a._tripDist - b._tripDist;
    });

  if (!candidates.length) {
    // No stations in safe range — show warning
    rec.style.display = 'block';
    rec.innerHTML = `<div class="tp-rec-card tp-rec-warn">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      <div>
        <div class="tp-rec-title">⚠️ No station in safe range!</div>
        <div class="tp-rec-sub">Your battery (${battPct}%) gives ~${Math.round(actualKm)} km. Safe stop zone: ${Math.round(safeRadius)} km — no available stations found.</div>
      </div>
    </div>`;
    return;
  }

  const best = candidates[0];
  const dist = best._tripDist.toFixed(1);
  const badgeColor = best.is_fast_charger ? 'var(--accent)' : 'var(--success)';
  const badgeLabel = best.is_fast_charger ? '⚡ Fast Charger' : '🔌 AC Charger';
  const reason = best._tripDist < safeRadius * 0.4
    ? 'Nearest station with available slots'
    : 'Best option within your safe range';

  rec.style.display = 'block';
  rec.innerHTML = `
    <div class="tp-rec-card">
      <div class="tp-rec-header">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
        <span>Recommended Charging Stop</span>
        <span class="tp-rec-badge" style="background:rgba(255,255,255,.1);color:${badgeColor}">${badgeLabel}</span>
      </div>
      <div class="tp-rec-name">${best.name}</div>
      <div class="tp-rec-addr">${best.address}</div>
      <div class="tp-rec-stats">
        <div class="tp-rec-stat">
          <div class="tp-rec-stat-val">${dist} km</div>
          <div class="tp-rec-stat-lbl">From you</div>
        </div>
        <div class="tp-rec-stat">
          <div class="tp-rec-stat-val">${best.available_slots}/${best.total_slots}</div>
          <div class="tp-rec-stat-lbl">Slots free</div>
        </div>
        <div class="tp-rec-stat">
          <div class="tp-rec-stat-val">${best.power_kw}kW</div>
          <div class="tp-rec-stat-lbl">Power</div>
        </div>
        <div class="tp-rec-stat">
          <div class="tp-rec-stat-val">★${best.rating}</div>
          <div class="tp-rec-stat-lbl">Rating</div>
        </div>
      </div>
      <div class="tp-rec-why">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
        ${reason} · Safe range: ${Math.round(safeRadius)} km (50% of ${Math.round(actualKm)} km remaining)
      </div>
      <div class="tp-rec-actions">
        <button class="btn-primary" style="flex:1;justify-content:center;font-size:.82rem;padding:10px 14px" onclick="openBookingModal('${best.id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          Book This Station
        </button>
        <button class="btn-secondary" style="padding:10px 14px;font-size:.82rem" onclick="focusRecommendedStation('${best.id}', ${best.latitude}, ${best.longitude})">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          Show on Map
        </button>
      </div>
    </div>`;

  // Highlight the recommended station marker on map
  focusRecommendedMarker(best.id);
}

// ── Helper: haversine in JS (same formula as server) ─────────────
function haversineJS(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Focus recommended marker on map ──────────────────────────────
function focusRecommendedMarker(stationId) {
  // pulse the station card in the sidebar
  const card = document.getElementById(`sc-${stationId}`);
  if (card) {
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    card.classList.add('tp-recommended');
    setTimeout(() => card.classList.remove('tp-recommended'), 3000);
  }
}

function focusRecommendedStation(id, lat, lng) {
  map.setView([lat, lng], 14);
  openStationDetail(id);
}

// ── Clear trip planner ────────────────────────────────────────────
function clearTripPlanner() {
  tripDestLat = null;
  tripDestLng = null;
  tripDestName = '';
  suggestionsData = [];

  if (tripRouteLayer) { tripRouteLayer.remove(); tripRouteLayer = null; }
  if (tripDestMarker) { tripDestMarker.remove(); tripDestMarker = null; }

  document.getElementById('tp-input').value = '';
  document.getElementById('tp-clear').style.display = 'none';
  document.getElementById('tp-route-chip').style.display = 'none';
  document.getElementById('tp-recommendation').style.display = 'none';
  hideSuggestions();
}

// Close suggestions on outside click
document.addEventListener('click', (e) => {
  if (!e.target.closest('#trip-planner')) hideSuggestions();
});

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast('Station ID copied to clipboard!', 'success');
  });
}

function goToManagerRegistration(stationId) {
  localStorage.setItem('ev_intended_role', 'manager');
  localStorage.setItem('ev_prefill_station_id', stationId);
  window.location.href = '/login.html';
}
