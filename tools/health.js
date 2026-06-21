import { getDb } from "../db.js";

/**
 * Computes a simple 0-10 financial-health score from the data already in the
 * database. This is an example of an aggregate / analytical tool: it reads
 * across several tables and returns a derived insight rather than raw rows.
 *
 * The scoring ladder is intentionally generic. Monetary values are stored as
 * integer minor units (e.g. cents), so thresholds below are expressed the same
 * way. Adjust the thresholds to suit your own domain.
 */
export function register(server) {
  server.tool("get_health_score", {}, async () => {
    const db = getDb();
    const totalDebt = db.prepare("SELECT COALESCE(SUM(current_balance), 0) as v FROM debts WHERE paid_off_at IS NULL").get().v;
    const savings = db.prepare("SELECT COALESCE(SUM(balance), 0) as v FROM accounts WHERE type = 'savings'").get().v;
    const portfolioValue = db.prepare("SELECT COALESCE(SUM(current_value), 0) as v FROM investment_holdings").get().v;

    // Average monthly income / expenses over the trailing 3 months.
    let monthlyIncome = db.prepare(
      `SELECT COALESCE(AVG(monthly_sum), 0) as v FROM (
        SELECT strftime('%Y-%m', date) AS month, SUM(amount) AS monthly_sum
        FROM transactions WHERE amount > 0 AND date >= date('now', '-3 months')
        GROUP BY month LIMIT 3)`
    ).get().v;
    if (!monthlyIncome) monthlyIncome = 1; // avoid divide-by-zero on empty DB
    let monthlyExpenses = db.prepare(
      `SELECT COALESCE(ABS(AVG(monthly_sum)), 0) as v FROM (
        SELECT strftime('%Y-%m', date) AS month, SUM(amount) AS monthly_sum
        FROM transactions WHERE amount < 0 AND date >= date('now', '-3 months')
        GROUP BY month LIMIT 3)`
    ).get().v;
    if (!monthlyExpenses) monthlyExpenses = 1;
    const hasHighInterest = db.prepare("SELECT COUNT(*) as v FROM debts WHERE interest_rate > 20 AND paid_off_at IS NULL").get().v;

    let rawScore, label, nextMilestone, progressToNext;
    if (totalDebt > monthlyIncome * 6) {
      rawScore = 1.5; label = "Critical debt load";
      nextMilestone = "Reduce debt below 6x monthly income"; progressToNext = 0.0;
    } else if (totalDebt > monthlyIncome * 3 && savings < monthlyIncome) {
      rawScore = 3.0; label = "High debt load";
      nextMilestone = "Reduce debt below 3x income and build a buffer";
      const range = monthlyIncome * 6 - monthlyIncome * 3;
      const current = Math.max(monthlyIncome * 6 - totalDebt, 0);
      progressToNext = clamp(current / range, 0, 1);
    } else if (hasHighInterest > 0) {
      const origHi = db.prepare("SELECT COALESCE(SUM(original_balance), 0) as v FROM debts WHERE interest_rate > 20 AND paid_off_at IS NULL").get().v;
      const currHi = db.prepare("SELECT COALESCE(SUM(current_balance), 0) as v FROM debts WHERE interest_rate > 20 AND paid_off_at IS NULL").get().v;
      const payoffProgress = origHi > 0 ? clamp(Math.max(origHi - currHi, 0) / origHi, 0, 1) : 0;
      rawScore = 4.0 + payoffProgress * 0.5; label = "Paying down high-interest debt";
      nextMilestone = "Clear all debt with interest above 20%"; progressToNext = payoffProgress;
    } else if (totalDebt > 0) {
      const origAll = db.prepare("SELECT COALESCE(SUM(original_balance), 0) as v FROM debts WHERE paid_off_at IS NULL").get().v;
      const currAll = db.prepare("SELECT COALESCE(SUM(current_balance), 0) as v FROM debts WHERE paid_off_at IS NULL").get().v;
      const payoffProgress = origAll > 0 ? clamp(Math.max(origAll - currAll, 0) / origAll, 0, 1) : 0;
      rawScore = 4.5 + payoffProgress * 0.5; label = "Paying down remaining debt";
      nextMilestone = "Become fully debt-free"; progressToNext = payoffProgress;
    } else {
      const emergencyTarget = monthlyExpenses * 3;
      if (savings < emergencyTarget) {
        const prog = clamp(savings / emergencyTarget, 0, 1);
        rawScore = 5.0 + prog; label = "Building an emergency fund";
        nextMilestone = "Save 3 months of expenses as a buffer"; progressToNext = prog;
      } else if (portfolioValue < savings) {
        const prog = clamp(portfolioValue / Math.max(savings, 1), 0, 1);
        rawScore = 6.0 + prog; label = "Beginning investor";
        nextMilestone = "Grow a portfolio beyond your cash savings"; progressToNext = prog;
      } else {
        rawScore = 8.0; label = "Investing for the long term";
        nextMilestone = "Maintain and grow net worth"; progressToNext = 1.0;
      }
    }
    const score = Math.round(rawScore * 10) / 10;
    progressToNext = Math.round(progressToNext * 1000) / 1000;
    return { content: [{ type: "text", text: JSON.stringify({ score, label, nextMilestone, progressToNext }) }] };
  });

  server.tool("check_payment_reminders", {}, async () => {
    const db = getDb();
    const rows = db.prepare("SELECT name, monthly_payment FROM debts WHERE paid_off_at IS NULL").all();
    const today = new Date();
    const day = today.getDate();
    const reminders = [];
    for (const { name, monthly_payment } of rows) {
      const daysLeft = Math.min(Math.max(28 - day, 0), 28);
      if (daysLeft <= 5) {
        reminders.push({ debtName: name, amount: monthly_payment, daysUntilDue: daysLeft });
      }
    }
    return { content: [{ type: "text", text: JSON.stringify(reminders) }] };
  });
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
