# Sameer Battery House / SolarPOS — Application Flow (Admin Website)

> This folder is the **main-admin website** (`super_admin`). Main-branch
> cashiers (`sales_user`) and distributor branch staff (`distributor_user`)
> use the separate **POS website** in `../pos-website`, which has its own copy
> of `src/lib`/`src/contexts`/most components. Both sites use the same Supabase
> project, so the data layer and inventory integrity below apply to both.
>
> Built with **React + Vite + Supabase (Postgres + Auth + Storage)**.
> **Both apps require an internet connection** — there is no offline mode or
> local write queue; every action talks to Supabase directly and fails with
> an error if the connection is down.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite + Tailwind CSS |
| Database | Supabase Postgres (see `supabase/schema.sql`) |
| Auth | Supabase Auth (email/password), profile row in `users` keyed by `auth_id` |
| File storage | Supabase Storage (`product-images` bucket) for product photos |
| PDF export | jsPDF + jsPDF-AutoTable |
| Charts | Recharts |

---

## Project Structure

```
POS/website/
├── src/
│   ├── App.jsx              # Root router — super_admin only, else a "wrong app" screen
│   ├── main.jsx             # React entry point
│   │
│   ├── lib/
│   │   ├── supabase.js           # Supabase client + genId/computePaymentStatus
│   │   └── supabaseApi.js        # Installs window.api — every data call the UI makes, backed by Supabase
│   │
│   ├── contexts/
│   │   ├── AuthContext.jsx       # Supabase Auth session + `users` profile row
│   │   └── OrganizationContext.jsx # Active org context (localStorage-persisted)
│   │
│   ├── components/
│   │   ├── AppLayout.jsx         # Shared sidebar + header shell
│   │   ├── Charts.jsx            # Recharts wrappers (Revenue, TopProducts, CategoryDonut)
│   │   ├── DesignSystem.jsx      # Shared UI primitives (Icon, Btn, Badge, StatCard, etc.)
│   │   ├── DistributorSupply.jsx # Supply order creation form + order list
│   │   ├── DueAlertBanner.jsx    # Red/yellow banner for overdue payments at top of page
│   │   ├── DuePaymentsPanel.jsx  # Full due/overdue payments panel with payment entry
│   │   └── ProtectedRoute.jsx    # Redirects unauthenticated users to /login
│   │
│   └── pages/
│       ├── Login.jsx             # Email + password login form; redirects to setup if has_any_users() is false
│       ├── FirstTimeSetup.jsx    # The only bootstrap path — creates the main org + first super_admin
│       └── AdminDashboardNew.jsx # super_admin dashboard (the only dashboard this app renders)
│
├── supabase/                     # shared by both apps — one Supabase project, one schema
│   ├── schema.sql                # The whole database: tables, RLS, RPC functions, storage — run this once
│   ├── reset.sql                 # Drops everything schema.sql creates — run first if resetting an existing project
│   └── seed_products.sql         # Optional demo product catalogue
│
└── index.html
```

Run `schema.sql` in the Supabase SQL editor once, against a fresh project, before first use.

---

## Startup Sequence

```
1. main.jsx
   ├── setupApi()               → installs window.api (src/lib/supabaseApi.js)
   ├── BrowserRouter wraps App
   ├── AuthProvider             → supabase.auth.getSession(), subscribes to auth state changes
   ├── OrganizationProvider     → restores currentOrg from localStorage if present
   └── AppRoutes renders based on user.role
```

---

## Authentication Flow

```
User opens app
│
├── Supabase session present (supabase.auth.getSession())?
│   YES → fetch matching `users` profile row by auth_id → session restored, go to role dashboard
│   NO  → redirect to /login
│
/login
├── On mount: calls has_any_users() RPC — if false, redirects to /first-time-setup
│   (this RPC exists specifically because RLS blocks an anonymous SELECT on `users`
│   from seeing any rows, which would otherwise make this check always look empty)
├── User enters email + password
├── supabase.auth.signInWithPassword(email, password)
├── AuthContext looks up the `users` profile row (id, name, role, org_id, is_active) by auth_id
│   → if missing, calls create_user_profile RPC as a fallback (the on_auth_user_created
│     trigger normally creates it automatically on signup)
└── Navigate to role-based dashboard
```

Note: signing in, and every other action in this app, requires an internet connection — there is no offline mode.

### Admin creates another staff account

`window.api.authRegister(...)` (Admin's "All Users" → Add User, and a distributor's own Staff tab) calls the `admin-user-actions` Edge Function, which holds the service-role key server-side:

