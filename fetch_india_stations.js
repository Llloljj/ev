require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
];

async function fetchFromOverpass() {
  console.log('🌐 Fetching EV stations from OpenStreetMap (Overpass API)...');
  
  // Broader tags to ensure we catch everything
  const query = `
    [out:json][timeout:180];
    area(3600304716)->.searchArea;
    (
      node["amenity"~"ev_charging|charging_station"](area.searchArea);
      node["charging_station"](area.searchArea);
      way["amenity"~"ev_charging|charging_station"](area.searchArea);
    );
    out center;
  `;

  for (const mirror of MIRRORS) {
    try {
      console.log(`📡 Trying mirror: ${mirror}`);
      const response = await fetch(mirror, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'EVVoltManager/1.0'
        },
        body: 'data=' + encodeURIComponent(query),
      });

      if (response.ok) {
        const data = await response.json();
        return data.elements || [];
      }
      console.warn(`⚠️ Mirror ${mirror} failed: ${response.status}`);
    } catch (err) {
      console.warn(`⚠️ Mirror ${mirror} error: ${err.message}`);
    }
  }
  return [];
}

function mapOsmToStation(element) {
  const tags = element.tags || {};
  const lat = element.lat || (element.center ? element.center.lat : 0);
  const lon = element.lon || (element.center ? element.center.lon : 0);
  
  if (!lat || !lon) return null;

  const name = tags.name || tags.operator || `EV Station (${element.id})`;
  const address = tags['addr:full'] || tags['addr:street'] || tags['addr:city'] || 'India';
  
  // Dynamic details generation
  const total_slots = Math.floor(Math.random() * 6) + 2; // 2-8 slots
  const available_slots = Math.floor(Math.random() * (total_slots + 1));
  const price_per_kwh = (Math.random() * 6 + 10).toFixed(1); // ₹10.0 - ₹16.0
  const avg_wait = available_slots === 0 ? Math.floor(Math.random() * 30) + 10 : 0;
  
  const allAmenities = ['Parking', 'WiFi', 'Cafe', 'Restroom', 'Mall', 'Petrol Station'];
  const stationAmenities = ['Parking'];
  if (Math.random() > 0.5) stationAmenities.push(allAmenities[Math.floor(Math.random() * (allAmenities.length - 1)) + 1]);
  if (Math.random() > 0.8) stationAmenities.push(allAmenities[Math.floor(Math.random() * (allAmenities.length - 1)) + 1]);

  const chargerTypes = ['CCS2'];
  if (Math.random() > 0.7) chargerTypes.push('Type2');
  if (Math.random() > 0.9) chargerTypes.push('CHAdeMO');

  return {
    id: uuidv4(),
    name: name.substring(0, 200),
    address: address.substring(0, 500),
    latitude: lat,
    longitude: lon,
    charger_types: [...new Set(chargerTypes)],
    total_slots: total_slots,
    available_slots: available_slots,
    price_per_kwh: parseFloat(price_per_kwh),
    avg_wait_minutes: avg_wait,
    amenities: [...new Set(stationAmenities)],
    rating: parseFloat((Math.random() * 2 + 3).toFixed(1)), // 3.0 - 5.0
    operator: (tags.operator || 'Independent').substring(0, 100),
    power_kw: Math.random() > 0.5 ? 60 : 30,
    is_fast_charger: true
  };
}

async function main() {
  const osmElements = await fetchFromOverpass();
  if (osmElements.length === 0) {
    console.error('❌ All mirrors failed or returned no data.');
    return;
  }
  
  console.log(`📊 Found ${osmElements.length} elements. Processing...`);

  const uniqueStations = [];
  const seen = new Set();

  for (const el of osmElements) {
    const station = mapOsmToStation(el);
    if (!station) continue;

    const key = `${station.latitude.toFixed(4)}|${station.longitude.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueStations.push(station);
  }

  console.log(`💎 ${uniqueStations.length} unique stations. Uploading in chunks...`);

  const CHUNK_SIZE = 100;
  for (let i = 0; i < uniqueStations.length; i += CHUNK_SIZE) {
    const chunk = uniqueStations.slice(i, i + CHUNK_SIZE);
    const { error } = await supabase.from('stations').insert(chunk);
    if (error) console.error(`❌ Chunk ${i} Error:`, error.message);
    else console.log(`✅ Chunk ${i/CHUNK_SIZE + 1} uploaded.`);
  }

  console.log('✨ Success!');
}

main();
