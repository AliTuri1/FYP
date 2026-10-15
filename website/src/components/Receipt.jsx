// Sales receipt — printed slip, PDF download, and the shared data behind both.
// Used by the POS website (checkout + Sales History reprint) and the admin
// website (Sales History). The two sites keep identical copies of this file:
// change one, copy it to the other.
import { createPortal } from 'react-dom'
import toast from 'react-hot-toast'
import { Icon } from './DesignSystem'
import { amountInWords } from '../lib/amountInWords'

function rs(n) {
  const num = typeof n === 'string' ? parseFloat(n) : (n ?? 0)
  if (isNaN(num)) return 'Rs 0'
  return `Rs ${Math.round(num).toLocaleString('en-PK')}`
}

const WARRANTY_LABELS = { 3: '3 Months', 6: '6 Months', 12: '1 Year', 24: '2 Years', 36: '3 Years' }

// Same as the server's warranty expiry (sale date + N months), so a fresh
// receipt can show it without waiting for a round trip.
function addMonths(dateStr, months) {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCMonth(d.getUTCMonth() + months)
  return d.toISOString().slice(0, 10)
}

// ─── Receipt data (shared by the printed receipt and the PDF) ────────────────

// Shop-local time, e.g. "13 Oct 2026, 03:45 pm" — invoices are stored in UTC.
export function fmtDateTime(iso) {
  const d = new Date(iso)
  if (!iso || isNaN(d)) return ''
  return d.toLocaleString('en-PK', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const capitalize = s => (s ? s[0].toUpperCase() + s.slice(1) : '')
const STATUS_COLOR = { PAID: '#059669', PARTIAL: '#d97706', UNPAID: '#dc2626', VOID: '#dc2626' }

// Everything a receipt prints, worked out once. `items` may come straight from
// checkout (product_id + warranty_months) or from sales history (which also
// carries product_name and the stored warranty_expires_at).
function receiptData(invoice, items, products, orgSettings = {}) {
  const priceMap = {}
  for (const p of products || []) priceMap[p.id] = p
  const final = Number(invoice.final_amount) || 0
  const paid = Number(invoice.amount_paid) || 0
  const balance = Math.max(0, final - paid)
  const saleDate = (invoice.created_at || new Date().toISOString()).slice(0, 10)
  const lines = (items || []).map(it => {
    const prod = priceMap[it.product_id]
    const months = Number(it.warranty_months) || 0
    return {
      name: it.product_name || prod?.name || 'Item',
      brand: prod?.brand || it.brand || '',
      qty: Number(it.quantity) || 0,
      unit: Number(it.unit_price) || 0,
      total: Number(it.line_total) || 0,
      warranty: months > 0 ? (WARRANTY_LABELS[months] || `${months} months`) : '',
      warrantyUntil: it.warranty_expires_at || (months > 0 ? addMonths(saleDate, months) : ''),
    }
  })
  return {
    biz: orgSettings.business_name || 'Sameer Battery House',
    tagline: orgSettings.tagline || '',
    phones: [orgSettings.phone1, orgSettings.phone2].filter(Boolean).join('  |  '),
    address: [orgSettings.address, orgSettings.city].filter(Boolean).join(', '),
    footer: orgSettings.receipt_footer || 'Thank you for your business!',
    status: invoice.is_voided ? 'VOID' : balance <= 0.01 ? 'PAID' : paid > 0 ? 'PARTIAL' : 'UNPAID',
    meta: [
      ['Invoice No.', invoice.invoice_number || ''],
      ['Date & Time', fmtDateTime(invoice.created_at)],
      ['Customer', invoice.customer_name || 'Walk-in'],
      ['Phone', invoice.customer_phone || '—'],
      ['Sale Type', capitalize(invoice.sale_type || 'retail')],
      ['Payment', capitalize(invoice.payment_method || 'cash')],
      ['Cashier', invoice.created_by || '—'],
    ],
    customerAddress: invoice.customer_address || '',
    // A voided sale is cancelled — nothing is owed on it, whatever the numbers say.
    owing: !invoice.is_voided && balance > 0.01,
    dueDate: !invoice.is_voided && balance > 0.01 ? invoice.due_date : null,
    subtotal: Number(invoice.total_amount) || final,
    discount: Number(invoice.discount_amount) || 0,
    final, paid, balance, lines,
    totalQty: lines.reduce((s, l) => s + l.qty, 0),
    words: amountInWords(final),
  }
}

const RECEIPT_NOTE = 'Please keep this receipt for returns, exchanges and warranty claims.'

// ─── PDF Generator ───────────────────────────────────────────────────────────

function downloadPDF(invoice, items, products, orgSettings = {}) {
  const r = receiptData(invoice, items, products, orgSettings)
  Promise.all([import('jspdf'), import('jspdf-autotable')]).then(([{ default: jsPDF }]) => {
    const doc = new jsPDF({ unit: 'mm', format: 'a5' })
    const W = doc.internal.pageSize.getWidth()
    const H = doc.internal.pageSize.getHeight()
    const money = n => `Rs ${Math.round(n).toLocaleString('en-PK')}`
    const fit = (text, width) => doc.splitTextToSize(String(text), width)[0] || ''
    let y = 15

    // Shop header
    doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.setTextColor(13, 148, 136)
    doc.text(r.biz, W / 2, y, { align: 'center' }); y += 5.5
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(90)
    for (const line of [r.tagline, r.phones, r.address].filter(Boolean)) { doc.text(line, W / 2, y, { align: 'center' }); y += 4.5 }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(30)
    doc.text(r.status === 'VOID' ? 'SALES RECEIPT (VOID)' : 'SALES RECEIPT', W / 2, y + 2.5, { align: 'center' }); y += 6
    doc.setDrawColor(210); doc.line(10, y, W - 10, y); y += 5

    // Invoice details, two per row
    doc.setFontSize(8.5)
    const meta = [...r.meta, ['Status', r.status]]
    meta.forEach(([k, v], i) => {
      const x = i % 2 ? W / 2 + 2 : 12
      doc.setFont('helvetica', 'bold'); doc.setTextColor(120); doc.text(`${k}:`, x, y)
      doc.setFont('helvetica', 'normal'); doc.setTextColor(30); doc.text(fit(v, W / 2 - 36), x + 21, y)
      if (i % 2) y += 5
    })
    if (r.customerAddress) {
      doc.setFont('helvetica', 'bold'); doc.setTextColor(120); doc.text('Address:', 12, y)
      doc.setFont('helvetica', 'normal'); doc.setTextColor(30); doc.text(fit(r.customerAddress, W - 45), 33, y); y += 5
    }

    // Items
    doc.autoTable({
      startY: y + 1,
      head: [['#', 'Item', 'Qty', 'Rate', 'Amount']],
      body: r.lines.map((l, i) => [
        i + 1,
        [l.name, l.brand, l.warranty && `Warranty: ${l.warranty} (until ${l.warrantyUntil})`].filter(Boolean).join('\n'),
        l.qty, money(l.unit), money(l.total),
      ]),
      theme: 'grid',
      headStyles: { fillColor: [13, 148, 136], textColor: 255, fontSize: 8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8, textColor: 30 },
      columnStyles: { 0: { cellWidth: 7, halign: 'center' }, 2: { cellWidth: 11, halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
      margin: { left: 10, right: 10 },
      styles: { cellPadding: 1.8 },
    })
    y = doc.lastAutoTable.finalY + 6
    if (y > H - 60) { doc.addPage(); y = 15 }

    // Totals
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(110)
    doc.text(`Items: ${r.lines.length}   |   Total qty: ${r.totalQty}`, 12, y)
    const row = (label, value, { bold = false, size = 9, color = [60, 60, 60], gap = 5.5 } = {}) => {
      doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(...color)
      doc.text(label, W - 72, y); doc.text(value, W - 10, y, { align: 'right' }); y += gap
    }
    row('Subtotal', money(r.subtotal))
    if (r.discount > 0) row('Discount', `- ${money(r.discount)}`, { color: [200, 120, 0] })
    row('TOTAL', money(r.final), { bold: true, size: 11, color: [13, 148, 136], gap: 6.5 })
    row('Amount Paid', money(r.paid), { color: [5, 150, 105] })
    if (r.owing) {
      row('Balance Due', money(r.balance), { bold: true, color: [220, 38, 38] })
      if (r.dueDate) row('Payment Due By', r.dueDate, { bold: true, color: [180, 83, 9] })
    }
    doc.setFont('helvetica', 'italic'); doc.setFontSize(8); doc.setTextColor(60)
    const words = doc.splitTextToSize(r.words, W - 24)
    doc.text(words, 12, y + 1); y += words.length * 4 + 4

    // Signatures on credit sales — the customer is acknowledging a debt
    if (r.owing) {
      y += 8
      doc.setDrawColor(150); doc.line(12, y, 55, y); doc.line(W - 55, y, W - 12, y)
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(110)
      doc.text('Customer Signature', 33.5, y + 4, { align: 'center' })
      doc.text('Authorized Signature', W - 33.5, y + 4, { align: 'center' })
      y += 8
    }

    // Footer
    doc.setDrawColor(220); doc.line(10, y + 2, W - 10, y + 2)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(60)
    doc.text(r.footer, W / 2, y + 8, { align: 'center' })
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(130)
    doc.text(RECEIPT_NOTE, W / 2, y + 12.5, { align: 'center' })

    // Watermark on every page: shop name + payment status, rotated, faint.
    // Text (not an image) so it survives printers/viewers that drop backgrounds.
    const k = doc.internal.scaleFactor
    const diagonal = (text, size, cx, cy, angle = 35) => {
      doc.setFontSize(size)
      const width = doc.getStringUnitWidth(text) * size / k
      const a = angle * Math.PI / 180
      doc.text(text, cx - Math.cos(a) * width / 2, cy + Math.sin(a) * width / 2, { angle })
    }
    const name = r.biz.toUpperCase()
    const nameSize = Math.min(30, 130 * k / doc.getStringUnitWidth(name))
    const [sr, sg, sb] = STATUS_COLOR[r.status].match(/\w\w/g).map(h => parseInt(h, 16))
    for (let p = 1; p <= doc.getNumberOfPages(); p++) {
      doc.setPage(p)
      doc.saveGraphicsState()
      doc.setFont('helvetica', 'bold')
      doc.setGState(new doc.GState({ opacity: 0.07 }))
      doc.setTextColor(13, 148, 136); diagonal(name, nameSize, W / 2, H / 2 - 14)
      doc.setGState(new doc.GState({ opacity: r.status === 'VOID' ? 0.18 : 0.09 }))
      doc.setTextColor(sr, sg, sb); diagonal(r.status, 60, W / 2, H / 2 + 16)
      doc.restoreGraphicsState()
    }

    doc.save(`${invoice.invoice_number || 'invoice'}.pdf`)
  }).catch(err => {
    console.error('[Receipt] PDF failed', err)
    toast.error('Could not create the PDF — use Print instead')
  })
}

// ─── Receipt Modal ────────────────────────────────────────────────────────────

// Printing shows ONLY the receipt: the modal is portalled straight onto
// <body>, so `body > *:not(.receipt-portal)` hides the whole app (the old rule
// targeted an element nested inside #root, so it hid the receipt too and
// printed a blank page). Height/scroll limits are lifted so long bills don't
// get cut off, and colours are forced so the watermark and totals print.
const RECEIPT_PRINT_CSS = `
  @media print {
    @page { margin: 6mm; }
    html, body { background: #fff !important; height: auto !important; overflow: visible !important; }
    body > *:not(.receipt-portal) { display: none !important; }
    .receipt-portal { position: static !important; display: block !important; background: none !important; backdrop-filter: none !important; }
    .receipt-portal, .receipt-portal * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    #receipt-print-root { display: block !important; padding: 0 !important; }
    .receipt-shell { display: block !important; width: 100% !important; max-width: 148mm !important; max-height: none !important; margin: 0 auto !important; overflow: visible !important; box-shadow: none !important; border: none !important; border-radius: 0 !important; }
    .receipt-body { overflow: visible !important; }
    .receipt-paper { padding: 0 !important; }
    .receipt-no-print { display: none !important; }
  }
`

function ReceiptWatermark({ biz, status }) {
  return (
    <div aria-hidden="true" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
      <div style={{ transform: 'rotate(-30deg)', textAlign: 'center', whiteSpace: 'nowrap', lineHeight: 1.05, fontFamily: 'Arial, Helvetica, sans-serif' }}>
        <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: '.06em', color: '#0d9488', opacity: 0.08 }}>{biz.toUpperCase()}</div>
        <div style={{ fontSize: 68, fontWeight: 900, letterSpacing: '.12em', color: STATUS_COLOR[status], opacity: status === 'VOID' ? 0.2 : 0.1, marginTop: 4 }}>{status}</div>
      </div>
    </div>
  )
}

export function ReceiptModal({ invoice, items, products, onClose, orgSettings = {} }) {
  if (!invoice) return null
  const r = receiptData(invoice, items, products, orgSettings)
  const statusColor = STATUS_COLOR[r.status]
  const label = { color: '#6b7280', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 1 }
  const dashed = { borderTop: '1.5px dashed #9ca3af' }
  const totalRow = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }

  return createPortal(
    <div className="receipt-portal fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}>
      <style>{RECEIPT_PRINT_CSS}</style>

      <div id="receipt-print-root" className="w-full flex items-center justify-center px-4">
        <div className="receipt-shell w-full bg-white text-gray-900 rounded-2xl shadow-2xl overflow-hidden"
          style={{ maxWidth: 440, maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>

          {/* ── Header bar (screen only) ── */}
          <div className="receipt-no-print flex items-center justify-between px-5 py-3.5 border-b border-gray-200 bg-gray-50 flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: '#0d9488' }}>
                <Icon name="zap" size={13} sw={2.2} style={{ color: '#fff' }} />
              </div>
              <div>
                <div className="text-sm font-bold text-gray-900">Invoice Receipt</div>
                <div className="text-xs font-mono text-teal-600 leading-none mt-0.5">{invoice.invoice_number}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: statusColor + '18', color: statusColor, border: `1px solid ${statusColor}44` }}>{r.status}</span>
              <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-200 transition">
                <Icon name="x" size={13} sw={2.4} />
              </button>
            </div>
          </div>

          {/* ── Receipt paper ── */}
          <div className="receipt-body overflow-y-auto flex-1" style={{ background: '#fff' }}>
            <div className="receipt-paper" style={{ position: 'relative', padding: '20px 24px', fontFamily: "'Courier New', Courier, monospace", color: '#111' }}>
              <ReceiptWatermark biz={r.biz} status={r.status} />

              <div style={{ position: 'relative', zIndex: 1 }}>
                {/* Shop header */}
                <div style={{ textAlign: 'center', paddingBottom: 12, marginBottom: 12, borderBottom: '2px dashed #9ca3af' }}>
                  <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: '.03em', color: '#0d9488' }}>{r.biz}</div>
                  {r.tagline && <div style={{ fontSize: 11, color: '#4b5563', marginTop: 2 }}>{r.tagline}</div>}
                  {r.phones && <div style={{ fontSize: 11, color: '#4b5563', marginTop: 2 }}>Tel: {r.phones}</div>}
                  {r.address && <div style={{ fontSize: 10.5, color: '#4b5563', marginTop: 2 }}>{r.address}</div>}
                  <div style={{ marginTop: 8, fontSize: 12, fontWeight: 900, letterSpacing: '.2em' }}>
                    SALES RECEIPT{r.status === 'VOID' && <span style={{ color: STATUS_COLOR.VOID }}> (VOID)</span>}
                  </div>
                </div>

                {/* Invoice details */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '7px 12px', marginBottom: 12, fontSize: 11 }}>
                  {r.meta.map(([k, v], i) => (
                    <div key={k} style={{ textAlign: i % 2 ? 'right' : 'left' }}>
                      <div style={label}>{k}</div>
                      <div style={{ fontWeight: 700, wordBreak: 'break-word' }}>{v}</div>
                    </div>
                  ))}
                  <div style={{ textAlign: 'right' }}>
                    <div style={label}>Status</div>
                    <div style={{ fontWeight: 900, color: statusColor }}>{r.status}</div>
                  </div>
                  {r.customerAddress && (
                    <div style={{ gridColumn: '1 / -1' }}>
                      <div style={label}>Address</div>
                      <div style={{ fontWeight: 700 }}>{r.customerAddress}</div>
                    </div>
                  )}
                </div>

                {/* Items */}
                <div style={{ ...dashed, paddingTop: 10, marginBottom: 10 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '18px 1fr auto auto', gap: '2px 8px', fontSize: 9, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.06em', paddingBottom: 6, marginBottom: 8, borderBottom: '1px solid #e5e7eb' }}>
                    <span>#</span><span>Item</span><span style={{ textAlign: 'right' }}>Qty × Rate</span><span style={{ textAlign: 'right' }}>Amount</span>
                  </div>
                  {r.lines.map((l, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '18px 1fr auto auto', gap: '2px 8px', marginBottom: 9, alignItems: 'start', breakInside: 'avoid' }}>
                      <span style={{ fontSize: 11, color: '#6b7280' }}>{i + 1}.</span>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.3 }}>{l.name}</div>
                        {l.brand && <div style={{ fontSize: 9.5, color: '#6b7280' }}>{l.brand}</div>}
                        {l.warranty && (
                          <div style={{ fontSize: 9.5, color: '#0f766e', marginTop: 1 }}>Warranty: {l.warranty} (until {l.warrantyUntil})</div>
                        )}
                      </div>
                      <div style={{ textAlign: 'right', fontSize: 11, color: '#374151', whiteSpace: 'nowrap' }}>{l.qty} × {rs(l.unit)}</div>
                      <div style={{ textAlign: 'right', fontWeight: 800, fontSize: 12, whiteSpace: 'nowrap' }}>{rs(l.total)}</div>
                    </div>
                  ))}
                  <div style={{ fontSize: 10, color: '#6b7280', borderTop: '1px solid #e5e7eb', paddingTop: 6 }}>
                    Items: {r.lines.length} &nbsp;|&nbsp; Total qty: {r.totalQty}
                  </div>
                </div>

                {/* Totals */}
                <div style={{ ...dashed, paddingTop: 10, breakInside: 'avoid' }}>
                  <div style={totalRow}>
                    <span style={{ fontSize: 11, color: '#4b5563' }}>Subtotal</span>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{rs(r.subtotal)}</span>
                  </div>
                  {r.discount > 0 && (
                    <div style={totalRow}>
                      <span style={{ fontSize: 11, color: '#b45309' }}>Discount</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#b45309' }}>-{rs(r.discount)}</span>
                    </div>
                  )}
                  <div style={{ ...totalRow, padding: '8px 0', borderTop: '2px solid #111', borderBottom: '2px solid #111', margin: '6px 0' }}>
                    <span style={{ fontSize: 15, fontWeight: 900, letterSpacing: '.04em' }}>TOTAL</span>
                    <span style={{ fontSize: 18, fontWeight: 900, color: '#0d9488' }}>{rs(r.final)}</span>
                  </div>
                  <div style={totalRow}>
                    <span style={{ fontSize: 12, color: '#047857', fontWeight: 600 }}>Amount Paid ({r.meta[5][1]})</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: '#047857' }}>{rs(r.paid)}</span>
                  </div>
                  {r.owing && (
                    <div style={totalRow}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#dc2626' }}>Balance Due</span>
                      <span style={{ fontSize: 13, fontWeight: 900, color: '#dc2626' }}>{rs(r.balance)}</span>
                    </div>
                  )}
                  <div style={{ marginTop: 6, fontSize: 10.5, fontStyle: 'italic', color: '#374151' }}>{r.words}</div>
                  {r.dueDate && (
                    <div style={{ marginTop: 8, padding: '7px 10px', borderRadius: 6, background: '#fef3c7', border: '1px solid #fcd34d', textAlign: 'center' }}>
                      <div style={{ fontSize: 10, color: '#92400e', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>Payment Due By</div>
                      <div style={{ fontSize: 13, fontWeight: 900, color: '#b45309', marginTop: 1 }}>{r.dueDate}</div>
                    </div>
                  )}
                </div>

                {/* Signatures on credit sales — the customer is acknowledging a debt */}
                {r.owing && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, marginTop: 34, fontSize: 9.5, color: '#4b5563', breakInside: 'avoid' }}>
                    <div style={{ flex: 1, borderTop: '1px solid #6b7280', paddingTop: 4, textAlign: 'center' }}>Customer Signature</div>
                    <div style={{ flex: 1, borderTop: '1px solid #6b7280', paddingTop: 4, textAlign: 'center' }}>Authorized Signature</div>
                  </div>
                )}

                {/* Footer */}
                <div style={{ ...dashed, marginTop: 18, paddingTop: 12, textAlign: 'center', breakInside: 'avoid' }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#1f2937', marginBottom: 4 }}>{r.footer}</div>
                  <div style={{ fontSize: 9.5, color: '#4b5563' }}>{RECEIPT_NOTE}</div>
                  {r.phones && <div style={{ fontSize: 9.5, color: '#4b5563', marginTop: 2 }}>Contact: {r.phones}</div>}
                  <div style={{ marginTop: 10, fontSize: 8.5, color: '#9ca3af' }}>Powered by Sameer Battery House POS</div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Action buttons (screen only) ── */}
          <div className="receipt-no-print flex gap-2 px-5 py-4 border-t border-gray-200 bg-gray-50 flex-shrink-0">
            <button onClick={() => downloadPDF(invoice, items, products, orgSettings)}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white transition"
              style={{ background: '#0d9488' }}>
              <Icon name="download" size={14} sw={2.2} /> Download PDF
            </button>
            <button onClick={() => window.print()}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition"
              style={{ background: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb' }}>
              <Icon name="doc" size={13} sw={2.2} /> Print
            </button>
            <button onClick={onClose}
              className="flex items-center justify-center gap-1 px-4 py-2.5 rounded-xl text-sm font-bold transition"
              style={{ background: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb' }}>
              <Icon name="x" size={13} sw={2.2} />
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