```
authRegister(email, password, role, name, orgId)
  → Edge Function 'create_user'
     → checks the caller: super_admin may create anything; distributor_user may
       only add distributor_user accounts to its own branch
     → auth.admin.createUser({ ..., app_metadata: { role, org_id } })
        → on_auth_user_created trigger builds the `users` row from app_metadata
```

The admin's own browser session is never touched. Role and branch live in **app_metadata**, which only the service role can write; the trigger ignores user_metadata, so a plain `supabase.auth.signUp()` can't create a privileged account.

---

## Role-Based Routing

```
AppRoutes (App.jsx)
│
├── deactivated / no profile               → "Account not active" (sign-out prompt)
├── role === 'super_admin'                 → AdminDashboardNew   (/)
├── role === 'sales_user'/'distributor_user' → "use the POS website" (sign-out prompt)
├── any other role (legacy org_admin)      → "Unsupported account" (sign-out prompt)
└── not logged in                          → /login
                                              /first-time-setup
```

`AdminDashboardNew` uses `AppLayout` as its shell (collapsible left sidebar + header). Navigation between tabs is handled by internal `view` state — there are no sub-routes.

---

## Admin Dashboard (super_admin)

File: `src/pages/AdminDashboardNew.jsx`

| Tab | id | What it does |
|---|---|---|
| Overview | `overview` | KPI cards, 30-day revenue chart, category donut, top products |
| Products | `products` | Full product catalogue — add/edit/deactivate/delete, product photo, add new categories inline, set warranty period |
| Stock Intake | `intake` | Record stock received from suppliers |
| Sales History | `sales` | All invoices for the org — search, filter, view line items |
| Customers | `customers` | Customer search + purchase history |
| Due Payments | `dues` | Outstanding balances — record partial/full payments |
| Returns | `returns` | Process returns/replacements against a past invoice |
| Distributor Supply | `supply` | Create supply orders to distributors on credit |
| All Users | `staff` | View, add, and deactivate staff accounts |
| Warranty | `warranty` | File claims (invoice lookup auto-fills customer/product, or manual entry) and resolve one by issuing a real replacement invoice |
| Distributors | `distributors` | Distributor network performance report |
| System | `system` | Supabase DB/storage usage bars + capacity estimate, Data Archive (export + delete old paid sales data) |
| Receipt Settings | `settings` | Business info shown on printed receipts |

**Due Alert Banner** appears at the top of all tabs whenever overdue invoices or supply orders exist.

---

## POS App Dashboards (sales_user / distributor_user)

These live in the separate POS website (`../pos-website`). Its `PosDashboard.jsx` has Point of Sale, Quotations, Return/Replace, Due Payments, Inventory and Sales History for everyone. `distributor_user` also gets the tabs in `DistributorAdminViews.jsx`: Overview, Recent Activity, Incoming Stock, Main Company Account, My Products, Suppliers, Staff and Receipt Settings. The branch always comes from the signed-in user's `org_id`, and the database enforces it as well.

---

## Data Layer

### The `window.api` layer

`src/lib/supabaseApi.js` installs a `window.api` object at startup so every page can call a plain method (`window.api.salesCreate(...)`) without importing Supabase directly. Each method is a thin wrapper around either a direct Supabase table query or a Postgres RPC call:

```
React page
    ↓  window.api.someMethod(...)
src/lib/supabaseApi.js
    ↓  supabase.from('table')... / supabase.rpc('function_name', {...})
Supabase (Postgres + Auth + Storage), over HTTPS
```

There is no raw/generic SQL passthrough — every method maps to a specific table query or RPC function so it works correctly against Postgres and respects RLS.

### Method Groups

