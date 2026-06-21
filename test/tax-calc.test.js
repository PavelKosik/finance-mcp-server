import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateTaxEstimate } from "../lib/tax-calc.js";

test("zero income produces zero burden", () => {
  const r = calculateTaxEstimate(0);
  assert.equal(r.taxBase, 0);
  assert.equal(r.totalBurden, 0);
  assert.equal(r.effectiveRate, 0);
});

test("applies flat-rate expense deduction", () => {
  const r = calculateTaxEstimate(1_000_000, { flat_expense_rate: 0.6 });
  assert.equal(r.flatExpenses, 600_000);
  assert.equal(r.taxBase, 400_000);
});

test("respects the flat-expense cap", () => {
  const r = calculateTaxEstimate(10_000_000, {
    flat_expense_rate: 0.6,
    flat_expense_cap: 1_000_000,
  });
  assert.equal(r.flatExpenses, 1_000_000);
  assert.equal(r.taxBase, 9_000_000);
});

test("uses the high bracket above the threshold", () => {
  const r = calculateTaxEstimate(20_000_000, {
    flat_expense_rate: 0,
    tax_threshold_high: 4_000_000,
    tax_rate_low: 0.15,
    tax_rate_high: 0.23,
    tax_credit_basic: 0,
  });
  assert.equal(r.taxBase, 20_000_000);
  assert.equal(r.taxLow, Math.round(4_000_000 * 0.15));
  assert.equal(r.taxHigh, Math.round(16_000_000 * 0.23));
});

test("subtracts the basic tax credit", () => {
  const r = calculateTaxEstimate(1_000_000, {
    flat_expense_rate: 0,
    tax_rate_low: 0.15,
    tax_credit_basic: 100_000,
  });
  assert.equal(r.incomeTaxGross, 150_000);
  assert.equal(r.incomeTaxNet, 50_000);
});
