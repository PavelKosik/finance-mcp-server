import { z } from "zod";
import { getDb } from "../db.js";
import { calculateTaxEstimate } from "../lib/tax-calc.js";

export function register(server) {
  server.tool("get_tax_estimate", { year: z.number() }, async ({ year }) => {
    const db = getDb();
    const configRows = db.prepare("SELECT key, value FROM tax_config WHERE year = ?").all(year);
    const config = {};
    for (const { key, value } of configRows) {
      const num = parseFloat(value);
      if (!isNaN(num)) config[key] = num;
    }
    const incomeRow = db.prepare(
      "SELECT COALESCE(SUM(amount), 0) as total FROM tax_records WHERE year = ? AND type = 'income'"
    ).get(year);
    const estimate = calculateTaxEstimate(incomeRow.total, config);
    return { content: [{ type: "text", text: JSON.stringify({ year, ...estimate }) }] };
  });

  server.tool("get_tax_config", { year: z.number() }, async ({ year }) => {
    const rows = getDb().prepare("SELECT key, value FROM tax_config WHERE year = ?").all(year);
    const config = {};
    for (const { key, value } of rows) {
      const num = parseFloat(value);
      config[key] = isNaN(num) ? value : num;
    }
    return { content: [{ type: "text", text: JSON.stringify(config) }] };
  });

  server.tool(
    "update_tax_config",
    { year: z.number(), key: z.string(), value: z.string() },
    async ({ year, key, value }) => {
      getDb().prepare(
        `INSERT INTO tax_config (year, key, value) VALUES (?, ?, ?)
         ON CONFLICT(year, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
      ).run(year, key, value);
      return { content: [{ type: "text", text: JSON.stringify({ success: true }) }] };
    }
  );

  server.tool(
    "add_tax_record",
    {
      year: z.number(),
      type: z.enum(["income", "expense", "deduction"]),
      amount: z.number(),
      description: z.string().optional(),
      transactionId: z.number().optional(),
      deductibleCategory: z.string().optional(),
      source: z.string().optional(),
    },
    async ({ year, type, amount, description, transactionId, deductibleCategory, source }) => {
      const result = getDb().prepare(
        `INSERT INTO tax_records (year, type, transaction_id, amount, description,
         deductible_category, source) VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(year, type, transactionId ?? null, amount, description ?? null,
        deductibleCategory ?? null, source ?? null);
      return { content: [{ type: "text", text: JSON.stringify({ id: Number(result.lastInsertRowid) }) }] };
    }
  );

  server.tool("export_tax_csv", { year: z.number() }, async ({ year }) => {
    const db = getDb();
    const fromDate = `${year}-01-01`;
    const toDate = `${year}-12-31`;
    const rows = db.prepare(
      `SELECT t.date, t.amount, t.currency, t.counterparty_name, t.description,
       c.name as category_name, t.is_business
       FROM transactions t
       LEFT JOIN categories c ON t.category_id = c.id
       WHERE t.is_business = 1 AND t.date >= ? AND t.date <= ?
       ORDER BY t.date`
    ).all(fromDate, toDate);
    let csv = "date,amount,currency,counterparty,description,category,is_business\n";
    for (const r of rows) {
      const amount = (r.amount / 100).toFixed(2);
      const counterparty = (r.counterparty_name || "").replace(/"/g, '""');
      const description = (r.description || "").replace(/"/g, '""');
      const category = (r.category_name || "").replace(/"/g, '""');
      csv += `${r.date},${amount},${r.currency || ""},"${counterparty}","${description}","${category}",${r.is_business}\n`;
    }
    return { content: [{ type: "text", text: csv }] };
  });
}