| Prefix | Methods | Purpose |
|---|---|---|
| `auth*` | Login, Register, GetUsers | User authentication (Supabase Auth + `users` profile) |
| `org*` | Create, orgsGetAll | Organization management |
| `sales*` | Create, Void, Get, GetWithItems, GetAllWithOrgNames, ItemsGet | Invoice CRUD |
| `analytics*` | Metrics, TopProducts, Overview | Aggregated dashboard queries (via RPC) |
| `inventory*` | Get, Update | Stock levels |
| `products*` | Get, GetAll, GetWithStock, Create, Update, Delete, PickImage, ImportExcel | Product catalogue |
| `stockIntake*` | Get; also see `stockIntake` under Stock Intake below | Stock intake log |
| `staff*` | Get, GetAllInOrg, GetAllWithOrgNames, Delete, SetActive | User management — `authRegister` is also how a `distributor_user`'s Staff tab adds another account to its own branch (the Edge Function enforces the branch) |
| `categories*` | Get, Create | Product categories — Create is idempotent (case-insensitive match against existing names) |
| `distributors*` | Get, Performance | Org listing / distributor network report |
| `payment*` | Record | Payment ledger entry |
| `payments*` | Get | Payment history |
| `dues*` | Get, GetOverdue | Due payments |
| `distributorSupply*` | Create, Get | Supply orders — Create supports a per-product or single bulk margin % |
| `supply*` | ConfirmReceipt, Incoming, MarginSummary | Distributor receiving flow |
| `reports*` | PL | Profit & Loss (via RPC) |
| `quotes*` | Create, Get, Convert | Quotations |
| `warranty*` | Create, Get, UpdateStatus, IssueReplacement | Warranty claims — IssueReplacement creates a zero-cost replacement invoice, decrements inventory, and resolves the claim in one step |
| `customers*` | Search, History | Customer lookup (via RPC) |
| `orgSettings*` | Get, Save | Receipt/business info |
| `return*` | LookupInvoice, Create, returnsGet | Returns & replacements |
| `stockIntake` | (orgId, data) | Record stock received |
| `systemGetUsage` | — | Postgres DB size + Storage bytes used, for the Admin System tab |
| `archivePreview` / `archiveExport` / `archiveDelete` | (cutoffDate) | Data Archive — count, export-to-JSON, and delete old fully-paid sales + stock-intake rows |

### Database Schema (Supabase Postgres — `supabase/schema.sql`)

| Table | Purpose |
|---|---|
| `organizations` | Main company + distributor orgs |
| `users` | Profile row per Supabase Auth user (role, org_id, is_active) |
| `products` | Product catalogue (shared across orgs), incl. `warranty_months` |
| `categories` | Product categories, extensible from the Admin Products screen |
| `inventory` | Per-org stock quantities |
| `sales_invoices` / `sales_items` | Invoice headers / line items — items snapshot `warranty_months` + `warranty_expires_at` at sale time |
| `payment_ledger` | Every payment transaction |
| `distributor_supply_orders` / `distributor_supply_items` | Admin → distributor stock transfers on credit |
| `stock_intake_log` | Audit trail of all stock received |
| `distributor_margins` | Per-distributor product discounts |
| `quotations` / `quotation_items` | Price estimates, convertible to a sale |
| `returns` / `return_items` / `replacement_items` | Product returns & replacements |
| `warranty_claims` | Warranty issue tracking |
| `org_settings` | Per-org receipt branding |
| `profiles` | Customer contact records |

RLS on every table (`supabase/schema.sql`, PART 2) enforces tenant isolation in the database: the main admin sees every branch, everyone else only their own (`can_access_org()`). The `org_id` filters in each query only choose what to display. Everything that moves stock or money is a Postgres function (`create_sale`, `record_payment`, `create_supply_order`, …) called through `rpc()`, so it's one transaction.

---

## No Offline Mode

Both sites require an internet connection for every action — `window.api` methods call Supabase directly and reject with an error if the request fails, with no local cache, write queue, or retry/sync mechanism. This was a deliberate simplification: an earlier version of this project had an IndexedDB-backed offline queue (cache reads, queue writes, replay on reconnect), but it added real complexity — plan/execute step-tracking, sync-conflict edge cases, a status chip — for a scenario (a till losing internet mid-sale) judged not worth that cost here. If offline support is needed again later, note that the write operations are now single database functions, so a queue would replay those calls.

---

## Bootstrapping a fresh install

There's no seed script and no pre-created demo account. On an empty database:

```
Login screen mounts
  → calls has_any_users() RPC
  → false → redirect to /first-time-setup

/first-time-setup
  → Edge Function 'bootstrap' (refuses once any user exists)
     → creates org_main_company + auth.admin.createUser(... app_metadata: { role: 'super_admin' })
     → on_auth_user_created trigger creates the matching `users` profile row
  → signIn(email, password) → navigate to /
```

`has_any_users()` is the only database function `GRANT`ed to `anon`; the account itself is created server-side by the Edge Function, so public signup can stay switched off.

The `on_auth_user_created` Postgres trigger (`supabase/schema.sql`) automatically creates the matching `users` profile row when the Supabase Auth user is created.

---

## Payment Status Logic

Computed in `src/lib/supabase.js → computePaymentStatus()`:

```
balance = total_amount - amount_paid

balance <= 0.01                          → 'paid'
balance > 0 AND due_date < today         → 'overdue'
balance > 0 AND amount_paid > 0          → 'partial'
balance > 0 AND amount_paid = 0          → 'pending'
```

