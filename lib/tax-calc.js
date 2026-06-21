/**
 * A small, self-contained tax-estimation helper.
 *
 * This is a GENERIC, illustrative model — not tax advice for any jurisdiction.
 * It demonstrates how business logic can live in a pure, easily unit-tested
 * function that is decoupled from the MCP layer and the database.
 *
 * All monetary values use integer minor units (e.g. cents). Rates are
 * fractions (0.15 = 15%). Every parameter is overridable via the `config`
 * object so the same function can model different years or rule sets.
 */
export function calculateTaxEstimate(grossIncome, config = {}) {
  const taxRateLow = config.tax_rate_low ?? 0.15;
  const taxRateHigh = config.tax_rate_high ?? 0.23;
  const taxThresholdHigh = Math.round(config.tax_threshold_high ?? 4_000_000);
  const socialRate = config.social_insurance_rate ?? 0.065;
  const healthRate = config.health_insurance_rate ?? 0.045;
  const taxCredit = Math.round(config.tax_credit_basic ?? 300_000);
  const flatExpenseRate = config.flat_expense_rate ?? 0.6;
  const flatExpenseCap = Math.round(config.flat_expense_cap ?? 120_000_000);

  // Flat-rate expense deduction (capped).
  const flatExpensesUncapped = Math.round(grossIncome * flatExpenseRate);
  const flatExpenses = Math.min(flatExpensesUncapped, flatExpenseCap);
  const taxBase = Math.max(grossIncome - flatExpenses, 0);

  // Two-bracket progressive income tax.
  let taxLow, taxHigh;
  if (taxBase <= taxThresholdHigh) {
    taxLow = Math.round(taxBase * taxRateLow);
    taxHigh = 0;
  } else {
    taxLow = Math.round(taxThresholdHigh * taxRateLow);
    taxHigh = Math.round((taxBase - taxThresholdHigh) * taxRateHigh);
  }

  const incomeTaxGross = taxLow + taxHigh;
  const incomeTaxNet = Math.max(incomeTaxGross - taxCredit, 0);
  const insuranceBase = Math.round(taxBase / 2);
  const socialInsurance = Math.round(insuranceBase * socialRate);
  const healthInsurance = Math.round(insuranceBase * healthRate);
  const totalBurden = incomeTaxNet + socialInsurance + healthInsurance;
  const effectiveRate = grossIncome > 0 ? totalBurden / grossIncome : 0;

  return {
    grossIncome,
    flatExpenses,
    taxBase,
    taxLow,
    taxHigh,
    incomeTaxGross,
    taxCredit,
    incomeTaxNet,
    socialInsurance,
    healthInsurance,
    totalBurden,
    effectiveRate,
  };
}
