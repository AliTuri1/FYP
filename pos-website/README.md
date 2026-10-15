# Sameer Battery House — POS Website

The counter app: a React + Supabase point-of-sale website for main-branch cashiers and distributor branch staff. The main admin uses the separate admin website (`../website`) instead. Both sites talk to the **same Supabase project**, so a sale made here shows up on the admin's Sales History immediately. It needs an internet connection at all times; there's no offline mode.

## Who signs in here

| Role | Who | What they see |
|---|---|---|
| `sales_user` | Main-branch cashier | Point of Sale, Quotations, Return/Replace, Due Payments, Inventory, Sales History |
| `distributor_user` | Distributor branch staff (merged admin+cashier, every account at a branch has full access to it) | Everything above, **plus** Overview, Recent Activity, Incoming Stock, Main Company Account, My Products, Suppliers, Staff, Receipt Settings |

`super_admin` accounts get a "use the admin website" screen. Accounts are created on the admin website's **All Users** tab, or, for a distributor branch, from its own **Staff** tab here once its first account exists. Both routes go through the `admin-user-actions` Edge Function.

## Tabs

- **Point of Sale**: product search → cart → customer info → retail/wholesale pricing → split payment (paid now / due later) → cash/bank → Complete Sale → printable/PDF receipt. The invoice number is assigned by the database.
- **Quotations**: build a price estimate and convert it into a sale later (prefills the cart).
- **Return / Replace**: look up a past invoice by number (this branch only) and process a return or exchange.
- **Due Payments**: collect on this branch's outstanding invoices.
- **Inventory / Sales History**: stock levels with low-stock highlighting; every invoice, reprintable.
- *(distributor_user)* **Incoming Stock**: confirming a shipment from head office is what adds it to this branch's stock. It can only be confirmed once.
- *(distributor_user)* **Main Company Account**: what the branch owes; report a payment, which the main admin then confirms.
- *(distributor_user)* **My Products**: the branch's own private products, plus its own retail price on any company product.
- *(distributor_user)* **Suppliers, Staff, Receipt Settings**: the branch's own suppliers and bills, its staff accounts, and what's printed on its receipts.

## Architecture

Same as the admin website: pages call `window.api.*` (`src/lib/supabaseApi.js`), which calls Supabase directly. Every stock/money write is a single Postgres function (`create_sale`, `record_payment`, `confirm_supply_receipt`, …), and row-level security limits each account to its own branch. Both are defined in `../supabase/schema.sql`.

`src/lib`, `src/contexts` and most of `src/components` are **copies** of the admin website's files, not a shared package. A fix to one of those must be made in both folders.

## Setup

The Supabase setup (schema, Edge Function, signup switched off) is shared with the admin website. See the root `README.md`.

```bash
cp .env.example .env   # same VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY as the admin website
npm install
npm run dev            # http://localhost:5174 (the admin website uses 5173)
npm run build          # static site → dist/, deploy to its own URL (e.g. a second Vercel project)
```