Due date is **required** when creating any invoice or supply order with balance > 0.

---

## Inventory Integrity (no overselling)

Every write that takes stock out of an org's inventory reserves it atomically *before* creating the sale/order/return/replacement record, via a new RPC:

```sql
decrement_inventory_strict(org_id, product_id, quantity) RETURNS BOOLEAN
  -- single statement: UPDATE inventory SET quantity_on_hand = quantity_on_hand - qty
  --                   WHERE org_id = ... AND product_id = ... AND quantity_on_hand >= qty
  -- Postgres serializes the row lock, so two concurrent callers racing for the
  -- same last unit can never both return true.
```

`reserveStock(orgId, lines)` (in `supabaseApi.js`) wraps this for multi-line operations: it reserves each line in turn, and if any line comes back `false`, it rolls back (re-increments) everything already reserved in that same call and throws — so the caller can reject the whole operation with zero side effects. Used by:

- `salesCreate` (POS checkout) — reserves the cart before the invoice/items are ever inserted
- `distributorSupplyCreate` — reserves all shipped lines before the order/items are ever inserted
- `returnCreate` — reserves `replacement_items` (after crediting the returned `items` back to stock first, so a same-product swap sees that unit as available again)
- `warrantyIssueReplacement` — reserves the single replacement unit before the replacement invoice is created

`returnCreate` additionally re-derives "how much of this can still be returned" server-side from `sales_items`/`return_items` directly, rather than trusting the `qty_returnable` the client was shown at lookup time (which could be stale).

---

## Warranty Claims & Replacement

```
File a claim (two ways):
  "Look Up Invoice" → returnLookupInvoice(invoiceNumber) → pick the sold item
    → customer_name/phone, product_id/name, org_id, invoice_id all auto-filled
  "Manual Entry" → freeform serial number + description, no product/branch link
    (can't have a replacement issued directly — no inventory to draw it from)

Resolve with a replacement (only for invoice-linked claims):
  warrantyIssueReplacement(claimId, { quantity, notes })
    → reads the claim's org_id/product_id
    → creates a new sales_invoices row: total/final/paid = 0, payment_status = 'paid'
    → creates a matching sales_items row, snapshotting the product's *current*
      warranty_months into a fresh warranty_expires_at (the new unit's own
      warranty clock starts today, independent of the original sale)
    → decrement_inventory(org_id, product_id, quantity) — same RPC the POS uses
    → warranty_claims.status = 'Resolved', replacement_invoice_id = new invoice id
```

The replacement invoice is a real `sales_invoices` row (numbered `WREP-...`), so it shows up in Sales History like any other sale — just at zero cost — rather than being a side-channel adjustment nobody can audit later.

---

## Data Archive (freeing up Supabase space)

Scope: only `sales_invoices` with `payment_status = 'paid'` older than a chosen cutoff date, plus `stock_intake_log` rows older than that date. Nothing with an outstanding balance is ever eligible — Due Payments and the P&L report need every unpaid/partial/overdue invoice to stay put.

```
1. archivePreview(cutoffDate)  → counts matching rows, no data moved
2. archiveExport(cutoffDate)   → pulls every matching sales_invoices row plus its
                                  sales_items, payment_ledger, returns/return_items/
                                  replacement_items, and the matching stock_intake_log
                                  rows; the UI turns this into a downloadable .json file
3. archiveDelete(cutoffDate)   → re-queries the same matching invoice/intake ids and
                                  deletes them (chunked into batches of 200 ids to
                                  keep each request's URL length sane)
```

`archiveDelete` has no memory of whether step 2 actually happened — the System tab's UI is what enforces "export must succeed before the delete button unlocks," including a typed `DELETE` confirmation. Deleting a `sales_invoices` row cascades (via FK `ON DELETE CASCADE`) to its `sales_items` and any `returns`/`return_items`/`replacement_items` filed against it; `payment_ledger.invoice_id` is `ON DELETE SET NULL`, so those payment rows — and the cash-flow history they represent — survive the invoice being archived away.

---

## Build & Run

```bash
# One-time Supabase setup: paste supabase/schema.sql into the SQL editor and run it.
# Resetting an existing project? Run supabase/reset.sql first (drops everything).
# Optionally follow with supabase/seed_products.sql for demo products.

# Development (Vite hot-reload)
npm run dev

# Production build
npm run build
# Output: dist/ — a static site, deployable anywhere (Vercel, Netlify, static hosting, etc.)

# Preview the production build locally
npm run preview
```

All data lives in Supabase — there is no local database file. There's no desktop packaging step — it's a plain static deploy, plus the one Edge Function.
