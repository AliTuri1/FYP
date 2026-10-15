// Run: node src/lib/amountInWords.test.mjs
import assert from 'assert'
import { amountInWords as w } from './amountInWords.js'

assert.equal(w(0), 'Rupees Zero Only')
assert.equal(w(7), 'Rupees Seven Only')
assert.equal(w(19), 'Rupees Nineteen Only')
assert.equal(w(40), 'Rupees Forty Only')
assert.equal(w(305), 'Rupees Three Hundred Five Only')
assert.equal(w(1000), 'Rupees One Thousand Only')
assert.equal(w(32000), 'Rupees Thirty Two Thousand Only')
assert.equal(w(120500), 'Rupees One Lakh Twenty Thousand Five Hundred Only')
assert.equal(w(10000000), 'Rupees One Crore Only')
assert.equal(w(250075099), 'Rupees Twenty Five Crore Seventy Five Thousand Ninety Nine Only')
assert.equal(w(257500099), 'Rupees Twenty Five Crore Seventy Five Lakh Ninety Nine Only')
assert.equal(w(1499.6), 'Rupees One Thousand Five Hundred Only') // rounds like rs()
assert.equal(w('2500.00'), 'Rupees Two Thousand Five Hundred Only') // NUMERIC arrives as string sometimes
console.log('amountInWords: all passed')
