import { z } from "zod";
import { getDb } from "../db.js";

export function register(server) {
  server.tool("get_accounts", {}, async () => {
    const rows = getDb().prepare(
      `SELECT id, name, type, bank, external_id, balance, available_balance,
       credit_limit, billing_cycle_day, notification_days_before, last_synced_at,
       created_at, updated_at FROM accounts ORDER BY name`
    ).all();
    return { content: [{ type: "text", text: JSON.stringify(rows) }] };
  });

  server.tool("get_account", { id: z.number() }, async ({ id }) => {
    const row = getDb().prepare(
      `SELECT id, name, type, bank, external_id, balance, available_balance,
       credit_limit, billing_cycle_day, notification_days_before, last_synced_at,
       created_at, updated_at FROM accounts WHERE id = ?`
    ).get(id);
    return { content: [{ type: "text", text: JSON.stringify(row || null) }] };
  });

  server.tool(
    "create_account",
    {
      name: z.string(),
      type: z.enum(["checking", "savings", "overdraft", "credit_card"]),
      bank: z.string().optional(),
      balance: z.number().optional(),
      creditLimit: z.number().optional(),
    },
    async ({ name, type, bank, balance, creditLimit }) => {
      const result = getDb().prepare(
        `INSERT INTO accounts (name, type, bank, balance, credit_limit)
         VALUES (?, ?, ?, ?, ?)`
      ).run(name, type, bank ?? null, balance ?? 0, creditLimit ?? null);
      return { content: [{ type: "text", text: JSON.stringify({ id: Number(result.lastInsertRowid) }) }] };
    }
  );

  server.tool("delete_account", { id: z.number() }, async ({ id }) => {
    getDb().prepare("DELETE FROM accounts WHERE id = ?").run(id);
    return { content: [{ type: "text", text: JSON.stringify({ success: true }) }] };
  });
}
