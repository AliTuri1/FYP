# Sameer Battery House POS — User Guide (Admin Website)

> Cloud-based solar energy Point of Sale system, powered by Supabase.
> **This guide covers the main-admin website.** Cashiers and distributor staff use the separate **POS website** (Point of Sale, Quotations, Return/Replace, Due Payments, and — for distributor staff — branch management). A till only needs a web browser.

---

## First Login

There are no pre-set login credentials. The very first time the website is opened (before any account exists), it automatically shows **First-Time Setup** — enter a name, email, and password there to create the main organization (Sameer Battery House) and the first Super Admin account. From then on, sign in with whatever email/password you chose.

Once signed in as Super Admin, create staff from the **All Users** tab:
- **Salesman / Cashier** — a main-branch cashier, who then signs in on the POS website.
- **Distributor Staff** — the first account for a new distributor branch (also created here, or from **Distributor Supply** when adding a new distributor). After that, the branch can add more of its own staff itself from their own Staff tab on the POS website — you don't have to create every one of them.

---

## Who is Who

### Super Admin
The **owner / head office** user, and the only role that uses this website. Has full access to everything.

- Sees all sales, all inventory, all distributors, across every branch
- Creates and sends stock to distributors on credit
- Manages staff accounts (add / deactivate) — main-branch cashiers and distributor branches alike
- Edits, deactivates, and permanently deletes products, sets reorder levels and warranty periods
- Tracks warranty claims and service requests
- Looks up any customer's full purchase history and outstanding balance

Login → lands on **Admin Dashboard**, on the **Products** tab

### Distributor Staff & Salesman / Cashier
These two roles never sign in here — they use the **POS website**. A distributor branch has no separate "manager" tier: every account there (`distributor_user`) gets the same full access to that branch's POS plus its own Overview, Incoming Stock, Staff, and Receipt Settings. A main-branch cashier (`sales_user`) just gets the POS screen.

---

## Admin Dashboard — Tabs

### 1. Overview
- KPI cards: today's revenue, 30-day revenue, inventory value, all-time revenue
- 30-day revenue bar chart
- Category breakdown donut
- Top 6 products by revenue

### 2. Products
- Full catalogue with name, brand, category, retail price, cost price, margin %
- **Add new products** with reorder level threshold and an optional product photo
- **Categories aren't fixed** — type a new one and click "Add Category" right from the product form; it's saved and shows up in the category dropdown and filter pills from then on
- **Warranty** — set how long a product is covered (No Warranty, 3/6/12/24/36 months) from a dropdown on the product form; this is what starts counting down from the sale date once it's sold
- **Edit any product** — update price, brand, category, reorder level, warranty, or photo inline
- **Deactivate / Reactivate** products (soft delete — hides from POS)
- **Delete permanently** — only allowed for a product with no sales/supply/quotation/return history, to protect past invoices; otherwise deactivate it instead
- Stock column shows current qty vs reorder threshold in red when low

### 3. Stock Intake
- Record stock received from a supplier as a batch
- Select product → quantity → unit cost → Add to batch
- Commit entire batch → updates inventory + logs the receipt

### 4. Sales History
- All invoices across all branches
- Filter by branch, date range, search by invoice #, customer, phone
- Click any row to view full line-item breakdown

### 5. Customers
- Search any customer by name or phone number
- See their full summary: total spent, outstanding balance, invoice count, last purchase
- Click a customer → view every invoice they've ever made with line items

### 6. Due Payments
- All outstanding balances — customer invoices and distributor supply orders
- Shows party name, total, paid, balance, due date, overdue status
- Record partial or full payments directly from this screen

### 7. Returns
- Look up any past invoice by number and process a return (refund) or replacement, across any branch
- If the replacement item costs more than the returned one, the extra amount the customer pays is recorded as a payment too — not just refunds are tracked

### 8. Distributor Supply
- Send stock to a distributor with the correct wholesale pricing
- **Pricing mode**: apply one margin % to the whole shipment ("Bulk"), or set each product's price individually — toggle at the top of the form
- System shows your cost price, suggested wholesale price, and margin % for each product
- Set due date and any upfront payment received
- **Stock leaves your warehouse immediately** when you click Send
- Distributor's inventory is only updated **after they confirm receipt** — and you'll get an in-app notification the moment they do
- Tracks payment status (pending / partial / paid / overdue)

### 9. All Users
- View all staff accounts across the system
- Deactivate/reactivate a staff member
- Note: distributor branches can add their own additional staff directly from their own Staff tab on the POS website — you only need to create the first account for a new branch here

### 10. Warranty
- **File a claim two ways:**
  - **Look Up Invoice** (recommended) — type the receipt/invoice number, pick which product on it the claim is about; customer name/phone and the product fill in automatically, and you'll see whether that item's warranty is still valid
  - **Manual Entry** — for when the receipt isn't available; just a serial number and description, no product/branch link
- Track status: Open → In Progress → Resolved → Closed
- **Issue Replacement** — on any claim filed via invoice lookup, click **🔁 Issue Replacement** to hand the customer a new unit: it creates a real (free) replacement invoice you can find later in Sales History, takes the unit out of that branch's stock, gives the new unit its own fresh warranty period starting today, and marks the claim Resolved automatically. (Claims filed manually can't do this — there's no branch/product on file to draw stock from — update their status by hand instead.)

### 11. Distributors
- Compare all distributors side by side: total ordered, collected, outstanding, overdue
- Sort by any metric, drill into a distributor for detailed stats

