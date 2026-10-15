// "Rupees One Lakh Twenty Thousand Five Hundred Only" — the Pakistani
// (lakh/crore) style printed on bills. Rounds to whole rupees, same as rs().
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function inWords(n) {
  if (n >= 1e7) return inWords(Math.floor(n / 1e7)) + ' Crore' + (n % 1e7 ? ' ' + inWords(n % 1e7) : '')
  if (n >= 1e5) return inWords(Math.floor(n / 1e5)) + ' Lakh' + (n % 1e5 ? ' ' + inWords(n % 1e5) : '')
  if (n >= 1e3) return inWords(Math.floor(n / 1e3)) + ' Thousand' + (n % 1e3 ? ' ' + inWords(n % 1e3) : '')
  if (n >= 100) return ONES[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + inWords(n % 100) : '')
  if (n >= 20) return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '')
  return ONES[n]
}

export function amountInWords(amount) {
  const n = Math.round(Math.abs(Number(amount) || 0))
  return `Rupees ${n ? inWords(n) : 'Zero'} Only`
}
