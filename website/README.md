# Sameer Battery House (SolarPOS) — Admin Website

A multi-tenant Point of Sale system for a solar-energy distribution business — one main company (**Sameer Battery House**) plus multiple regional distributor branches, each with their own inventory, staff, and customers.

**This folder is the main-admin website.** It's one of two websites over the same Supabase project:

| Site | Folder | Who uses it | What it's for |
|---|---|---|---|
| **Admin Website** (this folder) | `POS/website` | `super_admin` (main admin) only | Inventory-first oversight: products, stock, categories, warranty, reports, distributor network, staff accounts across the whole business |
| **POS Website** | `POS/pos-website` | `sales_user` (main branch cashiers) and `distributor_user` (distributor branch staff — admin+cashier merged into one account) | The actual counter: ring up sales, quotations, returns, due payments, and (for distributor staff) confirming incoming shipments and managing their own branch |

Each site turns away the other's accounts with a clear message. (The POS used to be an Electron desktop app; it's now a plain website, so a till only needs a browser.) The two are separate codebases: `src/lib`, `src/contexts` and most of `src/components` exist in both, so a fix to one of those must be copied to the other.

Built with **React + Vite + Tailwind**, backed entirely by **Supabase** (Postgres + Auth + Storage). **It requires an internet connection** — there is no offline mode; every action reads/writes Supabase directly and simply fails with an error if the connection is down.

> See also: [`GUIDE.md`](./GUIDE.md) for the end-user manual (what each tab does, how to use the app) and [`APP_FLOW.md`](./APP_FLOW.md) for a deeper technical walkthrough of the admin data flows.

---

## Table of Contents