### 12. System
- Supabase database size and file storage usage against typical free-tier limits, plus a rough "how many more sales can I log before this fills up" estimate (informational, not a live billing figure)
- **Data Archive** — when the database is getting full: pick a date, hit **Preview** to see how many old *fully paid* invoices qualify, click **Export Backup** to download them (and everything tied to them) as a `.json` file, then type `DELETE` and click **Delete Archived Rows** to actually remove them from Supabase and free up space. Invoices with any balance still owed are never touched, no matter how old.

### 13. Receipt Settings
- Business name, phone numbers, address, tagline, and receipt footer shown on printed receipts

---

## POS App Tabs (Point of Sale, Quotations, Return/Replace, Due Payments, Inventory, Stock Intake, Sales History, and — for distributor staff — Overview/Incoming Stock/Staff/Receipt Settings)

All of this lives on the separate POS website: making a sale, confirming an incoming shipment, and (for distributor staff) adding their own branch's staff.

---

## Inventory Protection

The app won't let a sale, a distributor shipment, a return replacement, or a warranty replacement go through for more than is actually in stock — if two people try to take the last unit at nearly the same moment, only one succeeds and the other gets a clear "not enough stock, refresh and try again" message instead of the system silently letting stock go negative.

---

## Internet Connection Required

Both websites need an internet connection at all times — there is no offline mode. If the connection drops mid-action, that action fails with an error and needs to be retried once you're back online.

---

## How Distributor Supply Works

```
STEP 1 — Admin sends stock (this website)
──────────────────────────────────────────────────
Admin Dashboard → Distributor Supply
  → Select distributor
  → Choose pricing mode: one margin % for the whole order ("Bulk"), or set each
    product's price individually ("Per Product")
  → Add products (system shows cost / retail / suggested wholesale)
  → Set wholesale price (default = cost × 1.15, 15% markup)
  → Set payment due date
  → Click "Send Stock to Distributor"

  Immediately:
  ✓ Stock removed from main company inventory
  ✓ Supply order created — status: Awaiting Confirmation
  ✗ Distributor inventory NOT yet updated

STEP 2 — Distributor receives stock (POS website)
──────────────────────────────────────────────────
POS website → Incoming Stock tab (shows red badge)
  → Reviews shipment: product names, quantities, wholesale prices
  → Physical stock arrives at their warehouse
  → Clicks "Confirm Receipt"

  After confirmation:
  ✓ Products added to distributor's inventory
  ✓ Distributor can now sell these products via POS
  ✓ Shipment marked "Stock Received ✓"
  ✓ Admin sees a toast notification the moment receipt is confirmed
    (both apps auto-refresh every 20 seconds, so nobody has to
    manually reload to see a new shipment or a confirmation)

STEP 3 — Distributor sells to end customers (POS website)
──────────────────────────────────────────────────
Distributor staff use their POS → sells at retail price
Admin tracks payments due → Due Payments tab (this website)
```

### How Pricing Works

```
Example — 300W Solar Panel:

Admin cost price (from supplier)  =  Rs 9,800
Admin wholesale price             =  Rs 11,270  (charged to distributor)
Customer retail price             =  Rs 12,500  (distributor charges customer)

Admin profit per unit    =  Rs 1,470  (wholesale − cost = 15%)
Distributor profit/unit  =  Rs 1,230  (retail − wholesale)
```

Admin sets wholesale price freely. System suggests `cost × 1.15` as default.

---

## How Warranty Replacement Works

```
Admin Dashboard → Warranty → New Claim → Look Up Invoice
  → Enter the invoice/receipt number → Find Invoice
  → Pick which product on that invoice the claim is about
  → Enter quantity + describe the issue → File Claim

  Claim sits at status: Open

Later, once the issue is confirmed and a replacement is warranted:
  → Click "🔁 Issue Replacement" on that claim
  → Confirm quantity, add a note if useful → Issue Replacement

  Immediately:
  ✓ A new, zero-cost invoice is created for the customer (shows in Sales History)
  ✓ The replacement unit is deducted from that branch's inventory
  ✓ The new unit gets its own fresh warranty period, starting today
  ✓ The claim is automatically marked Resolved
```

If a claim was filed without an invoice on hand (Manual Entry), it has no branch or product on record, so replacement can't be issued automatically — resolve those by updating the status dropdown once the issue is handled some other way.

---

## Freeing Up Space When Supabase Is Getting Full

```
Admin Dashboard → System → Data Archive
  → Pick a date ("archive data older than…")
  → Click "Preview" — shows how many fully-paid invoices and stock-intake
    logs qualify (invoices with any balance still owed are never included)
  → Click "1. Export Backup (.json)" — downloads everything that would be
    archived to a file on your computer; keep it somewhere safe
  → Type DELETE in the confirmation box
  → Click "2. Delete Archived Rows" — removes those rows from Supabase

  Result: the database shrinks back down, freeing up room on the free tier,
  while the old records still exist in the backup file you downloaded.
```

This only ever touches **fully paid** sales and old stock-intake logs — anything a customer still owes money on is left alone so Due Payments and your reports stay correct.

---

## Payment Status

| Status | Meaning |
|---|---|
| **paid** | Full amount received |
| **partial** | Some payment received, balance remaining, due date in future |
| **pending** | No payment, due date in future |
| **overdue** | Balance remaining AND due date has passed |

---

## Where Your Data Lives

All data is stored in a single Supabase (Postgres) project in the cloud, — the admin website and the POS website are two front ends on the same data, with no sync step between them. Each branch can only see its own rows; that's enforced by the database itself.
