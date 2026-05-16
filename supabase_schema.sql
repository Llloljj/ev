-- ═══════════════════════════════════════════════════════
-- EV PATH — Supabase Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ═══════════════════════════════════════════════════════

-- 1. STATIONS
CREATE TABLE IF NOT EXISTS stations (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  address       TEXT NOT NULL,
  latitude      DOUBLE PRECISION NOT NULL,
  longitude     DOUBLE PRECISION NOT NULL,
  charger_types JSONB NOT NULL DEFAULT '[]',
  total_slots   INTEGER NOT NULL,
  available_slots INTEGER NOT NULL,
  price_per_kwh DOUBLE PRECISION NOT NULL,
  avg_wait_minutes INTEGER NOT NULL,
  amenities     JSONB NOT NULL DEFAULT '[]',
  rating        DOUBLE PRECISION NOT NULL,
  operator      TEXT NOT NULL,
  power_kw      DOUBLE PRECISION NOT NULL,
  is_fast_charger BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. PROFILES (extra user data beyond Supabase Auth)
CREATE TABLE IF NOT EXISTS profiles (
  id               UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name             TEXT,
  email            TEXT,
  picture          TEXT,
  phone            TEXT,
  vehicle_model    TEXT,
  years_used       INTEGER DEFAULT 0,
  battery_capacity_kwh DOUBLE PRECISION,
  degradation_pct  DOUBLE PRECISION DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login       TIMESTAMPTZ
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, name, email, picture)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.email,
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- 3. BOOKINGS
CREATE TABLE IF NOT EXISTS bookings (
  id              TEXT PRIMARY KEY,
  user_id         UUID REFERENCES auth.users(id),
  station_id      TEXT NOT NULL REFERENCES stations(id),
  slot_time       TEXT NOT NULL,
  duration_hours  DOUBLE PRECISION NOT NULL DEFAULT 1,
  charger_type    TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'confirmed',
  amount          DOUBLE PRECISION NOT NULL,
  payment_method  TEXT DEFAULT 'simulated',
  tx_hash         TEXT,
  wallet_address  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Row Level Security ───────────────────────────────────
ALTER TABLE stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

-- Stations: anyone can read
CREATE POLICY "stations_public_read" ON stations FOR SELECT USING (true);
-- Stations: only service_role can write (backend)
CREATE POLICY "stations_service_write" ON stations FOR ALL USING (auth.role() = 'service_role');

-- Profiles: users can read/update their own
CREATE POLICY "profiles_own_read"   ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_own_update" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "profiles_service_all" ON profiles FOR ALL USING (auth.role() = 'service_role');

-- Bookings: users see their own; service_role sees all
CREATE POLICY "bookings_own_read"    ON bookings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "bookings_own_insert"  ON bookings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "bookings_service_all" ON bookings FOR ALL USING (auth.role() = 'service_role');

-- ── Seed: Bhopal Stations ────────────────────────────────
INSERT INTO stations (id,name,address,latitude,longitude,charger_types,total_slots,available_slots,price_per_kwh,avg_wait_minutes,amenities,rating,operator,power_kw,is_fast_charger)
VALUES
  (gen_random_uuid()::text,'Tata Power EV - Govindpura','56-57 Govindpura, Sector A, JK Road, Bhopal 462023',23.2602,77.4648,'["CHAdeMO","CCS2"]',4,2,14.0,15,'["Parking","WiFi"]',3.7,'Tata Power EV',25,TRUE),
  (gen_random_uuid()::text,'Statiq - CI Hyundai Showroom','Service Road, New Market, Bhopal 462023',23.2303,77.4300,'["CCS2"]',2,1,13.5,10,'["Parking","Restroom"]',4.0,'Statiq',60,TRUE),
  (gen_random_uuid()::text,'Adani EV - MS GC Retreat (Kokta Bypass)','Kokta Bypass Road, Bhopal 462001',23.3112,77.4510,'["CCS2"]',3,3,13.0,0,'["WiFi","Cafe","Parking"]',5.0,'Adani Total Gas',60,TRUE),
  (gen_random_uuid()::text,'HPCL EV Charger - MDR23','MDR23, Bhopal 462001',23.2450,77.4900,'["CCS2"]',2,2,12.0,5,'["Parking"]',4.8,'HPCL',30,TRUE),
  (gen_random_uuid()::text,'Jio-bp Pulse - DRM Road','DRM Road, Bhopal 462011',23.2689,77.4098,'["CCS2","Type2"]',4,4,15.0,0,'["WiFi","Cafe","Parking"]',5.0,'Jio-bp Pulse',60,TRUE),
  (gen_random_uuid()::text,'EVDOQ - DB City Mall','Basement B3, DB City Mall, Arera Hills, Bhopal 462016',23.2118,77.4374,'["CCS2","Type2"]',6,4,14.5,10,'["Mall","Restroom","WiFi","Cafe","Parking"]',4.9,'EVDOQ',50,FALSE),
  (gen_random_uuid()::text,'ChargeZone - JK Road','No G-27, JK Road, Bhopal 462023',23.2579,77.4626,'["CCS2","Type2"]',3,2,13.5,10,'["Parking"]',4.2,'ChargeZone',50,FALSE),
  (gen_random_uuid()::text,'Ather Grid - Raisen Road','Plot No. 253, Raisen Road, MP Nagar, Bhopal 462011',23.2320,77.4785,'["LECCS"]',2,2,6.0,5,'["Parking"]',4.7,'Ather Grid',1,FALSE),
  (gen_random_uuid()::text,'Ather Grid - Kolar Road','Kolar Road, Bhopal 462042',23.1890,77.4421,'["LECCS"]',1,1,6.0,0,'["Parking"]',5.0,'Ather Grid',1,FALSE),
  (gen_random_uuid()::text,'Ather Grid - Narmadapuram Road','Khasra No 301/1, Narmadapuram Road, Bhopal 462037',23.1756,77.3900,'["LECCS"]',1,1,6.0,0,'["Parking"]',5.0,'Ather Grid',1,FALSE),
  (gen_random_uuid()::text,'Ather Grid - Misrod','Misrod Area, Bhopal 462047',23.1671,77.4802,'["LECCS"]',1,0,6.0,20,'["Parking"]',3.0,'Ather Grid',1,FALSE),
  (gen_random_uuid()::text,'Ola Hypercharger - Pushpa Nagar','BPCL Station, The Fame Petro Point, 80 Feet Road, Bhopal',23.2401,77.4195,'["Ola-Fast"]',3,2,5.0,10,'["Petrol Station","Parking"]',4.2,'Ola Electric',4,FALSE),
  (gen_random_uuid()::text,'Ola Hypercharger - Hoshangabad Road','Maple High Street, Hoshangabad Road, Bhopal',23.2070,77.4044,'["Ola-Fast"]',4,3,5.0,5,'["Mall","WiFi","Parking"]',4.5,'Ola Electric',4,FALSE),
  (gen_random_uuid()::text,'Bajaj Chetak Charging - JK Road','7F74+RWG, JK Road, Bhopal 462023',23.2555,77.4590,'["Wall Socket 3kW"]',2,2,8.0,0,'["Parking"]',4.0,'Bajaj Auto',3,FALSE),
  (gen_random_uuid()::text,'TVS iQube - IOCL Vidisha Road','Shop No 452/2 Lalariya, Vidisha Road, Bhopal',23.2900,77.5200,'["Wall Socket 3kW"]',2,1,8.0,10,'["Petrol Station","Parking"]',4.0,'TVS Motor / IOCL',3,FALSE)
ON CONFLICT (id) DO NOTHING;

-- 4. ADMINS (Added in Phase 1)
CREATE TABLE IF NOT EXISTS admins (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

-- Admins: only service_role can read/write (backend)
CREATE POLICY "admins_service_all" ON admins FOR ALL USING (auth.role() = 'service_role');

-- 5. STATION MANAGERS
CREATE TABLE IF NOT EXISTS station_managers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  station_id TEXT NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  verified_id TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, station_id)
);

-- Enable RLS
ALTER TABLE station_managers ENABLE ROW LEVEL SECURITY;

-- Policies for station_managers
CREATE POLICY "managers_own_read" ON station_managers FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "managers_service_all" ON station_managers FOR ALL USING (auth.role() = 'service_role');


-- 6. STATION SLOTS
-- Allows managers to block specific time slots or manage capacity
CREATE TABLE IF NOT EXISTS station_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id TEXT NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  slot_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  status TEXT NOT NULL DEFAULT 'available', -- 'available' or 'blocked'
  reason TEXT, -- Optional: Reason for blocking (e.g., 'Maintenance')
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(station_id, slot_date, start_time)
);

