# Supabase Database Schema

## Setup Instructions

1. Go to https://app.supabase.com and select your project
2. Go to the **SQL Editor** tab
3. Click **+ New Query**
4. Copy and paste **only the SQL code** (not the markdown) from each section below
5. Click **Run** to execute
6. Repeat for each section

---

## 1. Create Shipments Table

Copy and paste this SQL, then click Run:

```sql
CREATE TABLE shipments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  pickup_company_name TEXT NOT NULL,
  pickup_address TEXT NOT NULL,
  pickup_city TEXT NOT NULL,
  pickup_postal_code TEXT NOT NULL,
  pickup_date DATE NOT NULL,
  pickup_time TIME NOT NULL,
  pickup_contact_name TEXT NOT NULL,
  pickup_contact_phone TEXT NOT NULL,
  delivery_company_name TEXT NOT NULL,
  delivery_address TEXT NOT NULL,
  delivery_city TEXT NOT NULL,
  delivery_postal_code TEXT NOT NULL,
  delivery_date DATE NOT NULL,
  delivery_time TIME NOT NULL,
  delivery_contact_name TEXT NOT NULL,
  delivery_contact_phone TEXT NOT NULL,
  number_of_skids INTEGER NOT NULL,
  weight_kg DECIMAL(10,2) NOT NULL,
  dimensions TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'picked_up', 'at_cross_dock', 'out_for_delivery', 'delivered')),
  assigned_truck_id UUID,
  assigned_at TIMESTAMP WITH TIME ZONE
);
```

Then run these indexes in a **new query**:

```sql
CREATE INDEX idx_shipments_status ON shipments(status);
CREATE INDEX idx_shipments_assigned_truck_id ON shipments(assigned_truck_id);
CREATE INDEX idx_shipments_created_at ON shipments(created_at);
CREATE INDEX idx_shipments_delivery_city ON shipments(delivery_city);
CREATE INDEX idx_shipments_pickup_city ON shipments(pickup_city);
```

## 2. Create Trucks Table

Copy and paste this SQL in a **new query**, then click Run:

```sql
CREATE TABLE trucks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  truck_number TEXT NOT NULL UNIQUE,
  driver_name TEXT NOT NULL,
  capacity_skids INTEGER NOT NULL,
  current_route_area TEXT,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'loaded', 'out_for_delivery', 'maintenance'))
);
```

Then run these indexes in a **new query**:

```sql
CREATE INDEX idx_trucks_status ON trucks(status);
CREATE INDEX idx_trucks_truck_number ON trucks(truck_number);
```

## 2.5 Create Companies Table (Shippers & Receivers)

Copy and paste this SQL in a **new query**, then click Run:

```sql
CREATE TABLE companies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  name TEXT NOT NULL,
  contact_name TEXT,
  contact_phone TEXT,
  email TEXT,
  address TEXT,
  city TEXT,
  postal_code TEXT,
  notes TEXT,
  type TEXT NOT NULL DEFAULT 'both' CHECK (type IN ('shipper','receiver','both'))
);
```

Then run these indexes in a **new query**:

```sql
CREATE INDEX idx_companies_name ON companies(name);
CREATE INDEX idx_companies_city ON companies(city);
```

## 3. Create Truck Assignments Table

Copy and paste this SQL in a **new query**, then click Run:

```sql
CREATE TABLE truck_assignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  truck_id UUID NOT NULL REFERENCES trucks(id) ON DELETE CASCADE,
  shipment_id UUID NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP WITH TIME ZONE NOT NULL,
  assigned_by_user_id UUID,
  truck_number TEXT,
  shipment_delivery_city TEXT,
  UNIQUE(shipment_id)
);
```

Then run these indexes in a **new query**:

```sql
CREATE INDEX idx_truck_assignments_truck_id ON truck_assignments(truck_id);
CREATE INDEX idx_truck_assignments_shipment_id ON truck_assignments(shipment_id);
CREATE INDEX idx_truck_assignments_assigned_at ON truck_assignments(assigned_at);
```

## 4. Enable Row Level Security (RLS)

⚠️ **Important**: Copy and paste **one statement at a time** in the SQL Editor. Each `CREATE POLICY` command must be run separately.

