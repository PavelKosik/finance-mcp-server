import { z } from "zod";
import { getDb } from "../db.js";

/**
 * A goal can optionally track a live "metric" derived from the rest of the
 * finance database (e.g. total debt, net worth). When a goal has a metric set,
 * its progress is computed on the fly rather than stored.
 */
function calculateMetric(db, metricKey) {
  if (metricKey.startsWith("debt_by_id:")) {
    const debtId = parseInt(metricKey.split(":")[1], 10);
    const row = db.prepare("SELECT COALESCE(current_balance, 0) as v FROM debts WHERE id = ?").get(debtId);
    return row ? row.v : 0;
  }
  switch (metricKey) {
    case "savings_balance":
      return db.prepare("SELECT COALESCE(SUM(balance), 0) as v FROM accounts WHERE type = 'savings'").get().v;
    case "total_balance":
      return db.prepare("SELECT COALESCE(SUM(balance), 0) as v FROM accounts").get().v;
    case "total_debt":
      return db.prepare("SELECT COALESCE(SUM(current_balance), 0) as v FROM debts WHERE paid_off_at IS NULL").get().v;
    case "portfolio_value":
      return db.prepare("SELECT COALESCE(SUM(current_value), 0) as v FROM investment_holdings").get().v;
    case "monthly_spending": {
      const now = new Date();
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      return db.prepare(
        "SELECT COALESCE(ABS(SUM(amount)), 0) as v FROM transactions WHERE amount < 0 AND strftime('%Y-%m', date) = ?"
      ).get(month).v;
    }
    case "monthly_income": {
      const now = new Date();
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      return db.prepare(
        "SELECT COALESCE(SUM(amount), 0) as v FROM transactions WHERE amount > 0 AND strftime('%Y-%m', date) = ?"
      ).get(month).v;
    }
    case "net_worth": {
      const bal = db.prepare("SELECT COALESCE(SUM(balance), 0) as v FROM accounts").get().v;
      const port = db.prepare("SELECT COALESCE(SUM(current_value), 0) as v FROM investment_holdings").get().v;
      const debt = db.prepare("SELECT COALESCE(SUM(current_balance), 0) as v FROM debts WHERE paid_off_at IS NULL").get().v;
      return bal + port - debt;
    }
    default:
      return null;
  }
}

function enrichGoal(db, goal) {
  if (goal.metric) {
    goal.computed_value = calculateMetric(db, goal.metric);
  } else {
    goal.computed_value = goal.current_value;
  }
  return goal;
}

export function register(server) {
  server.tool("get_goals", {}, async () => {
    const db = getDb();
    const rows = db.prepare(
      `SELECT id, parent_id, title, description, type, target_date, target_value,
       current_value, metric, status, sort_order, created_at, updated_at
       FROM goals ORDER BY sort_order, id`
    ).all();
    const enriched = rows.map((r) => enrichGoal(db, r));
    return { content: [{ type: "text", text: JSON.stringify(enriched) }] };
  });

  server.tool("get_goal", { id: z.number() }, async ({ id }) => {
    const db = getDb();
    const row = db.prepare(
      `SELECT id, parent_id, title, description, type, target_date, target_value,
       current_value, metric, status, sort_order, created_at, updated_at
       FROM goals WHERE id = ?`
    ).get(id);
    if (!row) return { content: [{ type: "text", text: "null" }] };
    return { content: [{ type: "text", text: JSON.stringify(enrichGoal(db, row)) }] };
  });

  server.tool(
    "create_goal",
    {
      title: z.string(),
      description: z.string().optional(),
      type: z.enum(["milestone", "ongoing", "aspirational"]),
      targetDate: z.string().optional(),
      targetValue: z.number().optional(),
      currentValue: z.number().optional(),
      metric: z.string().optional(),
      parentId: z.number().optional(),
    },
    async (params) => {
      const result = getDb().prepare(
        `INSERT INTO goals (parent_id, title, description, type, target_date,
         target_value, current_value, metric)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        params.parentId ?? null, params.title, params.description ?? null,
        params.type, params.targetDate ?? null, params.targetValue ?? null,
        params.currentValue ?? null, params.metric ?? null
      );
      return { content: [{ type: "text", text: JSON.stringify({ id: Number(result.lastInsertRowid) }) }] };
    }
  );

  server.tool(
    "update_goal",
    {
      id: z.number(),
      title: z.string().optional(),
      description: z.string().optional(),
      type: z.enum(["milestone", "ongoing", "aspirational"]).optional(),
      targetDate: z.string().nullable().optional(),
      targetValue: z.number().nullable().optional(),
      currentValue: z.number().nullable().optional(),
      metric: z.string().nullable().optional(),
      status: z.enum(["active", "completed", "paused", "failed"]).optional(),
      sortOrder: z.number().optional(),
      parentId: z.number().nullable().optional(),
    },
    async ({ id, ...updates }) => {
      const db = getDb();
      const current = db.prepare("SELECT * FROM goals WHERE id = ?").get(id);
      if (!current) throw new Error(`Goal ${id} not found`);

      db.prepare(
        `UPDATE goals SET title = ?, description = ?, type = ?, target_date = ?,
         target_value = ?, current_value = ?, metric = ?, status = ?,
         sort_order = ?, parent_id = ?, updated_at = datetime('now')
         WHERE id = ?`
      ).run(
        updates.title ?? current.title,
        updates.description !== undefined ? updates.description : current.description,
        updates.type ?? current.type,
        updates.targetDate !== undefined ? updates.targetDate : current.target_date,
        updates.targetValue !== undefined ? updates.targetValue : current.target_value,
        updates.currentValue !== undefined ? updates.currentValue : current.current_value,
        updates.metric !== undefined ? updates.metric : current.metric,
        updates.status ?? current.status,
        updates.sortOrder ?? current.sort_order,
        updates.parentId !== undefined ? updates.parentId : current.parent_id,
        id
      );
      return { content: [{ type: "text", text: JSON.stringify({ success: true }) }] };
    }
  );

  server.tool("delete_goal", { id: z.number() }, async ({ id }) => {
    getDb().prepare("DELETE FROM goals WHERE id = ?").run(id);
    return { content: [{ type: "text", text: JSON.stringify({ success: true }) }] };
  });
}