-- Enable RLS
ALTER TABLE station_slots ENABLE ROW LEVEL SECURITY;

-- Policies for station_slots
CREATE POLICY "slots_public_read" ON station_slots FOR SELECT USING (true);
CREATE POLICY "slots_manager_all" ON station_slots FOR ALL USING (
  EXISTS (
    SELECT 1 FROM station_managers 
    WHERE station_managers.user_id = auth.uid() 
    AND station_managers.station_id = station_slots.station_id
  )
);
CREATE POLICY "slots_service_all" ON station_slots FOR ALL USING (auth.role() = 'service_role');


-- Update Bookings Policy to allow managers to see bookings for their station
CREATE POLICY "bookings_manager_read" ON bookings FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM station_managers
    WHERE station_managers.user_id = auth.uid()
    AND station_managers.station_id = bookings.station_id
  )
);


-- ═══════════════════════════════════════════════════════
-- PHASE 3: Community & Rewards (Gamification)
-- ═══════════════════════════════════════════════════════

-- 7. USER_PROFILES (Extended gamification data)
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  username TEXT,
  car_model TEXT,
  avatar_url TEXT,
  green_points INTEGER NOT NULL DEFAULT 0,
  co2_saved_kg DOUBLE PRECISION NOT NULL DEFAULT 0, -- Track CO2 saved in kg
  total_charging_sessions INTEGER NOT NULL DEFAULT 0,
  total_kwh_consumed DOUBLE PRECISION NOT NULL DEFAULT 0,
  member_since TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  level TEXT NOT NULL DEFAULT 'Novice', -- 'Novice', 'Eco Warrior', 'Green Champion', 'Climate Hero'
  streak_days INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Policies for user_profiles