First, enable RLS on all tables. Copy and paste in a **new query**:

```sql
ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE trucks ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE truck_assignments ENABLE ROW LEVEL SECURITY;
```

Then run each policy below **one at a time** in separate queries:

**Shipments - Read Policy:**
```sql
CREATE POLICY "shipments_select_policy" ON shipments
  FOR SELECT USING (true);
```

**Shipments - Insert Policy:**
```sql
CREATE POLICY "shipments_insert_policy" ON shipments
  FOR INSERT WITH CHECK (true);
```

**Shipments - Update Policy:**
```sql
CREATE POLICY "shipments_update_policy" ON shipments
  FOR UPDATE USING (true) WITH CHECK (true);
```

**Shipments - Delete Policy:**
```sql
CREATE POLICY "shipments_delete_policy" ON shipments
  FOR DELETE USING (true);
```

**Trucks - Read Policy:**
```sql
CREATE POLICY "trucks_select_policy" ON trucks
  FOR SELECT USING (true);
```

**Trucks - Insert Policy:**
```sql
CREATE POLICY "trucks_insert_policy" ON trucks
  FOR INSERT WITH CHECK (true);
```

**Trucks - Update Policy:**
```sql
CREATE POLICY "trucks_update_policy" ON trucks
  FOR UPDATE USING (true) WITH CHECK (true);
```

**Trucks - Delete Policy:**
```sql
CREATE POLICY "trucks_delete_policy" ON trucks
  FOR DELETE USING (true);
```

**Truck Assignments - Read Policy:**
```sql
CREATE POLICY "truck_assignments_select_policy" ON truck_assignments
  FOR SELECT USING (true);
```

**Truck Assignments - Insert Policy:**
```sql
CREATE POLICY "truck_assignments_insert_policy" ON truck_assignments
  FOR INSERT WITH CHECK (true);
```

**Truck Assignments - Update Policy:**
```sql
CREATE POLICY "truck_assignments_update_policy" ON truck_assignments
  FOR UPDATE USING (true) WITH CHECK (true);
```

**Truck Assignments - Delete Policy:**
```sql
CREATE POLICY "truck_assignments_delete_policy" ON truck_assignments
  FOR DELETE USING (true);
```

**Companies - Read Policy:**
```sql
CREATE POLICY "companies_select_policy" ON companies
  FOR SELECT USING (true);
```

**Companies - Insert Policy:**
```sql
CREATE POLICY "companies_insert_policy" ON companies
  FOR INSERT WITH CHECK (true);
```

**Companies - Update Policy:**
```sql
CREATE POLICY "companies_update_policy" ON companies
  FOR UPDATE USING (true) WITH CHECK (true);
```

**Companies - Delete Policy:**
```sql
CREATE POLICY "companies_delete_policy" ON companies
  FOR DELETE USING (true);
```

---

## Verification

After running all queries, verify in Supabase:

1. Go to **Table Editor** in your Supabase dashboard
2. You should see these tables:
  - `shipments`
  - `trucks`
  - `companies`
  - `truck_assignments`
3. Each table should have all columns visible
4. Indexes should be created (check under "Indexes" tab)

## Troubleshooting

**Error: "syntax error at end of input"**
- Make sure you're copying ONLY the SQL code (not the markdown backticks)
- Run each query separately - don't try to run multiple statements at once
- Check that you're in the "SQL Editor" tab, not the "Table Editor"

**Error: "table already exists"**
- You've already created the table successfully
- Move to the next step

**Error: "permission denied"**
- Make sure you're running the SQL with your admin role
- Go to Supabase dashboard and check you're logged in

## Next Steps

1. Once all tables are created and verified:
   - Go to `.env.local` in your project
   - Update `NEXT_PUBLIC_SUPABASE_URL` with your project URL
   - Update `NEXT_PUBLIC_SUPABASE_ANON_KEY` with your anon key
   - Find these in Supabase: **Settings** → **API** → **Project URL** and **Anon Public Key**

2. Start the development server:
   ```bash
   npm run dev
   ```

3. Open http://localhost:3000 and test the application

4. Create your first shipment and truck to verify everything is working
