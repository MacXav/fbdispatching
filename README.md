# FreightBoy Dispatching

A custom trucking dispatching web app built with Next.js, TypeScript, Tailwind CSS, and Supabase.

This project is currently being built as an internal dispatch, work order, routing, company, truck, and billing workflow system. The goal is to replace scattered spreadsheets, whiteboards, paper notes, and manual dispatch tracking with one clean web-based tool.

---

## Current Main Features

### Dashboard / Truck Board

- White Google-Sheets-style dispatch board
- Light mode and dark mode support
- Zoom controls for the board
- Individual truck column scrolling
- Pickups and truck route shipments visually separated
- Thick borders for easier row separation
- Truck headers and pickup headers aligned
- Board visibility settings saved per browser
- Settings page can turn all board fields on or off

### Pickups / Shipments

- Create and manage pickups
- Assign pickups to trucks
- Add pickup and delivery information
- Add shipment details such as skids, weight, notes, and customs docs
- Create new pickup/delivery companies directly from the pickup form
- Auto-created companies can be flagged as needing details
- Old auto-created notes are cleared when company details are completed

### Work Orders

- `/work-orders` is the condensed work order list
- Clicking a work order opens a detailed work order page in a new tab
- Creating a new work order opens `/wo/new`
- Work orders are created on the dedicated work order page, not inside the list page
- Work orders can be saved with limited information:
  - Bill To / Customer
  - Carrier
  - Shipper
  - Receiver
- Price is optional because accounting may add pricing later after receiving POD
- Work order list refreshes automatically after a new work order is created
- Work order detail page uses a compact no-scroll accounting-style layout

### Work Order Lines

Work orders support multiple freight/billing lines, similar to UFOS-style line entry.

Each line can include:

- Shipper
- Receiver
- Piece count
- Piece type, such as skid, box, crate, etc.
- Commodity
- Weight
- Price
- Pickup/delivery line details

Line 1 is automatically created for new work orders.

### Billing / Accounting Workflow

Dispatch does not handle billing except entering a known base price when available.

Accounting can use the work order detail page to review and complete billing information.

The billing workflow is designed for future QuickBooks integration.

Current billing/accounting concepts:

- Dispatch price
- Accounting status
- QuickBooks invoice number
- QuickBooks invoice fields
- BOL / document creation from inside the work order page
- Document history page removed from the workflow

QuickBooks is not connected yet. The current setup prepares the data and layout for a future QuickBooks integration.

### BOL / Documents

- BOL creation is handled inside the work order detail page
- BOL/Documents were removed from the sidebar
- Document history page is no longer needed
- BOL printing is intended to happen from the work order page

### Reference Records / Data Cleanup

The app separates operational locations from billing/accounting records.

Reference groups include:

- Customers / Bill To records
- Carriers
- Customs brokers
- Shippers / Receivers / Companies

New records can be created quickly while building a work order. If the record is missing important details, it is flagged for cleanup.

Records needing details are shown on:

```txt
/records-needing-details
```

The cleanup workflow supports:

- Exact links to the record that needs fixing
- Required field indicators with red asterisks
- Clearing stale needs-details flags once address and city are added
- Customs broker does not block work order progress
- Phone and email are not required

### Companies

- Companies page supports creating, editing, and deleting companies
- Duplicate warning flow instead of hard-blocking
- Similar names trigger a confirmation, for example:
  - Raz
  - Raz Design
  - The Raz Design
- Required fields are marked with a red asterisk
- Completing address and city clears needs-details status
- Old automatic notes are removed when company details are completed

### Routes

- Routes page displays active truck routes
- Google route estimate support exists through the app’s route API
- Text contrast improved for light mode
- TypeScript fixes added for Google route stop typing

### Settings

- Light mode / dark mode toggle
- Board visibility settings
- Turn All On / Turn All Off buttons
- Reset Defaults button
- Settings saved locally in the browser

---

## Tech Stack

- Next.js
- TypeScript
- Tailwind CSS
- Supabase
- Lucide React icons
- Google Maps routing support
- Planned QuickBooks integration

---

## Local Development

From the project folder:

```powershell
cd "C:\Users\Xavier\Desktop\fbdispatching"
npm install
npm run dev
```

Open the app in the browser:

```txt
http://localhost:3000
```

---

## Environment Variables

Create a `.env.local` file in the project root.

Typical Supabase variables:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Other API keys may be added later for Google Maps, QuickBooks, Stripe, or other integrations.

Do not commit `.env.local` to GitHub.

---

## Git Workflow

Check status:

```powershell
git status
```

Save changes:

```powershell
git add .
git commit -m "Update work order builder and dispatch workflow"
git push
```

Pull latest changes on another computer:

```powershell
cd "C:\Users\Xavier\Desktop\fbdispatching"
git pull
npm install
npm run dev
```

---

## Important Project Notes

- Keep work order creation fast.
- Do not force dispatch to complete full billing details.
- Dispatch should only add base price when known.
- Accounting owns billing, invoicing, POD review, and QuickBooks workflow.
- Work orders should be usable with limited information.
- Missing reference details should be flagged clearly, but should not block work order creation.
- Customers, carriers, customs brokers, and shipper/receiver companies should stay separate.
- The dashboard should be clean, white, and readable for dispatch, with dark mode still supported.
- Avoid giant dropdown lists. Use compact search modals for customers, carriers, brokers, shippers, and receivers.

---

## Future Roadmap

### Authentication

Planned user roles:

- Admin
- Dispatcher
- Accounting
- Driver
- View Only

### Commercial SaaS Version

Future commercial/subscription version may include:

- Multi-business accounts
- Business-specific users
- Role-based access
- Supabase Row Level Security
- Stripe subscriptions
- QuickBooks Online integration
- Customer onboarding
- Pricing page
- Support/contact page

### QuickBooks Integration

Future accounting features:

- Create QuickBooks invoice from work order
- Sync QuickBooks invoice ID and invoice number
- Sync invoice status
- Track paid/unpaid status
- Store QuickBooks customer references

### Database Cleanup

Future admin tools:

- Customers needing details
- Companies needing details
- Carriers needing details
- Duplicate detection and merge tools
- Bulk cleanup tools

---

## Current Main Routes

```txt
/dashboard
/shipments
/companies
/trucks
/work-orders
/wo/new
/wo/[workOrderNumber]
/records-needing-details
/routes
/routing-planner
/settings
```

---

## Development Preference

When updating code, provide full replacement files instead of snippets whenever possible.