CREATE POLICY "user_profiles_own_read" ON user_profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "user_profiles_own_update" ON user_profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "user_profiles_service_all" ON user_profiles FOR ALL USING (auth.role() = 'service_role');

-- Auto-create user_profile on signup
CREATE OR REPLACE FUNCTION handle_new_user_profile()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_profiles (user_id, username, member_since)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', NOW());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user_profile();


-- 8. ACHIEVEMENTS (Badge system)
CREATE TABLE IF NOT EXISTS achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_type TEXT NOT NULL, -- 'first_charge', 'eco_streak_7', 'co2_saver_10kg', 'green_champion', 'level_up', 'early_adopter'
  title TEXT NOT NULL,
  description TEXT,
  points_earned INTEGER NOT NULL DEFAULT 0,
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, achievement_type)
);

-- Enable RLS
ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;

-- Policies for achievements
CREATE POLICY "achievements_own_read" ON achievements FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "achievements_service_all" ON achievements FOR ALL USING (auth.role() = 'service_role');


-- 9. LEADERBOARD VIEW (For CO2 savings rankings)
CREATE OR REPLACE VIEW leaderboard AS
SELECT
  up.user_id,
  up.username,
  up.avatar_url,
  up.car_model,
  up.green_points,
  up.co2_saved_kg,
  up.level,
  up.streak_days,
  up.total_charging_sessions,
  ROW_NUMBER() OVER (ORDER BY up.co2_saved_kg DESC, up.green_points DESC) as rank
FROM user_profiles up
ORDER BY up.co2_saved_kg DESC, up.green_points DESC;


-- 10. FUNCTION: Award achievement & points
CREATE OR REPLACE FUNCTION award_achievement(
  p_user_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_description TEXT DEFAULT NULL,
  p_points INTEGER DEFAULT 0
)
RETURNS VOID AS $$
DECLARE
  v_exists BOOLEAN;
BEGIN
  -- Check if achievement already exists
  SELECT EXISTS (
    SELECT 1 FROM achievements
    WHERE user_id = p_user_id AND achievement_type = p_type
  ) INTO v_exists;

  IF NOT v_exists THEN
    -- Insert achievement
    INSERT INTO achievements (user_id, achievement_type, title, description, points_earned)
    VALUES (p_user_id, p_type, p_title, p_description, p_points)
    ON CONFLICT (user_id, achievement_type) DO NOTHING;

    -- Update user's green_points
    UPDATE user_profiles
    SET green_points = green_points + p_points,
        updated_at = NOW()
    WHERE user_id = p_user_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 11. FUNCTION: Update CO2 saved (called after each booking)
CREATE OR REPLACE FUNCTION update_co2_savings(
  p_user_id UUID,
  p_kwh_consumed DOUBLE PRECISION
)
RETURNS VOID AS $$
DECLARE
  v_co2_per_kwh DOUBLE PRECISION := 0.42; -- Approx 0.42 kg CO2 per kWh (vs gasoline)
  v_co2_saved DOUBLE PRECISION;
BEGIN
  -- Calculate CO2 saved compared to gasoline (approx 0.12 kWh/km for EV vs 0.08L gasoline/km)
  -- Simplified: each kWh saves ~0.42 kg CO2 vs fossil fuel
  v_co2_saved := p_kwh_consumed * v_co2_per_kwh;

  UPDATE user_profiles
  SET co2_saved_kg = co2_saved_kg + v_co2_saved,
      total_kwh_consumed = total_kwh_consumed + p_kwh_consumed,
      total_charging_sessions = total_charging_sessions + 1,
      last_active = NOW(),
      updated_at = NOW()
  WHERE user_id = p_user_id;

  -- Check for achievement triggers
  -- First charge achievement
  PERFORM award_achievement(p_user_id, 'first_charge', 'First Charge', 'Completed your first charging session', 10);

  -- Eco streak - 7 days
  -- Note: streak logic would need to be tracked separately

  -- CO2 Saver milestones (check after update)
  -- This will be handled in the application logic or via triggers
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
