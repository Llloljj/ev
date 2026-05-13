require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function checkManagers() {
  const { data: managers, error: mErr } = await supabase.from('station_managers').select('*');
  const { data: profiles, error: pErr } = await supabase.from('profiles').select('*');
  const { data: stations, error: sErr } = await supabase.from('stations').select('id, name');

  console.log('--- STATION MANAGERS ---');
  console.log(managers);
  console.log('--- PROFILES ---');
  console.log(profiles.map(p => ({ id: p.id, email: p.email })));
  console.log('--- STATIONS ---');
  console.log(stations);
}

checkManagers();
