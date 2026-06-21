import { z } from "zod";
import { getDb } from "../db.js";

export function register(server) {
  server.tool("get_holdings", {}, async () => {
    const rows = getDb().prepare(
      `SELECT id, name, type, units, avg_purchase_price, current_value,
       last_updated_at, created_at, updated_at
       FROM investment_holdings ORDER BY name`
    ).all();
    return { content: [{ type: "text", text: JSON.stringify(rows) }] };
  });

  server.tool(
    "create_holding",
    {
      name: z.string(),
      type: z.enum(["etf", "stock", "crypto", "bond", "other"]),
      units: z.number().optional(),
      avgPurchasePrice: z.number().optional(),
      currentValue: z.number().optional(),
    },
    async ({ name, type, units, avgPurchasePrice, currentValue }) => {
      const result = getDb().prepare(
        `INSERT INTO investment_holdings (name, type, units, avg_purchase_price, current_value)
         VALUES (?, ?, ?, ?, ?)`
      ).run(name, type, units ?? 0, avgPurchasePrice ?? 0, currentValue ?? 0);
      return { content: [{ type: "text", text: JSON.stringify({ id: Number(result.lastInsertRowid) }) }] };
    }
  );

  server.tool(
    "update_holding_value",
    { id: z.number(), currentValue: z.number(), units: z.number().optional() },
    async ({ id, currentValue, units }) => {
      if (units != null) {
        getDb().prepare(
          `UPDATE investment_holdings SET current_value = ?, units = ?,
           last_updated_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`
        ).run(currentValue, units, id);
      } else {
        getDb().prepare(
          `UPDATE investment_holdings SET current_value = ?,
           last_updated_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`
        ).run(currentValue, id);
      }
      return { content: [{ type: "text", text: JSON.stringify({ success: true }) }] };
    }
  );

  server.tool("delete_holding", { id: z.number() }, async ({ id }) => {
    getDb().prepare("DELETE FROM investment_holdings WHERE id = ?").run(id);
    return { content: [{ type: "text", text: JSON.stringify({ success: true }) }] };
  });

  server.tool(
    "add_investment_transaction",
    {
      holdingId: z.number(),
      date: z.string(),
      type: z.enum(["buy", "sell", "dividend", "fee"]),
      units: z.number(),
      pricePerUnit: z.number(),
      totalAmount: z.number(),
    },
    async ({ holdingId, date, type, units, pricePerUnit, totalAmount }) => {
      const result = getDb().prepare(
        `INSERT INTO investment_transactions (holding_id, date, type, units, price_per_unit, total_amount)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(holdingId, date, type, units, pricePerUnit, totalAmount);
      return { content: [{ type: "text", text: JSON.stringify({ id: Number(result.lastInsertRowid) }) }] };
    }
  );

  server.tool("get_holding_transactions", { holdingId: z.number() }, async ({ holdingId }) => {
    const rows = getDb().prepare(
      `SELECT id, holding_id, date, type, units, price_per_unit, total_amount,
       created_at, updated_at
       FROM investment_transactions WHERE holding_id = ? ORDER BY date DESC`
    ).all(holdingId);
    return { content: [{ type: "text", text: JSON.stringify(rows) }] };
  });

  server.tool("get_portfolio_snapshots", {}, async () => {
    const rows = getDb().prepare(
      "SELECT id, date, total_value, created_at FROM portfolio_snapshots ORDER BY date"
    ).all();
    return { content: [{ type: "text", text: JSON.stringify(rows) }] };
  });

  server.tool("record_portfolio_snapshot", {}, async () => {
    const db = getDb();
    const row = db.prepare("SELECT COALESCE(SUM(current_value), 0) as total FROM investment_holdings").get();
    const today = new Date().toISOString().split("T")[0];
    db.prepare("INSERT OR REPLACE INTO portfolio_snapshots (date, total_value) VALUES (?, ?)").run(today, row.total);
    return { content: [{ type: "text", text: JSON.stringify({ date: today, totalValue: row.total }) }] };
  });
}
