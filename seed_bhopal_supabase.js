require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing Supabase credentials in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const bhopalStations = [
  {
    name: 'Tata Power EV - Govindpura',
    address: '56-57 Govindpura, Sector A, JK Road, Bhopal 462023',
    latitude: 23.2602, longitude: 77.4648,
    charger_types: ['CHAdeMO', 'CCS2'],
    total_slots: 4, available_slots: 2, price_per_kwh: 14.0, avg_wait_minutes: 15,
    amenities: ['Parking', 'WiFi'], rating: 3.7,
    operator: 'Tata Power EV', power_kw: 25, is_fast_charger: true
  },
  {
    name: 'Statiq - CI Hyundai Showroom',
    address: 'Service Road, New Market, Bhopal 462023',
    latitude: 23.2303, longitude: 77.4300,
    charger_types: ['CCS2'],
    total_slots: 2, available_slots: 1, price_per_kwh: 13.5, avg_wait_minutes: 10,
    amenities: ['Parking', 'Restroom'], rating: 4.0,
    operator: 'Statiq', power_kw: 60, is_fast_charger: true
  },
  {
    name: 'Adani EV - MS GC Retreat (Kokta Bypass)',
    address: 'Kokta Bypass Road, Bhopal 462001',
    latitude: 23.3112, longitude: 77.4510,
    charger_types: ['CCS2'],
    total_slots: 3, available_slots: 3, price_per_kwh: 13.0, avg_wait_minutes: 0,
    amenities: ['WiFi', 'Cafe', 'Parking'], rating: 5.0,
    operator: 'Adani Total Gas', power_kw: 60, is_fast_charger: true
  },
  {
    name: 'HPCL EV Charger - MDR23',
    address: 'MDR23, Bhopal 462001',
    latitude: 23.2450, longitude: 77.4900,
    charger_types: ['CCS2'],
    total_slots: 2, available_slots: 2, price_per_kwh: 12.0, avg_wait_minutes: 5,
    amenities: ['Parking'], rating: 4.8,
    operator: 'HPCL', power_kw: 30, is_fast_charger: true
  },
  {
    name: 'Jio-bp Pulse - DRM Road',
    address: 'DRM Road, Bhopal 462011',
    latitude: 23.2689, longitude: 77.4098,
    charger_types: ['CCS2', 'Type2'],
    total_slots: 4, available_slots: 4, price_per_kwh: 15.0, avg_wait_minutes: 0,
    amenities: ['WiFi', 'Cafe', 'Parking'], rating: 5.0,
    operator: 'Jio-bp Pulse', power_kw: 60, is_fast_charger: true
  },
  {
    name: 'EVDOQ - DB City Mall',
    address: 'Basement B3, DB City Mall, Arera Hills, Bhopal 462016',
    latitude: 23.2118, longitude: 77.4374,
    charger_types: ['CCS2', 'Type2'],
    total_slots: 6, available_slots: 4, price_per_kwh: 14.5, avg_wait_minutes: 10,
    amenities: ['Mall', 'Restroom', 'WiFi', 'Cafe', 'Parking'], rating: 4.9,
    operator: 'EVDOQ', power_kw: 50, is_fast_charger: false
  },
  {
    name: 'ChargeZone - JK Road',
    address: 'No G-27, JK Road, Bhopal 462023',
    latitude: 23.2579, longitude: 77.4626,
    charger_types: ['CCS2', 'Type2'],
    total_slots: 3, available_slots: 2, price_per_kwh: 13.5, avg_wait_minutes: 10,
    amenities: ['Parking'], rating: 4.2,
    operator: 'ChargeZone', power_kw: 50, is_fast_charger: false
  },
  {
    name: 'Ather Grid - Raisen Road',
    address: 'Plot No. 253, Raisen Road, MP Nagar, Bhopal 462011',
    latitude: 23.2320, longitude: 77.4785,
    charger_types: ['LECCS'],
    total_slots: 2, available_slots: 2, price_per_kwh: 6.0, avg_wait_minutes: 5,
    amenities: ['Parking'], rating: 4.7,
    operator: 'Ather Grid', power_kw: 1, is_fast_charger: false
  },
  {
    name: 'Ather Grid - Kolar Road',
    address: 'Kolar Road, Bhopal 462042',
    latitude: 23.1890, longitude: 77.4421,
    charger_types: ['LECCS'],
    total_slots: 1, available_slots: 1, price_per_kwh: 6.0, avg_wait_minutes: 0,
    amenities: ['Parking'], rating: 5.0,
    operator: 'Ather Grid', power_kw: 1, is_fast_charger: false
  },
  {
    name: 'Ather Grid - Narmadapuram Road',
    address: 'Khasra No 301/1, Narmadapuram Road, Bhopal 462037',
    latitude: 23.1756, longitude: 77.3900,
    charger_types: ['LECCS'],
    total_slots: 1, available_slots: 1, price_per_kwh: 6.0, avg_wait_minutes: 0,
    amenities: ['Parking'], rating: 5.0,
    operator: 'Ather Grid', power_kw: 1, is_fast_charger: false
  },
  {
    name: 'Ather Grid - Misrod',
    address: 'Misrod Area, Bhopal 462047',
    latitude: 23.1671, longitude: 77.4802,
    charger_types: ['LECCS'],
    total_slots: 1, available_slots: 0, price_per_kwh: 6.0, avg_wait_minutes: 20,
    amenities: ['Parking'], rating: 3.0,
    operator: 'Ather Grid', power_kw: 1, is_fast_charger: false
  },
  {
    name: 'Ola Hypercharger - Pushpa Nagar',
    address: 'BPCL Station, The Fame Petro Point, 80 Feet Road, Bhopal',
    latitude: 23.2401, longitude: 77.4195,
    charger_types: ['Ola-Fast'],
    total_slots: 3, available_slots: 2, price_per_kwh: 5.0, avg_wait_minutes: 10,
    amenities: ['Petrol Station', 'Parking'], rating: 4.2,
    operator: 'Ola Electric', power_kw: 4, is_fast_charger: false
  },
  {
    name: 'Ola Hypercharger - Hoshangabad Road',
    address: 'Maple High Street, Hoshangabad Road, Bhopal',
    latitude: 23.2070, longitude: 77.4044,
    charger_types: ['Ola-Fast'],
    total_slots: 4, available_slots: 3, price_per_kwh: 5.0, avg_wait_minutes: 5,
    amenities: ['Mall', 'WiFi', 'Parking'], rating: 4.5,
    operator: 'Ola Electric', power_kw: 4, is_fast_charger: false
  },
  {
    name: 'Bajaj Chetak Charging - JK Road',
    address: '7F74+RWG, JK Road, Bhopal 462023',
    latitude: 23.2555, longitude: 77.4590,
    charger_types: ['Wall Socket 3kW'],
    total_slots: 2, available_slots: 2, price_per_kwh: 8.0, avg_wait_minutes: 0,
    amenities: ['Parking'], rating: 4.0,
    operator: 'Bajaj Auto', power_kw: 3, is_fast_charger: false
  },
  {
    name: 'TVS iQube - IOCL Vidisha Road',
    address: 'Shop No 452/2 Lalariya, Vidisha Road, Bhopal',
    latitude: 23.2900, longitude: 77.5200,
    charger_types: ['Wall Socket 3kW'],
    total_slots: 2, available_slots: 1, price_per_kwh: 8.0, avg_wait_minutes: 10,
    amenities: ['Petrol Station', 'Parking'], rating: 4.0,
    operator: 'TVS Motor / IOCL', power_kw: 3, is_fast_charger: false
  },
  {
    name: 'BPCL EV Charge Point - VIP Road',
    address: 'BPCL Petrol Pump, VIP Road, Shyamla Hills, Bhopal 462002',
    latitude: 23.2480, longitude: 77.4320,
    charger_types: ['CCS2', 'Type2'],
    total_slots: 4, available_slots: 3, price_per_kwh: 13.0, avg_wait_minutes: 5,
    amenities: ['Petrol Station', 'Parking', 'Restroom'], rating: 4.3,
    operator: 'BPCL', power_kw: 30, is_fast_charger: true
  }
];

async function seed() {
  console.log(`🚀 Seeding ${bhopalStations.length} Bhopal stations to Supabase...`);
  
  const stationsWithIds = bhopalStations.map(s => ({ ...s, id: uuidv4() }));

  const { error } = await supabase
    .from('stations')
    .insert(stationsWithIds);

  if (error) {
    console.error('❌ Error seeding stations:', error.message);
  } else {
    console.log('✅ Successfully added all Bhopal stations!');
  }
  
  console.log('✨ Seeding complete!');
}

seed();
