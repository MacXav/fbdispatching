# Dispatch Pro - Trucking Dispatch Management System

A professional dispatching software for trucking companies built with Next.js, React, TypeScript, Tailwind CSS, and Supabase.

## Features

### 📊 Dashboard
- Real-time overview of all shipments and trucks
- Shipment status summary with visual progress bars
- Truck availability and skid capacity tracking
- Quick access links to main features

### 📦 Shipments Management
- Create, read, update, and delete shipments
- Track full pickup and delivery information
- Manage shipment details (skids, weight, dimensions)
- Update shipment status through delivery lifecycle
- Search and filter by company, address, or status

### 🚛 Truck Management
- Add, edit, and delete trucks
- Track skid capacity and current assignments
- Monitor available skid space per truck
- Assign drivers and set route/area information
- Update truck status (available, loaded, out for delivery, maintenance)

### 🏪 Cross-Dock Management
- View all unassigned shipments
- Intelligent truck recommendations based on:
  - Delivery location match
  - Available skid capacity
  - Existing route assignments
  - Truck status
- Manual override to assign shipments to any available truck
- Real-time capacity warnings

### 🗺️ Routes Management
- View all active delivery routes by truck
- See complete shipment list for each truck
- Delivery stops numbered in order
- Prepared for Google Maps integration
- Ready for Motive API integration

## Tech Stack

- **Frontend**: Next.js 15, React 18, TypeScript, Tailwind CSS
- **Backend/Database**: Supabase (PostgreSQL)
- **Icons**: Lucide React
- **Authentication**: Supabase Auth (prepared, not yet integrated)
- **Future Integrations**: Google Maps API, Motive API

## Project Structure

```
dispatching-software/
├── app/
│   ├── dashboard/          # Dashboard page
│   ├── shipments/          # Shipments management page
│   ├── trucks/             # Trucks management page
│   ├── cross-dock/         # Cross-dock assignment page
│   ├── routes/             # Routes visualization page
│   ├── page.tsx            # Root redirect
│   ├── layout.tsx          # Root layout
│   └── globals.css         # Global styles
├── components/
│   ├── Sidebar.tsx         # Navigation sidebar
│   ├── MainLayout.tsx      # Layout wrapper with sidebar
│   ├── Header.tsx          # Page header component
│   ├── StatCard.tsx        # Dashboard stat card
│   └── StatusBadge.tsx     # Status badge component
├── lib/
│   ├── supabase.ts         # Supabase client setup
│   ├── database.ts         # All database operations
│   ├── googleMapsService.ts # Google Maps placeholders
│   └── motiveApiService.ts  # Motive API placeholders
├── types/
│   └── index.ts            # TypeScript types and interfaces
├── DATABASE_SCHEMA.md      # SQL schema and setup instructions
├── .env.local              # Environment variables (create this)
├── package.json
├── tsconfig.json
├── next.config.js
├── tailwind.config.ts
└── postcss.config.js
```

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Supabase

1. Create a free account at [supabase.com](https://supabase.com)
2. Create a new project
3. Go to "SQL Editor" and run all SQL commands from `DATABASE_SCHEMA.md`
4. Copy your project URL and anon key from Project Settings

### 3. Configure Environment Variables

Copy your Supabase credentials to `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=your_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

### 4. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser. You'll be redirected to the dashboard.

### 5. Build for Production

```bash
npm run build
npm start
```

## Database Schema

The application uses three main tables:

- **shipments**: All shipment data with pickup/delivery info and status
- **trucks**: Fleet information including capacity and driver details
- **truck_assignments**: Junction table linking shipments to trucks

See `DATABASE_SCHEMA.md` for complete SQL schema and setup instructions.

## Key Workflows

### Create and Deliver a Shipment

1. **Shipments** → "Add Shipment" → Fill in pickup and delivery details
2. **Cross-Dock** → Select the shipment → Choose recommended truck → Assign
3. **Dashboard** → Monitor shipment progress
4. **Shipments** → Update status from pending → picked up → at cross dock → out for delivery → delivered

### Manage Fleet

1. **Trucks** → "Add Truck" → Enter truck details
2. **Trucks** → Edit truck information or update status
3. **Cross-Dock** → View skid capacity for each truck
4. **Routes** → See which shipments are assigned to each truck

### Optimize Routes

1. **Cross-Dock** → System recommends trucks based on delivery location
2. **Routes** → View all stops for each truck
3. *Future: Google Maps integration will optimize stop order*

## Future Enhancements

### Google Maps Integration
- Real-time distance and drive time calculations
- Route optimization for efficient deliveries
- Geocoding for address validation
- Directions and turn-by-turn navigation

### Motive API Integration
- Real-time truck location tracking
- Driver HOS (Hours of Service) monitoring
- Vehicle diagnostics and maintenance alerts
- Automatic sync of vehicle data

### Authentication
- User login/signup
- Role-based access control
- Audit logging

## Usage Tips

### Dashboard
- Use stat cards to quickly assess fleet status
- Click "Add Shipment" or "Manage Trucks" for quick actions

### Shipments Page
- Use search and filters to find specific shipments
- Change status directly from the table
- Edit or delete shipments as needed

### Trucks Page
- Monitor skid capacity with visual indicators
- Red numbers indicate full or near-full trucks
- Green available space indicates capacity

### Cross-Dock (Key Feature!)
- Select an unassigned shipment from the left panel
- Recommendations appear on the right (sorted by match quality)
- "Top Match" trucks are already going to that delivery area
- Click a truck to assign the shipment
- The system prevents over-capacity assignments

### Routes
- Select a truck to view all its assigned deliveries
- Stops are numbered in order
- Ready for Google Maps integration for optimization

## Dark Mode Design

The app uses a dark trucking/logistics themed interface with:
- Dark slate backgrounds
- Blue accent colors for primary actions
- Color-coded status badges
- Green for success, yellow for warning, red for alerts
- Easy on the eyes for long dispatch shifts

## Troubleshooting

### "Missing Supabase environment variables"
- Ensure `.env.local` is created with correct credentials
- Restart the dev server after updating env vars

### Shipments not appearing
- Check that database tables are created correctly
- Verify Supabase credentials in `.env.local`
- Check browser console for errors

### Can't assign shipments to trucks
- Verify truck has available skid capacity
- Ensure truck status is "available"
- Check that shipment is not already assigned

### Row Level Security (RLS) errors
- Currently, RLS policies allow all authenticated operations
- For production, implement proper auth and role-based policies

## Support & Development

This is a production-ready template. Feel free to:
- Extend with additional features
- Integrate external APIs (Google Maps, Motive)
- Implement authentication
- Add reporting and analytics

## License

This project is ready for commercial use by your trucking company.

---

**Built with ❤️ for dispatchers by dispatchers**
