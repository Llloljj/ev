require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing Supabase environment variables.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const stations = [
  {
    id: 'f941f173-7c15-4a64-9844-3b2d1d1f0001',
    name: 'Tata Power EZ Charge - Connaught Place',
    address: 'Block E, Connaught Place, New Delhi 110001',
    latitude: 28.6328, longitude: 77.2197,
    charger_types: JSON.stringify(['CCS2', 'Type2']),
    total_slots: 6, available_slots: 4, price_per_kwh: 16.0, avg_wait_minutes: 5,
    amenities: JSON.stringify(['Parking', 'WiFi', 'Cafe']), rating: 4.5,
    operator: 'Tata Power', power_kw: 50, is_fast_charger: true
  },
  {
    id: 'f941f173-7c15-4a64-9844-3b2d1d1f0002',
    name: 'Statiq - DLF Avenue Mall',
    address: 'Saket District Centre, Sector 6, Pushp Vihar, New Delhi 110017',
    latitude: 28.5284, longitude: 77.2193,
    charger_types: JSON.stringify(['CCS2']),
    total_slots: 4, available_slots: 2, price_per_kwh: 18.0, avg_wait_minutes: 15,
    amenities: JSON.stringify(['Mall', 'Parking', 'WiFi']), rating: 4.2,
    operator: 'Statiq', power_kw: 60, is_fast_charger: true
  },
  {
    id: 'f941f173-7c15-4a64-9844-3b2d1d1f0003',
    name: 'Jio-bp Pulse - IGI Airport T3',
    address: 'Terminal 3, IGI Airport, New Delhi 110037',
    latitude: 28.5562, longitude: 77.1000,
    charger_types: JSON.stringify(['CCS2', 'CHAdeMO']),
    total_slots: 8, available_slots: 6, price_per_kwh: 20.0, avg_wait_minutes: 0,
    amenities: JSON.stringify(['Airport', 'Parking', 'WiFi', 'Cafe']), rating: 4.8,
    operator: 'Jio-bp Pulse', power_kw: 120, is_fast_charger: true
  },
  {
    id: 'f941f173-7c15-4a64-9844-3b2d1d1f0004',
    name: 'Adani Total Gas - BKC G Block',
    address: 'G Block, Bandra Kurla Complex, Mumbai 400051',
    latitude: 19.0596, longitude: 72.8685,
    charger_types: JSON.stringify(['CCS2']),
    total_slots: 5, available_slots: 3, price_per_kwh: 17.5, avg_wait_minutes: 10,
    amenities: JSON.stringify(['Parking', 'Restroom']), rating: 4.0,
    operator: 'Adani Total Gas', power_kw: 60, is_fast_charger: true
  },
  {
    id: 'f941f173-7c15-4a64-9844-3b2d1d1f0005',
    name: 'Tata Power EZ Charge - Marine Drive',
    address: 'Netaji Subhash Chandra Bose Rd, Marine Drive, Mumbai 400020',
    latitude: 18.9438, longitude: 72.8236,
    charger_types: JSON.stringify(['CCS2', 'Type2']),
    total_slots: 4, available_slots: 1, price_per_kwh: 19.0, avg_wait_minutes: 20,
    amenities: JSON.stringify(['Parking', 'View']), rating: 4.6,
    operator: 'Tata Power', power_kw: 25, is_fast_charger: true
  },
  {
    id: 'f941f173-7c15-4a64-9844-3b2d1d1f0006',
    name: 'Ather Grid - Indiranagar',
    address: '100 Feet Rd, HAL 2nd Stage, Indiranagar, Bengaluru 560038',
    latitude: 12.9719, longitude: 77.6412,
    charger_types: JSON.stringify(['LECCS']),
    total_slots: 4, available_slots: 4, price_per_kwh: 8.0, avg_wait_minutes: 0,
    amenities: JSON.stringify(['Parking', 'Cafe']), rating: 4.9,
    operator: 'Ather Grid', power_kw: 3, is_fast_charger: false
  },
  {
    id: 'f941f173-7c15-4a64-9844-3b2d1d1f0007',
    name: 'BESCOM EV Station - Vidhana Soudha',
    address: 'Ambedkar Veedhi, Sampangi Rama Nagar, Bengaluru 560001',
    latitude: 12.9796, longitude: 77.5906,
    charger_types: JSON.stringify(['CCS2', 'Type2', 'GB/T']),
    total_slots: 10, available_slots: 8, price_per_kwh: 12.0, avg_wait_minutes: 5,
    amenities: JSON.stringify(['Parking', 'Public Office']), rating: 4.1,
    operator: 'BESCOM', power_kw: 50, is_fast_charger: true
  },
  {
    id: 'f941f173-7c15-4a64-9844-3b2d1d1f0008',
    name: 'Zeon Charging - Electronic City Phase 1',
    address: 'Hosur Rd, Electronic City, Bengaluru 560100',
    latitude: 12.8452, longitude: 77.6632,
    charger_types: JSON.stringify(['CCS2']),
    total_slots: 6, available_slots: 5, price_per_kwh: 15.0, avg_wait_minutes: 0,
    amenities: JSON.stringify(['Parking', 'WiFi', 'Cafe']), rating: 4.7,
    operator: 'Zeon Charging', power_kw: 60, is_fast_charger: true
  },
  {
    id: 'f941f173-7c15-4a64-9844-3b2d1d1f0009',
    name: 'Statig - Gachibowli DLF',
    address: 'DLF Cyber City, Gachibowli, Hyderabad 500032',
    latitude: 17.4483, longitude: 78.3488,
    charger_types: JSON.stringify(['CCS2']),
    total_slots: 4, available_slots: 2, price_per_kwh: 14.5, avg_wait_minutes: 15,
    amenities: JSON.stringify(['Parking', 'Food Court']), rating: 4.3,
    operator: 'Statiq', power_kw: 50, is_fast_charger: true
  },
  {
    id: 'f941f173-7c15-4a64-9844-3b2d1d1f0010',
    name: 'ChargeZone - HITEC City',
    address: 'Mindspace IT Park, HITEC City, Hyderabad 500081',
    latitude: 17.4435, longitude: 78.3772,
    charger_types: JSON.stringify(['CCS2', 'Type2']),
    total_slots: 6, available_slots: 6, price_per_kwh: 15.5, avg_wait_minutes: 0,
    amenities: JSON.stringify(['Parking', 'WiFi']), rating: 4.5,
    operator: 'ChargeZone', power_kw: 60, is_fast_charger: true
  },
  {
    id: 'f941f173-7c15-4a64-9844-3b2d1d1f0011',
    name: 'Tata Power EZ Charge - T Nagar',
    address: 'Sir Thyagaraya Rd, Pondy Bazaar, T. Nagar, Chennai 600017',
    latitude: 13.0418, longitude: 80.2341,
    charger_types: JSON.stringify(['CCS2']),
    total_slots: 3, available_slots: 1, price_per_kwh: 16.5, avg_wait_minutes: 20,
    amenities: JSON.stringify(['Shopping', 'Parking']), rating: 3.9,
    operator: 'Tata Power', power_kw: 25, is_fast_charger: true
  },
  {
    id: 'f941f173-7c15-4a64-9844-3b2d1d1f0012',
    name: 'Relux Electric - OMR Navallur',
    address: 'Rajiv Gandhi Salai, Navallur, Chennai 603103',
    latitude: 12.8465, longitude: 80.2260,
    charger_types: JSON.stringify(['CCS2', 'Type2']),
    total_slots: 5, available_slots: 5, price_per_kwh: 14.0, avg_wait_minutes: 0,
    amenities: JSON.stringify(['Parking', 'Restroom', 'Cafe']), rating: 4.4,
    operator: 'Relux Electric', power_kw: 60, is_fast_charger: true
  },
  {
    id: 'f941f173-7c15-4a64-9844-3b2d1d1f0013',
    name: 'Statiq - Amanora Mall',
    address: 'Hadapsar-Kharadi Bypass Rd, Pune 411028',
    latitude: 18.5204, longitude: 73.9367,
    charger_types: JSON.stringify(['CCS2']),
    total_slots: 4, available_slots: 2, price_per_kwh: 16.0, avg_wait_minutes: 10,
    amenities: JSON.stringify(['Mall', 'Parking', 'WiFi']), rating: 4.6,
    operator: 'Statiq', power_kw: 50, is_fast_charger: true
  },
  {
    id: 'f941f173-7c15-4a64-9844-3b2d1d1f0014',
    name: 'Tata Power EZ Charge - Hinjewadi Phase 1',
    address: 'Rajiv Gandhi Infotech Park, Hinjewadi, Pune 411057',
    latitude: 18.5913, longitude: 73.7389,
    charger_types: JSON.stringify(['CCS2', 'Type2']),
    total_slots: 6, available_slots: 4, price_per_kwh: 15.0, avg_wait_minutes: 5,
    amenities: JSON.stringify(['Parking', 'Cafe']), rating: 4.2,
    operator: 'Tata Power', power_kw: 30, is_fast_charger: true
  },
  {
    id: 'f941f173-7c15-4a64-9844-3b2d1d1f0015',
    name: 'Tata Power EZ Charge - Salt Lake Sector V',
    address: 'Sector V, Salt Lake, Kolkata 700091',
    latitude: 22.5735, longitude: 88.4331,
    charger_types: JSON.stringify(['CCS2']),
    total_slots: 4, available_slots: 3, price_per_kwh: 14.0, avg_wait_minutes: 5,
    amenities: JSON.stringify(['Parking', 'WiFi']), rating: 4.3,
    operator: 'Tata Power', power_kw: 50, is_fast_charger: true
  },
  {
    id: 'f941f173-7c15-4a64-9844-3b2d1d1f0016',
    name: 'ChargeZone - SG Highway',
    address: 'Sarkhej - Gandhinagar Hwy, Ahmedabad 380054',
    latitude: 23.0524, longitude: 72.5117,
    charger_types: JSON.stringify(['CCS2']),
    total_slots: 4, available_slots: 4, price_per_kwh: 13.5, avg_wait_minutes: 0,
    amenities: JSON.stringify(['Parking', 'Cafe']), rating: 4.7,
    operator: 'ChargeZone', power_kw: 60, is_fast_charger: true
  },
  {
    id: 'f941f173-7c15-4a64-9844-3b2d1d1f0017',
    name: 'Statiq - Vijay Nagar',
    address: 'Vijay Nagar Square, Indore 452010',
    latitude: 22.7533, longitude: 75.8937,
    charger_types: JSON.stringify(['CCS2']),
    total_slots: 3, available_slots: 1, price_per_kwh: 13.0, avg_wait_minutes: 15,
    amenities: JSON.stringify(['Parking', 'Restroom']), rating: 4.1,
    operator: 'Statiq', power_kw: 30, is_fast_charger: true
  }
];

async function seed() {
  console.log(`🚀 Starting seed process for ${stations.length} stations across India...`);
  
  const { data, error } = await supabase
    .from('stations')
    .upsert(stations, { onConflict: 'id' });

  if (error) {
    console.error('❌ Error seeding stations:', error.message);
  } else {
    console.log('✅ Successfully seeded India-wide EV stations!');
  }
}

seed();