- [What this is](#what-this-is)
- [Tech stack](#tech-stack)
- [Roles](#roles)
- [Features by role](#features-by-role)
- [Core business flow](#core-business-flow)
- [Architecture](#architecture)
- [Project structure](#project-structure)
- [Database schema](#database-schema)
- [Setup / installation](#setup--installation)
- [Demo credentials](#demo-credentials)
- [Payment status logic](#payment-status-logic)
- [Known limitations](#known-limitations)

---

## What this is

The main admin (owner of Sameer Battery House) needs to:
- keep the product catalogue and stock levels accurate across every branch
- ship stock to distributor branches on credit, and track what each branch owes
- see sales history, reports, and distributor performance across the whole network
- manage every staff account — main-branch cashiers and distributor branch staff alike

This website covers all of that, landing on the product catalogue first since inventory oversight is its main job — plus quotations history, returns/replacements, warranty claims, and system/storage status. The day-to-day counter work (ringing up sales, taking payments) happens on the separate POS website (`../pos-website`).

The app is a single-page React app — no backend server of its own. Every read/write goes straight from the browser to Supabase (Postgres, protected by row-level security; auth via Supabase Auth).

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite 5, Tailwind CSS |
| Routing | react-router-dom (role-based, no nested routes — tabs are internal state) |
| Database | Supabase Postgres (`supabase/schema.sql`) |
| Auth | Supabase Auth (email/password) + a `users` profile table keyed by `auth_id` |
| File storage | Supabase Storage — `product-images` bucket for product photos |
| Charts | Recharts |
| PDF export | jsPDF + jsPDF-AutoTable (receipts, quotations) |
| Excel import | xlsx (bulk product import) |
| Notifications | react-hot-toast |
| Icons | lucide-react + a small inline SVG set in `DesignSystem.jsx` |

No local database, no Google Drive integration — this website is a plain web app deployable to any static host (Vercel, Netlify, etc.).

---

## Roles

| Role | Who | Signs in here? |
|---|---|---|
| `super_admin` | Main admin — head office / owner. Sees everything, every branch. | **Yes** — this is the only role this website serves |
| `distributor_user` | Distributor branch staff — merged admin+cashier, full access to their own branch only. No separate tier within a branch. | No — POS website only |
| `sales_user` | Main-branch counter cashier. | No — POS website only |
| `org_admin` *(legacy)* | Old branch-manager role, superseded by `distributor_user`. Kept valid in the DB for old rows, no longer assigned to new accounts. | No |

`src/App.jsx` checks the signed-in user's role: `super_admin` gets the admin dashboard; `sales_user`/`distributor_user` get a "use the POS website" screen; a deactivated or unknown account gets a "not active, sign out" screen. Tabs within the dashboard are plain `useState`, not sub-routes.

---

## Features — Admin Dashboard (`super_admin`, this website)

- **Products** *(default landing tab)* — full catalogue CRUD, product photos, Excel bulk import, deactivate or permanently delete a product (delete is blocked if it has any sales/supply/quotation/return history — deactivate those instead); add new categories on the fly instead of picking from a fixed list; set a warranty period (No Warranty / 3, 6, 12, 24, 36 months) per product
- **Stock Intake** — record stock received from suppliers as a batch
- **Overview** — KPI cards (today/30-day/all-time revenue, inventory value), 30-day revenue chart, category breakdown, top products
- **Sales History** — every invoice across every branch, searchable/filterable
- **Customers** — search any customer, see full purchase history and outstanding balance
- **Due Payments** — every outstanding balance (customer invoices + distributor supply orders), record payments
- **Returns** — process a return/replacement against any past invoice, scoped to the branch the invoice was actually sold from
- **Distributor Supply** — ship stock to a distributor branch on credit at a wholesale price; set one margin % for the whole order or price each product individually; get notified in-app the moment a distributor confirms receipt; also where a brand-new distributor branch and its first `distributor_user` account get created
- **All Users** — add/deactivate staff accounts across the whole system: `sales_user` for the main branch, `distributor_user` for a distributor branch (full access there, no admin/cashier split), or another `super_admin`. After the first `distributor_user` for a branch exists, that branch can add more of its own staff itself, from its own Staff tab on the POS website.
- **Warranty** — file a claim by looking up the original invoice (auto-fills the customer and lets you pick which sold item it's about, showing whether its warranty is still valid) or manually for claims without a receipt handy; track status (Open → In Progress → Resolved → Closed); **Issue Replacement** on an invoice-linked claim creates a real zero-cost replacement invoice (visible in Sales History, with its own fresh warranty), decrements that branch's inventory, and marks the claim Resolved automatically
- **Distributors** — network-wide performance report (collection rate, outstanding, overdue, inventory value)
- **System** — Supabase database and file-storage usage against typical free-tier limits (informational, not real billing data), a rough "sales left before the database fills up" estimate, and a **Data Archive** tool: export fully-paid old invoices (and everything tied to them) to a downloadable JSON backup, then permanently delete just those rows from Supabase to reclaim space — never touches anything with an outstanding balance
- **Receipt Settings** — business info shown on printed receipts

## Features — POS Website (`sales_user` / `distributor_user`, `../pos-website`)

Point of Sale, Quotations, Return/Replace, Due Payments, Inventory, and Sales History — plus, for `distributor_user` accounts only, branch Overview, Recent Activity, Incoming Stock (confirm shipments from head office), Main Company Account (what they owe, report payments), My Products (own products + per-branch prices), Suppliers, Staff (add more staff for their own branch), and Receipt Settings. See `../pos-website/README.md`.

---

## Core business flow

**A sale:**
```
Add products to cart → optional discount % → customer name/phone →
retail or wholesale pricing → split payment (paid now / due later, due date
required if any balance) → cash or bank → Complete Sale
  → reserves stock atomically first (rejects the sale outright if not enough —
    see "Inventory integrity" below), then creates sales_invoices + sales_items
    + payment_ledger (if paid > 0)
  → payment_status computed automatically (paid/partial/pending/overdue)
```

**Inventory integrity — no overselling.** Every path that takes stock out of an org (POS checkout, distributor shipments, return replacements, warranty replacements) reserves it atomically *before* writing the sale/order/return record: a single `UPDATE ... WHERE quantity_on_hand >= wanted` (`reserve_stock`, inside the same database transaction as the rest of the operation) either succeeds or the whole operation is rolled back with no trace — so two cashiers can never both "sell" the last unit, and a distributor shipment or replacement can never be created for more than is actually on the shelf.

**Distributor supply chain:**
```
1. Admin sends stock to a distributor at a wholesale price (default cost × 1.15)
   → pricing mode: one margin % applied to every line ("bulk"), or set individually per product
   → stock leaves the main warehouse IMMEDIATELY
   → order sits "Awaiting Confirmation" — distributor's inventory NOT yet updated
2. Distributor manager reviews the shipment (a toast + badge count alerts them the moment it arrives)
   and clicks "Confirm Receipt"
   → only now is the stock added to the distributor's own inventory
   → admin's Distributor Supply view is notified in turn once receipt is confirmed
3. Distributor's own salesman sells it via their POS at retail price
   → admin tracks what's owed via Due Payments
```

**A quotation:**
```
Build a price estimate (products, per-line + overall discount, validity date)
→ customer agrees → "Convert to Sale" → prefills the POS cart for the actual invoice
```

---

## Architecture

There is no custom backend server — the browser talks to Supabase directly. Everything that moves stock or money is a Postgres function, and account management is one Edge Function.

```
React page
    ↓  window.api.someMethod(...)
src/lib/supabaseApi.js   (installed onto `window` by setupApi() in main.jsx)
    ↓  supabase.from('table')...  /  supabase.rpc('function_name', {...})
Supabase — Postgres (RLS-protected) + Auth + Storage, over HTTPS
```

`window.api` is installed once at startup so every page can call a plain method (`window.api.salesCreate(...)`, `window.api.productsGetWithStock(...)`, etc.) without importing Supabase directly. Every method maps to either a direct table query or a specific Postgres RPC function (defined in `supabase/schema.sql`) — there's no generic/raw-SQL passthrough.

**Tenant isolation** (which branch sees what) is enforced **in the database** by row-level security (`supabase/schema.sql`, PART 2). The helpers `auth_org_id()`, `auth_role()` and `can_access_org()` look up the signed-in user's `users` row:
- The main admin sees every branch; anyone else sees only their own branch.
- A distributor can *read* its supply orders and the payments on them, but can't edit them. Receipt goes through `confirm_supply_receipt`, and payments through payment claims the main company confirms.
- A deactivated account resolves to no branch and sees nothing.
- Client UPDATEs on `users` are limited by column grants to `name`/`phone`/`is_active`, so nobody can change their own role or branch.

The `org_id` filters in `supabaseApi.js` are still there, but they're for choosing what to show, not for security.

**Writes are transactions.** Every operation that moves stock or money is a Postgres function, and `supabaseApi.js` just calls it via `rpc()`:
- `create_sale`, `void_sale`, `record_payment`
- `create_supply_order`, `confirm_supply_receipt`, `confirm_payment_claim`
- `create_supplier_bill`, `stock_intake`, `adjust_stock`
- `create_return`, `issue_warranty_replacement`, `create_quote`

Each one either fully commits or leaves no trace, rows are locked where two users could race, and document numbers come from `next_doc_number()` (a sequence), so they never collide.

**Auth**: Supabase Auth handles email/password login. A `users` table stores the app-specific profile (`role`, `org_id`, `is_active`), linked to the Auth user via `auth_id`. The `handle_new_user` trigger creates that row from the Auth user's **app_metadata**, which only the service role can set. A plain `supabase.auth.signUp()` from the browser gets a deactivated profile with no access.

**Accounts are created by the `admin-user-actions` Edge Function** (`supabase/functions/`), which holds the service-role key server-side:
- `bootstrap`: First-Time Setup creates the main org and the first super_admin. This only works while there are no users.
- `create_user`: the admin can create any account; distributor staff can only add `distributor_user` accounts to their own branch.
- `set_password`, `delete_user`, `update_profile`: admin only.

The only anonymous-callable database function is `has_any_users()`, which Login uses to decide whether to redirect to First-Time Setup.

---

## Project structure

```
POS/
├── website/                       # ← this repo (super_admin admin website)
│   ├── src/
│   │   ├── App.jsx                    # Root router — super_admin only, else a "wrong app" screen
│   │   ├── main.jsx                   # Entry point — installs the API shim, mounts providers
│   │   │
│   │   ├── lib/
│   │   │   ├── supabase.js            # Supabase client + genId/computePaymentStatus
│   │   │   └── supabaseApi.js         # Every data call the UI makes — installs window.api
│   │   │
│   │   ├── contexts/
│   │   │   ├── AuthContext.jsx        # Supabase Auth session + `users` profile row
│   │   │   └── OrganizationContext.jsx# Active org (persisted to localStorage)
│   │   │
│   │   ├── components/
│   │   │   ├── AppLayout.jsx          # Sidebar + header shell
│   │   │   ├── Charts.jsx             # Recharts wrappers + shared category color map
│   │   │   ├── DesignSystem.jsx       # Icon set, Btn, Badge, Card, StatCard, etc. — no logic
│   │   │   ├── DistributorSupply.jsx  # "Send stock to distributor" form + order history
│   │   │   ├── DueAlertBanner.jsx     # Overdue/due-soon banner shown at the top of every page
│   │   │   ├── DuePaymentsPanel.jsx   # Due list + record-payment modal
│   │   │   └── ProtectedRoute.jsx     # Redirects unauthenticated users to /login
│   │   │
│   │   ├── pages/
│   │   │   ├── Login.jsx              # Also checks has_any_users() to redirect to setup on a fresh install
│   │   │   ├── FirstTimeSetup.jsx     # The only bootstrap path: creates the main org + first super_admin
│   │   │   ├── AdminDashboardNew.jsx  # super_admin dashboard (biggest file — every admin tab lives here)
│   │   │   ├── DistributorPerformance.jsx
│   │   │   ├── OrgSettings.jsx        # Receipt branding editor
│   │   │   ├── ReturnReplace.jsx
│   │   │   ├── Quotations.jsx / Suppliers.jsx
│   │   │   ├── SystemStatus.jsx       # Storage usage + Data Archive
│   │   │   └── WarrantyClaims.jsx
│   │   │
│   │   └── index.css / theme.css / pos-system.css   # Tailwind base + design tokens + POS-specific styles
│   │
│   ├── index.html
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── package.json
│
└── supabase/                       # one Supabase project, one schema
    ├── schema.sql                      # The whole database: tables, indexes, RLS, RPC functions, storage — run top-to-bottom; safe to re-run to upgrade
    ├── reset.sql                       # Drops everything schema.sql creates — run first if resetting an existing project
    ├── functions/admin-user-actions/   # Edge Function: every account create/delete/password change
    └── seed_products.sql               # Optional: 20 demo products + starting stock for org_main_company
│
```

---

## Database schema

Defined in `supabase/schema.sql`. IDs are text strings (`genId('prefix')` in `src/lib/supabase.js` for simple client inserts, `new_id()` inside the Postgres write functions). Document numbers (`INV-20260101-000123`, `DSO-…`, `RET-…`, …) come from `next_doc_number()`, backed by one sequence, so they can't collide. Money columns are `NUMERIC(14,2)`.

| Table | Purpose |
|---|---|
| `organizations` | Main company + distributor branches |
| `users` | Profile per Supabase Auth user — `role`, `org_id`, `is_active` |
| `products` | Shared product catalogue across all orgs, incl. `warranty_months` (admin-set, e.g. 12 = 1 Year) |
| `categories` | Product categories — extensible from the Admin Products screen instead of a fixed list |
| `inventory` | Per-org stock quantities (`org_id` + `product_id` unique) |
| `sales_invoices` / `sales_items` | Invoice headers / line items — each item snapshots `warranty_months` and a computed `warranty_expires_at` from the sale date, so later changes to a product's warranty never retroactively affect units already sold |
| `payment_ledger` | Every payment transaction, against either an invoice or a supply order |
| `distributor_supply_orders` / `distributor_supply_items` | Admin → distributor stock transfers on credit |
| `stock_intake_log` | Audit trail of stock received (cost, supplier, quantity) |
| `stock_adjustments` | Manual +/- inventory corrections (damage, loss, physical-count fixes), with a reason |
| `distributor_margins` | Per-distributor product discount overrides |
| `quotations` / `quotation_items` | Price estimates, convertible to a sale |
| `returns` / `return_items` / `replacement_items` | Returns and replacements against a past invoice |
| `warranty_claims` | Warranty/service ticket tracking — optionally linked to the original `invoice_id`/`product_id`, which is what lets a claim be resolved by issuing a real replacement invoice |
| `org_settings` | Per-org receipt branding (business name, phone, footer text) |
| `profiles` | Customer contact records |

**Key Postgres RPC functions** (`supabase/schema.sql`):
- `dashboard_overview(org_id)` — one round-trip for all Overview KPIs/charts
- `top_products`, `dashboard_metrics`, `distributor_performance`, `profit_loss_report`, `customer_search`, `customer_history`
- Write functions (one transaction each, run as the caller so RLS applies): `create_sale`, `void_sale`, `record_payment`, `create_supply_order`, `confirm_supply_receipt`, `confirm_payment_claim`, `create_supplier_bill`, `stock_intake`, `adjust_stock`, `create_return`, `issue_warranty_replacement`, `create_quote`
- `reserve_stock` — atomic "decrement only if enough stock" (a single `UPDATE ... WHERE quantity_on_hand >= wanted`), the overselling guard every stock-out path uses; `increment_inventory` — upsert-on-conflict stock in
- `stock_ledger(org_id, product_id?)` — unified movement history across intake/sales/transfers/returns/adjustments, built as one query over the existing tables
- `handle_new_user` (trigger) — builds the `users` profile from the Auth user's app_metadata (set only by the Edge Function)
- `has_any_users` — the one anon-callable function (Login's "redirect to First-Time Setup?" check)
- `auth_org_id` / `auth_role` / `is_super_admin` / `can_access_org` — the RLS helpers
- `get_database_size` / `get_storage_usage` — read Postgres/Storage size directly, for the Admin **System** tab's storage-usage bars (informational only, not real billing data; return nothing to non-admins)

**Data Archive** (System tab, no RPC involved — plain table queries from `supabaseApi.js`): exports every row that would be deleted (`sales_invoices`, `sales_items`, `payment_ledger`, `returns`/`return_items`/`replacement_items`, `stock_intake_log`) to a downloadable JSON file, then — only once that export has completed and the admin types `DELETE` to confirm — deletes the matching `sales_invoices` (older than a chosen date **and** `payment_status = 'paid'`) and `stock_intake_log` rows. Deleting an invoice cascades to its `sales_items`/`returns`/`return_items`/`replacement_items`; `payment_ledger` rows survive with `invoice_id` set to `NULL` (`ON DELETE SET NULL`) so the cash history itself is never lost. Nothing with an outstanding balance is ever eligible, by design.

---

## Setup / installation

### 1. Create a Supabase project
At [supabase.com](https://supabase.com), create a new project and note its URL + anon key.

### 2. Run the SQL setup in the Supabase SQL editor
Paste and run **`supabase/schema.sql`** — one file: tables, indexes, RLS policies, RPC functions, and the storage bucket/policies, in order. It's also the upgrade path: re-running it on an existing project migrates it in place (money columns to NUMERIC, new policies and functions) without touching data.

Resetting an existing project instead of starting fresh? Run **`supabase/reset.sql`** first — it drops everything `schema.sql` creates (⚠ destructive, deletes all data) — then run `schema.sql` again.

Optionally, also run **`supabase/seed_products.sql`** afterward for a ready-made catalogue of 20 demo solar/battery/inverter/UPS/accessory products with starting stock — handy for trying out the POS without typing in your own products first. Safe to skip, and safe to re-run (it won't duplicate rows).

### 3. Point the app at your project
Copy `.env.example` to `.env` and fill in `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` from your project.

### 3b. Deploy the account Edge Function and close public signup
```bash
supabase functions deploy admin-user-actions
```
Then in the Supabase dashboard → Authentication → Sign In / Providers, turn **off** "Allow new users to sign up". Every account (including the first admin) is created through the Edge Function; a self-signup would only get a deactivated profile anyway.

### 4. Install and run
```bash
npm install
npm run dev        # http://localhost:5173, hot-reload

npm run build       # production build → dist/
npm run preview     # serve the production build locally
```

`dist/` is a static site — deploy it to Vercel, Netlify, or any static host. The only server-side piece is the Edge Function above, hosted by Supabase.

### 5. First login
With an empty `users` table, the Login screen automatically redirects to **First-Time Setup** (via the `has_any_users()` RPC) — fill in a name, email, and password there to create the main organization and the first `super_admin` account. There is no pre-seeded demo account; you create the real one yourself on first run.

Once logged in, use **All Users** to create the rest of your staff and distributor branches.

---

## Demo credentials

There are no pre-seeded accounts — the first thing you do on a fresh install is create your own `super_admin` via **First-Time Setup** (see [Setup / installation](#setup--installation) above). Any email/password examples in `GUIDE.md` (e.g. `salesman@solarpos.local`) are illustrative naming conventions, not accounts that already exist — create them yourself from **All Users** once you've logged in as the admin.

---

## Payment status logic

Computed by `payment_status_for()` in the database (and mirrored by `computePaymentStatus()` in `src/lib/supabase.js` for the one client-side balance adjustment), used identically for invoices, supply orders and supplier bills:

```
balance = total_amount - amount_paid

balance <= 0.01                    → 'paid'
balance > 0 AND due_date < today   → 'overdue'
balance > 0 AND amount_paid > 0    → 'partial'
balance > 0 AND amount_paid = 0    → 'pending'
```

A due date is required on any invoice or supply order left with a balance > 0.

---

## Known limitations

- **No offline mode.** The site requires an internet connection for everything — there's no local cache or write queue, so a dropped connection mid-action simply fails with an error, to be retried once reconnected.
- **No automated backups.** Back up your Supabase project the way you'd back up any production Postgres database (Supabase's own point-in-time recovery / scheduled backups, depending on your plan).
- Large chunks of the production JS bundle (~1.2MB, now including the POS screens) aren't code-split yet (`jspdf`, `xlsx`, `html2canvas` are pulled in eagerly) — fine for internal/small-team use, worth revisiting with dynamic `import()` if load time on slow connections becomes a problem.
- **`distributor_margins` table is currently unused.** It exists in the schema for per-distributor product discount overrides, but nothing in the app reads or writes it — distributor pricing is set ad hoc on each supply order (per-product or bulk margin %, see Distributor Supply) with no memory of past pricing per distributor. Either wire it up (auto-suggest a distributor's last-used price) or drop the table — neither has been decided yet.
- **New-shipment / receipt-confirmed notifications are in-app toasts only**, shown while the relevant tab is open and polling (every 20s) — there's no push/email notification, so nothing is delivered if the browser tab is closed.
- **Data Archive only covers `sales_invoices`/`sales_items`/`payment_ledger`/`returns`/`stock_intake_log`.** Distributor supply orders, quotations, and warranty claims aren't archived — in practice these tend to stay far smaller than sales history, so they weren't included, but this means archiving alone may not be enough if one of those grows unexpectedly large.
- **Warranty replacement invoices are zero-cost by design** (there's no partial-charge or "customer pays the difference" option like Return/Replace has) — for anything more complex than a straight swap, process it through Return/Replace instead.
