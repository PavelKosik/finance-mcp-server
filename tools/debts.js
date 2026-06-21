import { z } from "zod";
import { getDb } from "../db.js";

export function register(server) {
  server.tool("get_debts", {}, async () => {
    const rows = getDb().prepare(
      `SELECT id, name, type, original_balance, current_balance, interest_rate,
       monthly_payment, remaining_payments, start_date, paid_off_at, created_at, updated_at
       FROM debts ORDER BY interest_rate DESC`
    ).all();
    return { content: [{ type: "text", text: JSON.stringify(rows) }] };
  });

  server.tool(
    "create_debt",
    {
      name: z.string(),
      type: z.enum(["overdraft", "installment", "credit_card"]),
      originalBalance: z.number(),
      currentBalance: z.number(),
      interestRate: z.number().optional(),
      monthlyPayment: z.number().optional(),
      remainingPayments: z.number().optional(),
      startDate: z.string().optional(),
    },
    async (params) => {
      const result = getDb().prepare(
        `INSERT INTO debts (name, type, original_balance, current_balance, interest_rate,
         monthly_payment, remaining_payments, start_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        params.name, params.type, params.originalBalance, params.currentBalance,
        params.interestRate ?? null, params.monthlyPayment ?? null,
        params.remainingPayments ?? null, params.startDate ?? null
      );
      return { content: [{ type: "text", text: JSON.stringify({ id: Number(result.lastInsertRowid) }) }] };
    }
  );

  server.tool("delete_debt", { id: z.number() }, async ({ id }) => {
    getDb().prepare("DELETE FROM debts WHERE id = ?").run(id);
    return { content: [{ type: "text", text: JSON.stringify({ success: true }) }] };
  });

  // Amortization projection: simulate month-by-month payoff given an optional
  // extra monthly payment, returning the number of months and total interest.
  server.tool(
    "get_payoff_projection",
    { debtId: z.number(), extraMonthly: z.number().optional() },
    async ({ debtId, extraMonthly }) => {
      const debt = getDb().prepare(
        `SELECT id, name, current_balance, interest_rate, monthly_payment FROM debts WHERE id = ?`
      ).get(debtId);
      if (!debt) throw new Error(`Debt ${debtId} not found`);
      const annualRate = debt.interest_rate;
      if (!annualRate || annualRate <= 0) {
        return { content: [{ type: "text", text: JSON.stringify({ months: 0, totalInterest: 0 }) }] };
      }
      const monthlyRate = annualRate / 12.0 / 100.0;
      const basePayment = debt.monthly_payment || 0;
      const totalMonthly = basePayment + (extraMonthly || 0);
      if (totalMonthly <= 0) {
        return { content: [{ type: "text", text: JSON.stringify({ months: null, totalInterest: null, error: "No monthly payment" }) }] };
      }
      let balance = debt.current_balance;
      let months = 0;
      let totalInterest = 0;
      const maxMonths = 1200;
      while (balance > 0 && months < maxMonths) {
        const interest = Math.round(balance * monthlyRate);
        totalInterest += interest;
        balance += interest;
        balance -= totalMonthly;
        months++;
      }
      if (balance > 0) {
        return { content: [{ type: "text", text: JSON.stringify({ months: null, totalInterest: null, error: "Payment too low to pay off debt" }) }] };
      }
      return { content: [{ type: "text", text: JSON.stringify({ months, totalInterest }) }] };
    }
  );
}
