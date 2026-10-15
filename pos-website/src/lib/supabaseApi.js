import { supabase, genId, computePaymentStatus } from './supabase'

// Calls one of the Postgres write functions in supabase/schema.sql and returns
// the { success, ...result } / { success: false, error } shape every page
// expects. Anything that moves stock or money goes through one of these, so it
// runs as a single database transaction — it either fully happens or leaves no
// trace, even if the connection drops halfway.
async function rpc(fn, args) {
  try {
    const { data, error } = await supabase.rpc(fn, args)
    if (error) throw error
    return { success: true, ...(data || {}) }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

// Same, for the admin-user-actions Edge Function (anything needing the
// service-role key: creating, deleting, or re-passwording accounts).
async function userAction(body) {
  try {
    const { data, error } = await supabase.functions.invoke('admin-user-actions', { body })
    if (error) throw error
    if (!data?.success) throw new Error(data?.error || 'Request failed')
    return data
  } catch (err) {
    return { success: false, error: err.message }
  }
}

// Splits an array into fixed-size pieces — used to keep `.in(...)` filters
// (which become URL query params under the hood) from growing unbounded when
// archiving thousands of old rows at once.
function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

export function setupApi() {
  window.api = {
    // ─── Auth ──────────────────────────────────────────────────────────────────
    // Creates ANOTHER staff account (the admin's All Users tab, or a distributor
    // adding staff to its own branch) via the Edge Function, which checks who's
    // asking. Real end-user login goes through AuthContext.signIn() directly.
    authRegister: async (email, password, role, name, orgId = null) =>
      userAction({ action: 'create_user', email, password, role, name, orgId }),

    // ─── Organization ──────────────────────────────────────────────────────────
    orgCreate: async (name, type, email, phone, city) => {
      try {
        const id = genId('org')
        const { error } = await supabase.from('organizations').insert({ id, name, type, email, phone, city })
        if (error) throw error
        return { success: true, org_id: id }
      } catch (err) {
        return { success: false, error: err.message }
      }
    },

    // ─── Sales ─────────────────────────────────────────────────────────────────
    salesCreate: async (saleData) => rpc('create_sale', { p: saleData }),

    salesGet: async (orgId) => {
      try {
        const { data, error } = await supabase
          .from('sales_invoices')
          .select('*')
          .eq('org_id', orgId)
          .order('local_created_at', { ascending: false })
          .limit(200)
        if (error) throw error
        return { success: true, data: data || [] }
      } catch (err) {
        return { success: false, error: err.message }
      }
    },

    // All invoices across every org, with the org name joined in (super_admin cross-branch view)
    salesGetAllWithOrgNames: async () => {
      try {
        const { data, error } = await supabase
          .from('sales_invoices')
          .select('*, organizations!left(name)')
          .order('local_created_at', { ascending: false })
          .limit(500)
        if (error) throw error
        const mapped = (data || []).map(r => ({
          ...r, org_name: r.organizations?.name || r.org_id, organizations: undefined,
        }))
        return { success: true, data: mapped }
      } catch (err) {
        return { success: false, error: err.message }
      }
    },

    // Line items for a single invoice, with product name/category/brand joined in
    salesItemsGet: async (invoiceId) => {
      try {
        const { data, error } = await supabase
          .from('sales_items')
          .select('*, products!left(name, category, brand)')
          .eq('invoice_id', invoiceId)
        if (error) throw error
        const mapped = (data || []).map(i => ({
          ...i, product_name: i.products?.name || 'Unknown',
          category: i.products?.category, brand: i.products?.brand, products: undefined,
        }))
        return { success: true, data: mapped }
      } catch (err) {
        return { success: false, error: err.message }
      }
    },

    // Cancels a sale that should never have counted — restores every line's
    // stock (logged as a stock_adjustments row, reason='sale_void', so it's
    // fully visible in Stock Ledger/Activity Feed/Batch History) and marks the
    // invoice voided everywhere revenue/dues are computed. The invoice and its
    // items are kept, not deleted — voiding is a reversal, not an erasure.
    // Refuses if a return or warranty claim already exists against it (that
    // history would become nonsensical against a voided sale); process a
    // return instead in that case.
    salesVoid: async (invoiceId, reason, voidedBy) =>
      rpc('void_sale', { p_invoice_id: invoiceId, p_reason: reason || '', p_voided_by: voidedBy || '' }),

    // ─── Analytics ─────────────────────────────────────────────────────────────
    analyticsMetrics: async (orgId) => {
      try {
        const { data: data, error } = await supabase.rpc('dashboard_metrics', { p_org_id: orgId })
        if (error) throw error
        return { success: true, data }
      } catch (err) {
        return { success: false, error: err.message }
      }
    },

    // KPI cards + 30-day chart + category breakdown + top products in one round trip
    analyticsOverview: async (orgId) => {
      try {
        const { data, error } = await supabase.rpc('dashboard_overview', { p_org_id: orgId })
        if (error) throw error
        return { success: true, data }
      } catch (err) {
        return { success: false, error: err.message }
      }
    },

    analyticsTopProducts: async (orgId, days = 30) => {
      try {
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
        const { data, error } = await supabase.rpc('top_products', { p_org_id: orgId, p_since: since })
        if (error) throw error
        return { success: true, data: data || [] }
      } catch (err) {
        return { success: false, error: err.message }
      }
    },

    // ─── Inventory ─────────────────────────────────────────────────────────────
    inventoryGet: async (orgId) => {
      try {
        const { data, error } = await supabase
          .from('inventory')
          .select('*, products!inner(name, retail_price)')
          .eq('org_id', orgId)
          .order('products.name')
        if (error) throw error

        const mapped = (data || []).map(i => ({
          ...i,
          name: i.products?.name,
          retail_price: i.products?.retail_price,
          products: undefined,
        }))
        return { success: true, data: mapped }
      } catch (err) {
        return { success: false, error: err.message }
      }
    },

    inventoryUpdate: async (orgId, productId, quantity) => {
      try {
        const { data: existing } = await supabase
          .from('inventory')
          .select('id')
          .eq('org_id', orgId)
          .eq('product_id', productId)
          .maybeSingle()

        if (existing) {
          await supabase.from('inventory').update({ quantity_on_hand: quantity }).eq('id', existing.id)
        } else {
          await supabase.from('inventory').insert({ id: genId('inv'), org_id: orgId, product_id: productId, quantity_on_hand: quantity })
        }
        return { success: true }
      } catch (err) {
        return { success: false, error: err.message }
      }
    },

    // ─── Categories ────────────────────────────────────────────────────────────
    categoriesGet: async () => {
      try {
        const { data, error } = await supabase.from('categories').select('*').order('name')
        if (error) throw error
        return { success: true, data: data || [] }
      } catch (err) {
        return { success: false, error: err.message }
      }
    },

    categoriesCreate: async (name) => {
      try {
        const trimmed = (name || '').trim()
        if (!trimmed) throw new Error('Category name is required')
        const { data: existing } = await supabase.from('categories').select('id, name').ilike('name', trimmed).maybeSingle()
        if (existing) return { success: true, id: existing.id, alreadyExisted: true }
        const id = genId('cat')
        const { error } = await supabase.from('categories').insert({ id, name: trimmed })
        if (error) throw error
        return { success: true, id }
      } catch (err) {
        return { success: false, error: err.message }
      }
    },

    // ─── Products ──────────────────────────────────────────────────────────────
    productsGet: async () => {
      try {
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .eq('is_active', true)
          .order('name')
        if (error) throw error
        return { success: true, data: data || [] }
      } catch (err) {
        return { success: false, error: err.message }
      }
    },

    // orgId set = a distributor branch's own private product (see
    // productsGetWithStock); omitted = a shared catalogue product (admin only).
    productsCreate: async (product, orgId = null) => {
      try {
        const id = genId('prod')
        const { error } = await supabase.from('products').insert({
          id, org_id: orgId, name: product.name, category: product.category, brand: product.brand || '',
          retail_price: product.retail_price, cost_price: product.cost_price || 0,
          wholesale_price: product.wholesale_price || 0,
          retail_markup_pct: product.retail_markup_pct ?? null,
          wholesale_markup_pct: product.wholesale_markup_pct ?? null,
          reorder_level: product.reorder_level || 5, image_path: product.image_path || '',
          warranty_months: parseInt(product.warranty_months) || 0,
        })
        if (error) throw error
        return { success: true, id }
      } catch (err) {
        return { success: false, error: err.message }
      }
    },

    productsUpdate: async (product) => {
      try {
        await supabase.from('products').update({
          name: product.name, category: product.category, brand: product.brand || '',
          retail_price: product.retail_price, cost_price: product.cost_price || 0,
          wholesale_price: product.wholesale_price || 0,
          retail_markup_pct: product.retail_markup_pct ?? null,
          wholesale_markup_pct: product.wholesale_markup_pct ?? null,
          reorder_level: product.reorder_level || 5, image_path: product.image_path || '',
          warranty_months: parseInt(product.warranty_months) || 0,
          is_active: product.is_active !== false,
        }).eq('id', product.id)
        return { success: true }
      } catch (err) {
        return { success: false, error: err.message }
      }
    },

    // Shared/global products only (org_id IS NULL) — a distributor branch's own
    // private products (org_id set) never appear on the admin website.
    productsGetAll: async () => {
      try {
        const { data, error } = await supabase.from('products').select('*').is('org_id', null).order('name')
        if (error) throw error
        return { success: true, data: data || [] }
      } catch (err) {
        return { success: false, error: err.message }
      }
    },

    // Permanently deletes a product. Refuses if it has any sales/order/quote history
    // (those rows would otherwise cascade-delete and corrupt historical invoices/reports) —
    // deactivate those instead. Safe to hard-delete a product that was never actually sold.
    productsDelete: async (id) => {
      try {
        const checks = await Promise.all([
          supabase.from('sales_items').select('id', { count: 'exact', head: true }).eq('product_id', id),
          supabase.from('distributor_supply_items').select('id', { count: 'exact', head: true }).eq('product_id', id),
          supabase.from('quotation_items').select('id', { count: 'exact', head: true }).eq('product_id', id),
          supabase.from('return_items').select('id', { count: 'exact', head: true }).eq('product_id', id),
          supabase.from('replacement_items').select('id', { count: 'exact', head: true }).eq('product_id', id),
        ])
        for (const r of checks) if (r.error) throw r.error
        const hasHistory = checks.some(r => (r.count || 0) > 0)
        if (hasHistory) {
          return { success: false, error: 'This product has sales, supply, quotation, or return history and cannot be deleted. Deactivate it instead.' }
        }
        const { error } = await supabase.from('products').delete().eq('id', id)
        if (error) throw error
        return { success: true }
      } catch (err) {
        return { success: false, error: err.message }
      }
    },

    // All shared/global products (org_id IS NULL — see productsGetAll) with this
    // org's qty_on_hand merged in.
    productsGetWithStock: async (orgId, activeOnly = false) => {
      try {
        let query = supabase.from('products').select('*').or(`org_id.is.null,org_id.eq.${orgId}`).order('category').order('name')
        if (activeOnly) query = query.eq('is_active', true)
        const [{ data: products, error: perr }, { data: inv, error: ierr }, { data: overrides, error: oerr }] = await Promise.all([
          query,
          supabase.from('inventory').select('product_id, quantity_on_hand').eq('org_id', orgId),
          supabase.from('org_product_prices').select('product_id, retail_price').eq('org_id', orgId),
        ])
        if (perr) throw perr
        if (ierr) throw ierr
        if (oerr) throw oerr
        const qtyMap = {}
        for (const row of (inv || [])) qtyMap[row.product_id] = row.quantity_on_hand
        const overrideMap = {}
        for (const row of (overrides || [])) overrideMap[row.product_id] = row.retail_price
        const mapped = (products || []).map(p => {
          const isOwn = p.org_id === orgId
          const override = !isOwn ? overrideMap[p.id] : undefined
          return {
            ...p, qty_on_hand: qtyMap[p.id] ?? 0, is_own: isOwn,
            has_price_override: override !== undefined,
            company_retail_price: p.retail_price,
            retail_price: override !== undefined ? override : p.retail_price,
          }
        })
        return { success: true, data: mapped }
      } catch (err) {
        return { success: false, error: err.message }
      }
    },

    // ─── Per-branch retail price override (shared products only) ─────────────────
    productPriceOverrideSet: async (orgId, productId, retailPrice) => {
      try {
        const price = parseFloat(retailPrice)
        if (!(price > 0)) throw new Error('Enter a valid price')
        const { error } = await supabase.from('org_product_prices').upsert({
          id: genId('opp'), org_id: orgId, product_id: productId, retail_price: price, updated_at: new Date().toISOString(),
        }, { onConflict: 'org_id,product_id' })
        if (error) throw error
        return { success: true }
      } catch (err) {
        return { success: false, error: err.message }
      }
    },

    productPriceOverrideClear: async (orgId, productId) => {
      try {
        const { error } = await supabase.from('org_product_prices').delete().eq('org_id', orgId).eq('product_id', productId)
        if (error) throw error
        return { success: true }
      } catch (err) {
        return { success: false, error: err.message }
      }
    },

    productsPickImage: async (productId) => {
      return new Promise((resolve) => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = 'image/*'
        input.onchange = async () => {
          const file = input.files?.[0]
          if (!file) return resolve({ success: false, canceled: true })

          const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
          const fileName = `${productId || 'product'}_${Date.now()}.${ext}`

          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('product-images')
            .upload(fileName, file, { upsert: true })

          if (uploadError) {
            const reader = new FileReader()
            reader.onload = async (e) => {
              const dataUrl = e.target?.result
              if (productId && dataUrl) {
                await supabase.from('products').update({ image_path: dataUrl }).eq('id', productId)
              }
              resolve({ success: true, imagePath: dataUrl || '' })
            }
            reader.readAsDataURL(file)
            return
          }

          const publicUrl = supabase.storage
            .from('product-images')
            .getPublicUrl(fileName).data.publicUrl
          if (productId && publicUrl) {
            await supabase.from('products').update({ image_path: publicUrl }).eq('id', productId)
          }
          resolve({ success: true, imagePath: publicUrl })
        }
        input.click()
      })
    },

    productsImportExcel: async () => {
      return new Promise((resolve) => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = '.xlsx,.xls,.csv'
        input.onchange = async () => {
          const file = input.files?.[0]
          if (!file) return resolve({ success: false, canceled: true })
          const reader = new FileReader()
          reader.onload = async (e) => {
            try {
              const XLSX = await import('xlsx')
              const data = new Uint8Array(e.target?.result)
              const wb = XLSX.read(data, { type: 'array' })
              const ws = wb.Sheets[wb.SheetNames[0]]
              const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })
              if (!rows.length) return resolve({ success: false, error: 'No data found in the file.' })

              const COL = {
                name: ['name', 'product name', 'product_name', 'item', 'item name'],
                category: ['category', 'cat', 'type'],
                brand: ['brand', 'make', 'manufacturer'],
                retail_price: ['retail price', 'retail_price', 'price', 'selling price', 'mrp'],
                cost_price: ['cost price', 'cost_price', 'cost', 'purchase price'],
                reorder_level: ['reorder level', 'reorder_level', 'min stock', 'minimum stock'],
                sku: ['sku', 'code', 'part number', 'item code'],
              }

              function getVal(row, aliases) {
                for (const k of Object.keys(row)) {
                  if (aliases.some(a => k.trim().toLowerCase() === a)) return row[k]
                }
                return ''
              }

              const imported = []
              const errors = []

              for (let i = 0; i < rows.length; i++) {
                const row = rows[i]
                const name = String(getVal(row, COL.name) || '').trim()
                if (!name) { errors.push(`Row ${i + 2}: missing product name`); continue }
                const retail = parseFloat(getVal(row, COL.retail_price)) || 0
                if (retail <= 0) { errors.push(`Row ${i + 2} (${name}): retail price must be > 0`); continue }
                const id = genId('prod')
                const category = String(getVal(row, COL.category) || 'General').trim()
                const brand = String(getVal(row, COL.brand) || '').trim()
                const cost = parseFloat(getVal(row, COL.cost_price)) || 0
                const reorder = parseInt(getVal(row, COL.reorder_level)) || 5
                const sku = String(getVal(row, COL.sku) || '').trim()
                try {
                  await supabase.from('products').upsert({
                    id, name, category, brand, retail_price: retail, cost_price: cost,
                    reorder_level: reorder, sku, is_active: true,
                  }, { onConflict: 'id', ignore: true })
                  imported.push(name)
                } catch (e) {
                  errors.push(`Row ${i + 2} (${name}): ${e.message}`)
                }
              }

              resolve({ success: true, imported: imported.length, errors, message: `Imported ${imported.length} products.${errors.length ? ` ${errors.length} rows skipped.` : ''}` })
            } catch (err) {
              resolve({ success: false, error: err.message })
            }
          }
          reader.readAsArrayBuffer(file)
        }
        input.click()
      })
    },

    // ─── Stock Intake ──────────────────────────────────────────────────────────
    // Quick receive with no supplier bill (e.g. opening stock) — every line in
    // one transaction. lines: [{ product_id, quantity, unit_cost }]
    stockIntake: async (orgId, { lines, supplier = '', notes = '', received_by = '' }) =>
      rpc('stock_intake', { p: { org_id: orgId, lines, supplier, notes, received_by } }),

    stockIntakeGet: async (orgId, limit = 200) => {
      try {
        const { data, error } = await supabase
          .from('stock_intake_log')
          .select('*, products!left(name, category, brand)')
          .eq('org_id', orgId)
          .order('created_at', { ascending: false })
          .limit(limit)

        if (error) throw error
        const mapped = (data || []).map(r => ({
          ...r,
          product_name: r.products?.name || 'Unknown',
          category: r.products?.category,
          brand: r.products?.brand,
          products: undefined,
        }))
        return { success: true, data: mapped }
      } catch (err) {
        return { success: false, error: err.message }
      }
    },

    // ─── Suppliers & Bills (accounts payable — what's owed to whom for stock received) ──
    suppliersGet: async (orgId) => {
      try {
        const { data, error } = await supabase.from('suppliers').select('*').eq('org_id', orgId).order('name')
        if (error) throw error
        return { success: true, data: data || [] }
      } catch (err) {
        return { success: false, error: err.message }
      }
    },

    suppliersCreate: async (orgId, supplier) => {
      try {
        if (!supplier?.name) throw new Error('Supplier name is required')
        const id = genId('sup')
        const { error } = await supabase.from('suppliers').insert({
          id, org_id: orgId, name: supplier.name, phone: supplier.phone || '', email: supplier.email || '', address: supplier.address || '',
        })
        if (error) throw error
        return { success: true, id }
      } catch (err) {
        return { success: false, error: err.message }
      }
    },

    suppliersUpdate: async (supplier) => {
      try {
        const { error } = await supabase.from('suppliers').update({
          name: supplier.name, phone: supplier.phone || '', email: supplier.email || '', address: supplier.address || '',
          is_active: supplier.is_active !== false,
        }).eq('id', supplier.id)
        if (error) throw error
        return { success: true }
      } catch (err) {
        return { success: false, error: err.message }
      }
    },

    // Per-supplier accounts-payable summary: total billed, paid, outstanding, overdue.
    supplierPerformanceGet: async (orgId) => {
      try {
        const { data, error } = await supabase.rpc('supplier_performance', { p_org_id: orgId })
        if (error) throw error
        return { success: true, data: data || [] }
      } catch (err) {
        return { success: false, error: err.message }
      }
    },

    // Creates a bill for a delivery received from a supplier — increments inventory
    // per line (stock is coming IN, unlike distributorSupplyCreate which reserves/
    // decrements), logs each line into stock_intake_log tagged with this bill, and
    // records an initial payment if any was made up front. Mirrors distributorSupplyCreate.
    supplierBillCreate: async (orgId, { supplierId, lines, dueDate, amountPaid = 0, paymentMethod, notes, receivedBy }) =>
      rpc('create_supplier_bill', { p: {
        org_id: orgId, supplier_id: supplierId, due_date: dueDate || null, amount_paid: amountPaid,
        payment_method: paymentMethod, notes, received_by: receivedBy,
        lines: (lines || []).map(l => ({ product_id: l.productId, quantity: l.quantity, unit_cost: l.unitCost })),
      } }),

    // All bills for this org (or just one supplier's), each with its line items
    // (the matching stock_intake_log rows) joined in.
    supplierBillsGet: async (orgId, supplierId = null) => {
      try {
        let query = supabase.from('supplier_bills').select('*, suppliers(name)').eq('org_id', orgId).order('created_at', { ascending: false })
        if (supplierId) query = query.eq('supplier_id', supplierId)
        const { data: bills, error } = await query
        if (error) throw error

        const mapped = []
        for (const b of (bills || [])) {
          const { data: items } = await supabase.from('stock_intake_log').select('*, products!left(name)').eq('bill_id', b.id)
          mapped.push({
            ...b, supplier_name: b.suppliers?.name || '', suppliers: undefined,
            items: (items || []).map(i => ({ ...i, product_name: i.products?.name || 'Unknown', products: undefined })),
          })
        }
        return { success: true, data: mapped }
      } catch (err) {
        return { success: false, error: err.message }
      }
    },

    supplierBillPayment: async (billId, amount, paymentMethod, notes) =>
      rpc('record_payment', { p_kind: 'bill', p_id: billId, p_amount: parseFloat(amount), p_method: paymentMethod || 'cash', p_notes: notes || '' }),

    // One supplier's full statement — every bill (with what it contained) as a
    // debit, every payment as a credit, oldest first.
    supplierLedgerGet: async (orgId, supplierId) => {
      try {
        const { data, error } = await supabase.rpc('supplier_ledger', { p_org_id: orgId, p_supplier_id: supplierId })
        if (error) throw error
        return { success: true, data: data || [] }
      } catch (err) {
        return { success: false, error: err.message }
      }
    },

    // One distributor branch's full statement, from this org's side — every
    // shipment sent (with what it contained) as a debit, every payment received
    // as a credit, oldest first.
    distributorLedgerGet: async (fromOrgId, distributorId) => {
      try {
        const { data, error } = await supabase.rpc('distributor_ledger', { p_from_org_id: fromOrgId, p_distributor_id: distributorId })
        if (error) throw error
        return { success: true, data: data || [] }
      } catch (err) {
        return { success: false, error: err.message }
      }
    },

    // ─── Payment Claims (a distributor reporting "we paid you X", awaiting this org's confirmation) ──
    paymentClaimsGetPending: async (fromOrgId) => {
      try {
        const { data, error } = await supabase
          .from('payment_claims')
          .select('*, distributor_supply_orders!inner(order_number, from_org_id, organizations!distributor_supply_orders_distributor_id_fkey(name))')
          .eq('status', 'pending')
          .eq('distributor_supply_orders.from_org_id', fromOrgId)
          .order('submitted_at', { ascending: true })
        if (error) throw error
        const mapped = (data || []).map(c => ({
          ...c, order_number: c.distributor_supply_orders?.order_number,
          distributor_name: c.distributor_supply_orders?.organizations?.name || '',
          distributor_supply_orders: undefined,
        }))
        return { success: true, data: mapped }
      } catch (err) {
        return { success: false, error: err.message }
      }
    },

    // Confirming goes through record_payment — the exact same path the admin's
    // own manual "Record Payment" button runs — so a confirmed claim and a
    // directly-recorded payment behave identically.
    paymentClaimConfirm: async (claimId, confirmedBy) =>
      rpc('confirm_payment_claim', { p_claim_id: claimId, p_confirmed_by: confirmedBy || '' }),

    paymentClaimReject: async (claimId, confirmedBy, reason) => {
      try {
        const { error } = await supabase.from('payment_claims')
          .update({ status: 'rejected', confirmed_by: confirmedBy || '', confirmed_at: new Date().toISOString(), notes: reason || '' })
          .eq('id', claimId)
        if (error) throw error
        return { success: true }
      } catch (err) {
        return { success: false, error: err.message }
      }
    },

    // ─── Stock Adjustments (manual +/- correction: damage, loss, count fixes) ────
    stockAdjustmentCreate: async (orgId, { productId, quantityChange, reason = 'other', notes = '', createdBy = '' }) =>
      rpc('adjust_stock', {
        p_org_id: orgId, p_product_id: productId || null, p_quantity_change: parseInt(quantityChange) || 0,
        p_reason: reason, p_notes: notes, p_created_by: createdBy,
      }),

    // ─── Stock Movement Ledger (unified history across intake/sales/transfers/returns/adjustments) ──
    stockLedgerGet: async (orgId, productId = null, limit = 200) => {
      try {
        const { data, error } = await supabase.rpc('stock_ledger', { p_org_id: orgId, p_product_id: productId, p_limit: limit })
        if (error) throw error
        return { success: true, data: data || [] }
      } catch (err) {
        return { success: false, error: err.message }
      }
    },

    // ─── Activity Feed (sales, payments, stock moves, supply orders, returns, warranty, staff, products) ──
    // orgId omitted/null = network-wide feed across every branch (super_admin only,
    // in practice — see activity_feed's privacy notes for why a distributor's own
    // private products never leak into this view).
    activityFeedGet: async (orgId = null, limit = 100) => {
      try {
        const { data, error } = await supabase.rpc('activity_feed', { p_org_id: orgId, p_limit: limit })
        if (error) throw error
        return { success: true, data: data || [] }
      } catch (err) {
        return { success: false, error: err.message }
      }
    },

    // ─── Sales with items ──────────────────────────────────────────────────────
    salesGetWithItems: async (orgId) => {
      try {
        const { data: sales, error } = await supabase
          .from('sales_invoices')
          .select('*')
          .eq('org_id', orgId)
          .order('local_created_at', { ascending: false })
          .limit(100)
        if (error) throw error

        for (const sale of sales || []) {
          const { data: items } = await supabase
            .from('sales_items')
            .select('*, products!left(name)')
            .eq('invoice_id', sale.id)
          sale.items = (items || []).map(i => ({
            ...i, product_name: i.products?.name || 'Unknown', products: undefined,
          }))
        }
        return { success: true, data: sales || [] }
      } catch (err) {
        return { success: false, error: err.message }
      }
    },

    // ─── Staff ─────────────────────────────────────────────────────────────────
    staffGet: async (orgId) => {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('id, name, email, role, is_active')
          .eq('org_id', orgId)
          .eq('role', 'sales_user')
        if (error) throw error
        return { success: true, data: data || [] }
      } catch (err) {
        return { success: false, error: err.message }
      }
    },

    // All staff (any role) belonging to one branch/org — used by the Staff tab
    staffGetAllInOrg: async (orgId) => {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('id, name, email, role, is_active, created_at')
          .eq('org_id', orgId)
          .order('created_at', { ascending: false })
        if (error) throw error
        return { success: true, data: data || [] }
      } catch (err) {
        return { success: false, error: err.message }
      }
    },

    // Every user system-wide, with their org name joined in — used by super_admin's All Users tab
    staffGetAllWithOrgNames: async () => {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('id, auth_id, name, email, phone, role, is_active, created_at, organizations!left(name)')
          .order('created_at', { ascending: false })
        if (error) throw error
        const mapped = (data || []).map(u => ({
          ...u, org_name: u.organizations?.name, organizations: undefined,
        }))
        return { success: true, data: mapped }
      } catch (err) {
        return { success: false, error: err.message }
      }
    },

    staffSetActive: async (userId, isActive) => {
      try {
        await supabase.from('users').update({ is_active: isActive }).eq('id', userId)
        return { success: true }
      } catch (err) {
        return { success: false, error: err.message }
      }
    },

    // Both routed through the admin-user-actions Edge Function — setting a
    // password and deleting an auth account both require the service-role
    // key, which only ever lives server-side (see that function's comment).
    staffSetPassword: async (userId, authId, newPassword) =>
      userAction({ action: 'set_password', userId, authId, newPassword }),

    staffDelete: async (userId, authId) =>
      userAction({ action: 'delete_user', userId, authId }),

    // Name/phone are plain table columns, but email is also the auth login
    // credential — routed through the same Edge Function as set_password so
    // it can update auth.users, not just the users table (see that function's
    // 'update_profile' comment).
    staffUpdateProfile: async (userId, authId, { name, phone, email }) =>
      userAction({ action: 'update_profile', userId, authId, name, phone, email }),

    // ─── Organizations ─────────────────────────────────────────────────────────
    orgsGetAll: async () => {
      try {
        const { data, error } = await supabase.from('organizations').select('id, name, type').order('name')
        if (error) throw error
        return { success: true, data: data || [] }
      } catch (err) {
        return { success: false, error: err.message }
      }
    },

    // ─── Distributors ──────────────────────────────────────────────────────────
    distributorsGet: async () => {
      try {
        const { data, error } = await supabase
          .from('organizations')
          .select('*')
          .eq('type', 'distributor')
          .order('name')
        if (error) throw error
        return { success: true, data: data || [] }
      } catch (err) {
        return { success: false, error: err.message }
      }
    },

    // ─── Payments & Dues ───────────────────────────────────────────────────────
    paymentRecord: async (data) => {
      const kind = data.invoice_id ? 'invoice' : data.supply_order_id ? 'supply' : null
      if (!kind) return { success: false, error: 'invoice_id or supply_order_id is required' }
      return rpc('record_payment', {
        p_kind: kind, p_id: data.invoice_id || data.supply_order_id, p_amount: parseFloat(data.amount),
        p_method: data.payment_method || 'cash', p_notes: data.notes || '',
      })
    },

    // Corrects what a distributor owes without pretending money changed hands —
    // a write-off, a goodwill discount, or fixing a data-entry mistake. Distinct
    // from paymentRecord/paymentClaimConfirm on purpose: those move amount_paid
    // (real cash in), this moves total_amount (what's actually owed). Logged into
    // the order's own notes so the reason stays visible right on the order.
    distributorOrderAdjustBalance: async (orderId, delta, reason, adjustedBy) => {
      try {
        const amt = parseFloat(delta)
        if (!amt) throw new Error('Enter a non-zero adjustment amount')
        if (!reason?.trim()) throw new Error('A reason is required')

        const { data: order, error: orderErr } = await supabase.from('distributor_supply_orders').select('*').eq('id', orderId).single()
        if (orderErr) throw orderErr
        if (!order) throw new Error('Supply order not found')

        const paid = parseFloat(order.amount_paid) || 0
        const newTotal = Math.max(paid, order.total_amount + amt)
        const status = computePaymentStatus(newTotal, paid, order.due_date)
        const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ')
        const noteLine = `[Balance adjusted ${stamp} by ${adjustedBy || 'admin'}: ${amt >= 0 ? '+' : ''}${amt} — ${reason.trim()}]`

        const { error: updErr } = await supabase.from('distributor_supply_orders').update({
          total_amount: newTotal, payment_status: status,
          notes: order.notes ? `${order.notes}\n${noteLine}` : noteLine,
        }).eq('id', orderId)
        if (updErr) throw updErr

        return { success: true, total_amount: newTotal, payment_status: status, balance: newTotal - paid }
      } catch (err) {
        return { success: false, error: err.message }
      }
    },

    // The single main-branch org a distributor's account is with.
    mainOrgGet: async () => {
      try {
        const { data, error } = await supabase.from('organizations').select('id, name').eq('type', 'main').single()
        if (error) throw error
        return { success: true, data }
      } catch (err) {
        return { success: false, error: err.message }
      }
    },

    // ─── Payment Claims, distributor side (report a payment to the main company) ──
    // Deliberately does NOT touch distributor_supply_orders.amount_paid — only
    // the main company confirming it (paymentClaimConfirm) does that, so a
    // distributor can't unilaterally change what it owes.
    paymentClaimSubmit: async (distributorId, { supplyOrderId, amount, paymentMethod, notes, submittedBy }) => {
      try {
        const amt = parseFloat(amount) || 0
        if (amt <= 0) throw new Error('Enter a valid amount')
        const { data: order, error: orderErr } = await supabase.from('distributor_supply_orders').select('total_amount, amount_paid').eq('id', supplyOrderId).single()
        if (orderErr) throw orderErr
        const balance = order.total_amount - (parseFloat(order.amount_paid) || 0)
        if (amt > balance + 0.01) throw new Error(`Cannot exceed the outstanding balance of ${balance.toFixed(2)}`)
        const { error } = await supabase.from('payment_claims').insert({
          id: genId('claim'), supply_order_id: supplyOrderId, distributor_id: distributorId,
          amount: amt, payment_method: paymentMethod || 'cash', notes: notes || '', submitted_by: submittedBy || '',
        })
        if (error) throw error
        return { success: true }
      } catch (err) {
        return { success: false, error: err.message }
      }
    },

    paymentClaimsGetMine: async (distributorId) => {
      try {
        const { data, error } = await supabase
          .from('payment_claims')
          .select('*, distributor_supply_orders(order_number)')
          .eq('distributor_id', distributorId)
          .order('submitted_at', { ascending: false })
        if (error) throw error
        const mapped = (data || []).map(c => ({ ...c, order_number: c.distributor_supply_orders?.order_number, distributor_supply_orders: undefined }))
        return { success: true, data: mapped }
      } catch (err) {
        return { success: false, error: err.message }
      }
    },

    paymentsGet: async ({ invoiceId, supplyOrderId }) => {
      try {
        let query = supabase.from('payment_ledger').select('*')
        if (invoiceId) query = query.eq('invoice_id', invoiceId)
        else if (supplyOrderId) query = query.eq('supply_order_id', supplyOrderId)
        const { data, error } = await query.order('created_at', { ascending: false })
        if (error) throw error
        return { success: true, data: data || [] }
      } catch (err) {
        return { success: false, error: err.message }
      }
    },

    duesGet: async (orgId, includeSupply = true) => {
      try {
        const { data: sales } = await supabase
          .from('sales_invoices')
          .select('*')
          .eq('org_id', orgId)
          .eq('is_voided', false)
          .not('payment_status', 'eq', 'paid')
          .order('due_date', { ascending: true, nullsFirst: false })
          .limit(200)

        const mappedSales = (sales || []).filter(s => {
          const bal = (s.final_amount || 0) - (s.amount_paid || 0)
          return bal > 0.01
        }).map(s => ({
          id: s.id, ref_number: s.invoice_number, party_name: s.customer_name,
          party_phone: s.customer_phone, total_amount: s.final_amount,
          amount_paid: s.amount_paid || 0,
          balance: (s.final_amount || 0) - (s.amount_paid || 0),
          due_date: s.due_date, payment_status: s.payment_status,
          sale_type: s.sale_type, created_at: s.local_created_at,
          source: 'sale',
        }))

        let supply = []
        if (includeSupply) {
          const { data: s } = await supabase
            .from('distributor_supply_orders')
            .select('*, organizations!distributor_supply_orders_distributor_id_fkey!left(name)')
            .eq('from_org_id', orgId)
            .not('payment_status', 'eq', 'paid')
            .order('due_date', { ascending: true, nullsFirst: false })
            .limit(200)
          supply = (s || []).filter(o => {
            const bal = (o.total_amount || 0) - (o.amount_paid || 0)
            return bal > 0.01
          }).map(o => ({
            id: o.id, ref_number: o.order_number,
            party_name: o.organizations?.name, party_phone: null,
            total_amount: o.total_amount, amount_paid: o.amount_paid || 0,
            balance: (o.total_amount || 0) - (o.amount_paid || 0),
            due_date: o.due_date, payment_status: o.payment_status,
            sale_type: 'distributor', created_at: o.created_at,
            source: 'supply',
          }))
        }

        const all = [...mappedSales, ...supply].sort((a, b) => {
          if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
          if (a.due_date) return -1
          if (b.due_date) return 1
          return (b.created_at || '').localeCompare(a.created_at || '')
        })

        return { success: true, data: all }
      } catch (err) {
        return { success: false, error: err.message }
      }
    },

    duesGetOverdue: async (orgId) => {
      try {
        const today = new Date().toISOString().slice(0, 10)

        const { data: sales } = await supabase
          .from('sales_invoices')
          .select('*')
          .eq('org_id', orgId)
          .eq('is_voided', false)
          .eq('payment_status', 'overdue')
          .not('due_date', 'is', null)
          .lte('due_date', today)
          .limit(200)

        const mappedSales = (sales || []).filter(s => {
          const bal = (s.final_amount || 0) - (s.amount_paid || 0)
          return bal > 0.01
        }).map(s => ({
          id: s.id, ref_number: s.invoice_number, party_name: s.customer_name,
          party_phone: s.customer_phone, total_amount: s.final_amount,
          amount_paid: s.amount_paid || 0, due_date: s.due_date, source: 'sale',
          balance: (s.final_amount || 0) - (s.amount_paid || 0),
        }))

        const { data: supply } = await supabase
          .from('distributor_supply_orders')
          .select('*, organizations!distributor_supply_orders_distributor_id_fkey!left(name)')
          .eq('from_org_id', orgId)
          .eq('payment_status', 'overdue')
          .not('due_date', 'is', null)
          .lte('due_date', today)
          .limit(200)

        const mappedSupply = (supply || []).filter(o => {
          const bal = (o.total_amount || 0) - (o.amount_paid || 0)
          return bal > 0.01
        }).map(o => ({
          id: o.id, ref_number: o.order_number,
          party_name: o.organizations?.name, party_phone: null,
          total_amount: o.total_amount, amount_paid: o.amount_paid || 0,
          due_date: o.due_date, source: 'supply',
          balance: (o.total_amount || 0) - (o.amount_paid || 0),
        }))

        return { success: true, data: [...mappedSales, ...mappedSupply] }
      } catch (err) {
        return { success: false, error: err.message }
      }
    },

    // ─── Distributor Supply ────────────────────────────────────────────────────
    distributorSupplyCreate: async (orderData) => rpc('create_supply_order', { p: orderData }),

    distributorSupplyGet: async (orgId) => {
      try {
        const { data: orders, error } = await supabase
          .from('distributor_supply_orders')
          .select('*, organizations!distributor_supply_orders_distributor_id_fkey!left(distributor_name:name, distributor_phone:phone, distributor_city:city)')
          .eq('from_org_id', orgId)
          .order('created_at', { ascending: false })
          .limit(100)
        if (error) throw error

        for (const order of orders || []) {
          if (order.organizations) {
            order.distributor_name = order.organizations.distributor_name
            order.distributor_phone = order.organizations.distributor_phone
            order.distributor_city = order.organizations.distributor_city
          }
          delete order.organizations

          const { data: items } = await supabase
            .from('distributor_supply_items')
            .select('*, products!left(product_name:name)')
            .eq('order_id', order.id)
          order.items = (items || []).map(i => ({
            ...i, product_name: i.products?.product_name || 'Unknown', products: undefined,
          }))
          order.balance = order.total_amount - (parseFloat(order.amount_paid) || 0)
        }
        return { success: true, data: orders || [] }
      } catch (err) {
        return { success: false, error: err.message }
      }
    },

    // Only the receiving branch can confirm, and only once (see confirm_supply_receipt).
    supplyConfirmReceipt: async (orderId, receivedBy) =>
      rpc('confirm_supply_receipt', { p_order_id: orderId, p_received_by: receivedBy || '' }),

    supplyIncoming: async (distributorId) => {
      try {
        const { data: orders, error } = await supabase
          .from('distributor_supply_orders')
          .select('*, organizations!distributor_supply_orders_from_org_id_fkey!left(from_org_name:name)')
          .eq('distributor_id', distributorId)
          .order('created_at', { ascending: false })
          .limit(50)
        if (error) throw error

        for (const order of orders || []) {
          order.from_org_name = order.organizations?.from_org_name || ''
          delete order.organizations

          const { data: items } = await supabase
            .from('distributor_supply_items')
            .select('*, products!left(product_name:name, category, retail_price, cost_price)')
            .eq('order_id', order.id)
          order.items = (items || []).map(i => ({
            ...i, product_name: i.products?.product_name || 'Unknown',
            category: i.products?.category, retail_price: i.products?.retail_price,
            cost_price: i.products?.cost_price, products: undefined,
          }))
          order.balance = order.total_amount - (parseFloat(order.amount_paid) || 0)
        }
        return { success: true, data: orders || [] }
      } catch (err) {
        return { success: false, error: err.message }
      }
    },

    supplyMarginSummary: async (orgId) => {
      try {
        const { data: rows } = await supabase
          .from('distributor_supply_orders')
          .select('id, order_number, created_at, total_amount, wholesale_price_total, admin_cost_total, receipt_status, organizations!left(distributor_name:name)')
          .eq('from_org_id', orgId)
          .eq('receipt_status', 'received')
          .order('created_at', { ascending: false })
          .limit(100)

        const mapped = (rows || []).map(r => ({
          ...r, distributor_name: r.organizations?.distributor_name, organizations: undefined,
        }))

        const totalWholesale = mapped.reduce((s, r) => s + Number(r.wholesale_price_total || 0), 0)
        const totalCost = mapped.reduce((s, r) => s + Number(r.admin_cost_total || 0), 0)

        return {
          success: true, data: mapped,
          summary: {
            total_wholesale: totalWholesale, total_cost: totalCost,
            total_profit: totalWholesale - totalCost,
            margin_pct: totalWholesale > 0 ? ((totalWholesale - totalCost) / totalWholesale * 100) : 0,
          }
        }
      } catch (err) {
        return { success: false, error: err.message }
      }
    },

    // ─── Reports ───────────────────────────────────────────────────────────────
    reportsPL: async (orgId, fromDate, toDate) => {
      try {
        const { data, error } = await supabase.rpc('profit_loss_report', {
          p_org_id: orgId,
          p_from: fromDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
          p_to: toDate || new Date().toISOString().slice(0, 10),
        })
        if (error) throw error
        return { success: true, data }
      } catch (err) {
        return { success: false, error: err.message }
      }
    },

    distributorPerformance: async () => {
      try {
        const { data, error } = await supabase.rpc('distributor_performance')
        if (error) throw error

        for (const d of data || []) {
          const { data: inv } = await supabase
            .from('inventory')
            .select('quantity_on_hand, products!inner(retail_price)')
            .eq('org_id', d.id)
          d.inv_value = (inv || []).reduce((s, i) => s + (i.quantity_on_hand * (i.products?.retail_price || 0)), 0)
        }
        return { success: true, data: data || [] }
      } catch (err) {
        return { success: false, error: err.message }
      }
    },

    // ─── Quotations ────────────────────────────────────────────────────────────
    quotesCreate: async (data) => rpc('create_quote', { p: data }),

    quotesGet: async (orgId) => {
      try {
        const { data: rows, error } = await supabase
          .from('quotations')
          .select('*')
          .eq('org_id', orgId)
          .order('created_at', { ascending: false })
          .limit(100)
        if (error) throw error

        for (const r of rows || []) {
          const { data: items } = await supabase
            .from('quotation_items')
            .select('*, products!left(product_name:name)')
            .eq('quote_id', r.id)
          r.items = (items || []).map(i => ({
            ...i, product_name: i.products?.product_name || 'Unknown', products: undefined,
          }))
        }
        return { success: true, data: rows || [] }
      } catch (err) {
        return { success: false, error: err.message }
      }
    },

    quotesConvert: async (quoteId) => {
      try {
        const { data: quote } = await supabase.from('quotations').select('*').eq('id', quoteId).single()
        if (!quote) throw new Error('Quotation not found')

        const { data: items } = await supabase
          .from('quotation_items')
          .select('*, products!left(product_name:name)')
          .eq('quote_id', quoteId)

        await supabase.from('quotations').update({ status: 'converted' }).eq('id', quoteId)

        const mappedItems = (items || []).map(i => ({
          ...i, product_name: i.products?.product_name || 'Unknown', products: undefined,
        }))
        return { success: true, quote, items: mappedItems }
      } catch (err) {
        return { success: false, error: err.message }
      }
    },

    // ─── Warranty ──────────────────────────────────────────────────────────────
    warrantyCreate: async (data) => {
      try {
        await supabase.from('warranty_claims').insert({
          serial_number: data.serial_number, customer_name: data.customer_name || '',
          customer_phone: data.customer_phone || '', product_id: data.product_id || '',
          product_name: data.product_name || '', org_id: data.org_id || '',
          invoice_id: data.invoice_id || '', invoice_number: data.invoice_number || '',
          quantity: parseInt(data.quantity) || 1,
          issue_description: data.issue_description, status: data.status || 'Open',
        })
        return { success: true }
      } catch (err) {
        return { success: false, error: err.message }
      }
    },

    warrantyGet: async () => {
      try {
        const { data, error } = await supabase.from('warranty_claims').select('*').order('created_at', { ascending: false })
        if (error) throw error
        return { success: true, data: data || [] }
      } catch (err) {
        return { success: false, error: err.message }
      }
    },

    warrantyUpdateStatus: async (id, status) => {
      try {
        await supabase.from('warranty_claims').update({ status }).eq('id', id)
        return { success: true }
      } catch (err) {
        return { success: false, error: err.message }
      }
    },

    // Resolves a claim by actually handing the customer a new unit: creates a
    // real (zero-cost) invoice + sales_item so it shows up in Sales History and
    // gets its own fresh warranty period, decrements the branch's inventory for
    // the replacement unit, and marks the claim Resolved with a reference back
    // to that invoice. Only possible for claims filed against a real invoice
    // (so we know which branch's inventory to take the unit from).
    warrantyIssueReplacement: async (claimId, { quantity, notes = '', createdBy = '' } = {}) =>
      rpc('issue_warranty_replacement', { p_claim_id: claimId, p_quantity: parseInt(quantity) || null, p_notes: notes, p_created_by: createdBy }),

    // ─── Customers ─────────────────────────────────────────────────────────────
    customersSearch: async (orgId, queryStr) => {
      try {
        const q = `%${queryStr}%`
        const { data, error } = await supabase.rpc('customer_search', {
          p_org_id: orgId, p_query: q,
        })
        if (error) throw error
        return { success: true, data: data || [] }
      } catch (err) {
        return { success: false, error: err.message }
      }
    },

    customersHistory: async (orgId, customerName, customerPhone) => {
      try {
        const { data: invoices, error } = await supabase.rpc('customer_history', {
          p_org_id: orgId, p_name: customerName, p_phone: customerPhone || '',
        })
        if (error) throw error

        for (const inv of invoices || []) {
          const { data: items } = await supabase
            .from('sales_items')
            .select('*, products!left(product_name:name)')
            .eq('invoice_id', inv.id)
          inv.items = (items || []).map(i => ({
            ...i, product_name: i.products?.product_name || 'Unknown', products: undefined,
          }))
        }
        return { success: true, data: invoices || [] }
      } catch (err) {
        return { success: false, error: err.message }
      }
    },

    // ─── Org Settings ──────────────────────────────────────────────────────────
    orgSettingsGet: async (orgId) => {
      try {
        const { data: row } = await supabase.from('org_settings').select('*').eq('org_id', orgId).maybeSingle()
        if (row) return { success: true, data: row }

        const { data: org } = await supabase.from('organizations').select('name, phone, city, address').eq('id', orgId).single()
        return {
          success: true,
          data: {
            org_id: orgId, business_name: org?.name || '', phone1: org?.phone || '',
            phone2: '', address: org?.address || '', city: org?.city || '',
            tagline: '', receipt_footer: 'Thank you for your business!',
            retail_markup_pct: 13, wholesale_markup_pct: 5,
          }
        }
      } catch (err) {
        return { success: false, error: err.message }
      }
    },

    orgSettingsSave: async (data) => {
      try {
        await supabase.from('org_settings').upsert({
          org_id: data.org_id, business_name: data.business_name || '', phone1: data.phone1 || '',
          phone2: data.phone2 || '', address: data.address || '', city: data.city || '',
          tagline: data.tagline || '', receipt_footer: data.receipt_footer || 'Thank you for your business!',
          retail_markup_pct: parseFloat(data.retail_markup_pct) || 0,
          wholesale_markup_pct: parseFloat(data.wholesale_markup_pct) || 0,
          updated_at: new Date().toISOString(),
        })
        return { success: true }
      } catch (err) {
        return { success: false, error: err.message }
      }
    },

    // ─── Returns & Replacements ────────────────────────────────────────────────
    // orgId scopes the lookup to the caller's own branch — without it, any
    // salesman could pull up and process a return against another branch's
    // (or the main company's) invoice, crediting/debiting the WRONG org's
    // inventory. Pass orgId=null only for a deliberate cross-branch lookup
    // (e.g. a future super_admin "any branch" tool) — nothing in the app does
    // that today.
    returnLookupInvoice: async (invoiceNumber, orgId) => {
      try {
        let query = supabase.from('sales_invoices').select('*').eq('invoice_number', invoiceNumber.trim())
        if (orgId) query = query.eq('org_id', orgId)
        const { data: inv } = await query.maybeSingle()
        if (!inv) return { success: false, error: orgId ? 'Invoice not found for this branch. Please check the receipt number.' : 'Invoice not found. Please check the receipt number.' }

        const { data: items } = await supabase
          .from('sales_items')
          .select('*, products!left(product_name:name, category, brand, retail_price)')
          .eq('invoice_id', inv.id)

        const { data: returned } = await supabase
          .from('return_items')
          .select('product_id, quantity')
          .eq('invoice_id', inv.id)

        // Accumulate across every past return for this invoice — a product returned
        // in two separate transactions must have both quantities counted, or a
        // customer could return more units than they ever bought.
        const returnedMap = {}
        for (const r of returned || []) returnedMap[r.product_id] = (returnedMap[r.product_id] || 0) + Number(r.quantity)

        const mappedItems = (items || []).map(it => ({
          ...it, product_name: it.products?.product_name || 'Unknown',
          category: it.products?.category, brand: it.products?.brand,
          retail_price: it.products?.retail_price, products: undefined,
          qty_returned_so_far: returnedMap[it.product_id] || 0,
          qty_returnable: it.quantity - (returnedMap[it.product_id] || 0),
        }))

        return { success: true, invoice: inv, items: mappedItems }
      } catch (err) {
        return { success: false, error: err.message }
      }
    },

    returnCreate: async (data) => rpc('create_return', { p: data }),

    returnsGet: async (orgId) => {
      try {
        const { data: rows, error } = await supabase
          .from('returns')
          .select('*, sales_invoices!left(invoice_number, customer_name, customer_phone)')
          .eq('org_id', orgId)
          .order('created_at', { ascending: false })
          .limit(100)
        if (error) throw error

        for (const row of rows || []) {
          if (row.sales_invoices) {
            row.invoice_number = row.sales_invoices.invoice_number
            row.customer_name = row.sales_invoices.customer_name
            row.customer_phone = row.sales_invoices.customer_phone
          }
          delete row.sales_invoices

          const { data: rItems } = await supabase
            .from('return_items')
            .select('*, products!left(product_name:name)')
            .eq('return_id', row.id)
          row.items = (rItems || []).map(i => ({
            ...i, product_name: i.products?.product_name || 'Unknown', products: undefined,
          }))

          const { data: repItems } = await supabase
            .from('replacement_items')
            .select('*, products!left(product_name:name)')
            .eq('return_id', row.id)
          row.replacement_items = (repItems || []).map(i => ({
            ...i, product_name: i.products?.product_name || 'Unknown', products: undefined,
          }))
        }
        return { success: true, data: rows || [] }
      } catch (err) {
        return { success: false, error: err.message }
      }
    },

    // ─── System usage (Admin "System" panel) ───────────────────────────────────
    systemGetUsage: async () => {
      try {
        const [{ data: dbBytes, error: dbErr }, { data: storageBytes, error: storErr }] = await Promise.all([
          supabase.rpc('get_database_size'),
          supabase.rpc('get_storage_usage'),
        ])
        if (dbErr) throw dbErr
        if (storErr) throw storErr
        return { success: true, data: { dbBytes: Number(dbBytes) || 0, storageBytes: Number(storageBytes) || 0 } }
      } catch (err) {
        return { success: false, error: err.message }
      }
    },

    // ─── Data Archive (free up Supabase space) ─────────────────────────────────
    // Only ever touches sales_invoices that are fully paid (payment_status ===
    // 'paid') and older than the cutoff — anything with an outstanding balance
    // is left alone so Due Payments / reporting never silently lose a debt.
    // Deleting a sales_invoices row cascades to its sales_items and any
    // returns/return_items/replacement_items filed against it (see
    // supabase/schema.sql's FK definitions); payment_ledger rows for it
    // survive with invoice_id set to NULL (ON DELETE SET NULL) so the cash
    // history itself is never lost, just its link to the now-archived invoice.
    archivePreview: async (cutoffDate) => {
      try {
        const { count: invoiceCount, error: e1 } = await supabase.from('sales_invoices')
          .select('id', { count: 'exact', head: true })
          .lt('local_created_at', cutoffDate).eq('payment_status', 'paid')
        if (e1) throw e1
        const { count: intakeCount, error: e2 } = await supabase.from('stock_intake_log')
          .select('id', { count: 'exact', head: true })
          .lt('created_at', cutoffDate)
        if (e2) throw e2
        return { success: true, data: { invoiceCount: invoiceCount || 0, intakeCount: intakeCount || 0 } }
      } catch (err) {
        return { success: false, error: err.message }
      }
    },

    // Pulls every row that a matching archiveDelete() call would remove, so it
    // can be saved to a local file before anything is deleted from Supabase.
    archiveExport: async (cutoffDate) => {
      try {
        const { data: invoices, error: e1 } = await supabase.from('sales_invoices').select('*')
          .lt('local_created_at', cutoffDate).eq('payment_status', 'paid')
        if (e1) throw e1
        const invoiceIds = (invoices || []).map(i => i.id)

        let items = [], payments = [], returns = [], returnItems = [], replacementItems = []
        if (invoiceIds.length) {
          for (const ids of chunk(invoiceIds, 200)) {
            const [{ data: i }, { data: p }, { data: r }] = await Promise.all([
              supabase.from('sales_items').select('*').in('invoice_id', ids),
              supabase.from('payment_ledger').select('*').in('invoice_id', ids),
              supabase.from('returns').select('*').in('invoice_id', ids),
            ])
            items = items.concat(i || [])
            payments = payments.concat(p || [])
            returns = returns.concat(r || [])
          }
          const returnIds = returns.map(r => r.id)
          if (returnIds.length) {
            for (const ids of chunk(invoiceIds, 200)) {
              const { data: ri } = await supabase.from('return_items').select('*').in('invoice_id', ids)
              returnItems = returnItems.concat(ri || [])
            }
            for (const ids of chunk(returnIds, 200)) {
              const { data: rpi } = await supabase.from('replacement_items').select('*').in('return_id', ids)
              replacementItems = replacementItems.concat(rpi || [])
            }
          }
        }

        const { data: intakeLogs, error: e2 } = await supabase.from('stock_intake_log').select('*').lt('created_at', cutoffDate)
        if (e2) throw e2

        return {
          success: true,
          data: {
            exportedAt: new Date().toISOString(),
            cutoffDate,
            sales_invoices: invoices || [],
            sales_items: items,
            payment_ledger: payments,
            returns,
            return_items: returnItems,
            replacement_items: replacementItems,
            stock_intake_log: intakeLogs || [],
          },
        }
      } catch (err) {
        return { success: false, error: err.message }
      }
    },

    // Actually deletes the rows a matching archiveExport() call just backed up.
    // Callers are expected to have exported/downloaded first — this method
    // itself has no memory of whether that happened, so the UI enforces order.
    archiveDelete: async (cutoffDate) => {
      try {
        const { data: invoices, error: e1 } = await supabase.from('sales_invoices').select('id')
          .lt('local_created_at', cutoffDate).eq('payment_status', 'paid')
        if (e1) throw e1
        const invoiceIds = (invoices || []).map(i => i.id)

        let deletedInvoices = 0
        for (const ids of chunk(invoiceIds, 200)) {
          const { error } = await supabase.from('sales_invoices').delete().in('id', ids)
          if (error) throw error
          deletedInvoices += ids.length
        }

        const { data: intakeRows, error: e2 } = await supabase.from('stock_intake_log').select('id').lt('created_at', cutoffDate)
        if (e2) throw e2
        const intakeIds = (intakeRows || []).map(r => r.id)
        let deletedIntake = 0
        for (const ids of chunk(intakeIds, 200)) {
          const { error } = await supabase.from('stock_intake_log').delete().in('id', ids)
          if (error) throw error
          deletedIntake += ids.length
        }

        return { success: true, deletedInvoices, deletedIntake }
      } catch (err) {
        return { success: false, error: err.message }
      }
    },
  }
}
