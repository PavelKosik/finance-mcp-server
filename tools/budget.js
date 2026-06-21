import { z } from "zod";
import { getDb } from "../db.js";

export function register(server) {
  server.tool("get_budget_rules", {}, async () => {
    const rows = getDb().prepare(
      `SELECT br.id, br.category_id, c.name as category_name, br.monthly_limit,
       br.alert_threshold, br.created_at, br.updated_at
       FROM budget_rules br
       LEFT JOIN categories c ON br.category_id = c.id
       ORDER BY c.name`
    ).all();
    return { content: [{ type: "text", text: JSON.stringify(rows) }] };
  });

  server.tool(
    "set_budget_rule",
    {
      categoryId: z.number(),
      monthlyLimit: z.number(),
      alertThreshold: z.number().optional(),
    },
    async ({ categoryId, monthlyLimit, alertThreshold }) => {
      const result = getDb().prepare(
        `INSERT OR REPLACE INTO budget_rules (category_id, monthly_limit, alert_threshold)
         VALUES (?, ?, ?)`
      ).run(categoryId, monthlyLimit, alertThreshold ?? 0.8);
      return { content: [{ type: "text", text: JSON.stringify({ id: Number(result.lastInsertRowid) }) }] };
    }
  );

  server.tool(
    "get_budget_progress",
    { year: z.number(), month: z.number() },
    async ({ year, month }) => {
      const monthStr = `${year}-${String(month).padStart(2, "0")}`;
      const rows = getDb().prepare(
        `SELECT br.category_id, c.name as category_name, br.monthly_limit, br.alert_threshold,
         COALESCE(ABS(SUM(CASE WHEN t.amount < 0 THEN t.amount ELSE 0 END)), 0) as spent
         FROM budget_rules br
         LEFT JOIN categories c ON br.category_id = c.id
         LEFT JOIN transactions t ON t.category_id = br.category_id
             AND strftime('%Y-%m', t.date) = ?
         GROUP BY br.id, br.category_id, c.name, br.monthly_limit, br.alert_threshold
         ORDER BY c.name`
      ).all(monthStr);
      const result = rows.map((r) => ({
        ...r,
        percentage: r.monthly_limit > 0 ? r.spent / r.monthly_limit : 0,
      }));
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
  );

  server.tool("delete_budget_rule", { id: z.number() }, async ({ id }) => {
    getDb().prepare("DELETE FROM budget_rules WHERE id = ?").run(id);
    return { content: [{ type: "text", text: JSON.stringify({ success: true }) }] };
  });
}
