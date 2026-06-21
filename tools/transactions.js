import { z } from "zod";
import { getDb } from "../db.js";
import { parseCsv } from "../lib/csv-parser.js";

export function register(server) {
  server.tool(
    "get_transactions",
    {
      accountId: z.number().optional(),
      categoryId: z.number().optional(),
      fromDate: z.string().optional(),
      toDate: z.string().optional(),
      search: z.string().optional(),
      isBusiness: z.boolean().optional(),
      limit: z.number().optional(),
      offset: z.number().optional(),
    },
    async (params) => {
      let sql = `SELECT t.id, t.external_id, t.account_id, t.debt_id, t.date, t.amount,
        t.currency, t.original_amount, t.counterparty_name, t.counterparty_account,
        t.description, t.category_id, c.name as category_name, t.is_business, t.source,
        t.created_at, t.updated_at
        FROM transactions t
        LEFT JOIN categories c ON t.category_id = c.id
        WHERE 1=1`;
      const bindings = [];
      if (params.accountId != null) { sql += " AND t.account_id = ?"; bindings.push(params.accountId); }
      if (params.categoryId != null) { sql += " AND t.category_id = ?"; bindings.push(params.categoryId); }
      if (params.fromDate) { sql += " AND t.date >= ?"; bindings.push(params.fromDate); }
      if (params.toDate) { sql += " AND t.date <= ?"; bindings.push(params.toDate); }
      if (params.search) { sql += " AND (t.counterparty_name LIKE ? OR t.description LIKE ?)"; const p = `%${params.search}%`; bindings.push(p, p); }
      if (params.isBusiness != null) { sql += " AND t.is_business = ?"; bindings.push(params.isBusiness ? 1 : 0); }
      sql += " ORDER BY t.date DESC, t.id DESC";
      if (params.limit != null) { sql += " LIMIT ?"; bindings.push(params.limit); }
      if (params.offset != null) { sql += " OFFSET ?"; bindings.push(params.offset); }
      const rows = getDb().prepare(sql).all(...bindings);
      const result = rows.map((r) => ({ ...r, is_business: r.is_business !== 0 }));
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
  );

  server.tool(
    "create_transaction",
    {
      accountId: z.number(),
      date: z.string(),
      amount: z.number(),
      currency: z.string().optional(),
      description: z.string().optional(),
      categoryId: z.number().optional(),
      isBusiness: z.boolean().optional(),
    },
    async ({ accountId, date, amount, currency, description, categoryId, isBusiness }) => {
      const result = getDb().prepare(
        `INSERT INTO transactions (account_id, date, amount, currency, description,
         category_id, is_business, source) VALUES (?, ?, ?, ?, ?, ?, ?, 'manual')`
      ).run(accountId, date, amount, currency ?? "USD", description ?? null, categoryId ?? null, isBusiness ? 1 : 0);
      return { content: [{ type: "text", text: JSON.stringify({ id: Number(result.lastInsertRowid) }) }] };
    }
  );

  server.tool(
    "update_transaction_category",
    {
      id: z.number(),
      categoryId: z.number(),
      isBusiness: z.boolean().optional(),
    },
    async ({ id, categoryId, isBusiness }) => {
      if (isBusiness != null) {
        getDb().prepare(
          `UPDATE transactions SET category_id = ?, is_business = ?,
           updated_at = datetime('now') WHERE id = ?`
        ).run(categoryId, isBusiness ? 1 : 0, id);
      } else {
        getDb().prepare(
          `UPDATE transactions SET category_id = ?,
           updated_at = datetime('now') WHERE id = ?`
        ).run(categoryId, id);
      }
      return { content: [{ type: "text", text: JSON.stringify({ success: true }) }] };
    }
  );

  server.tool("delete_transaction", { id: z.number() }, async ({ id }) => {
    getDb().prepare("DELETE FROM transactions WHERE id = ?").run(id);
    return { content: [{ type: "text", text: JSON.stringify({ success: true }) }] };
  });

  server.tool(
    "get_monthly_spending",
    { year: z.number(), month: z.number() },
    async ({ year, month }) => {
      const monthStr = `${year}-${String(month).padStart(2, "0")}`;
      const rows = getDb().prepare(
        `SELECT c.name as category_name, c.id as category_id, SUM(t.amount) as total
         FROM transactions t
         LEFT JOIN categories c ON t.category_id = c.id
         WHERE t.amount < 0 AND strftime('%Y-%m', t.date) = ?
         GROUP BY t.category_id ORDER BY total ASC`
      ).all(monthStr);
      return { content: [{ type: "text", text: JSON.stringify(rows) }] };
    }
  );

  server.tool(
    "import_csv",
    { filePath: z.string(), accountId: z.number() },
    async ({ filePath, accountId }) => {
      const db = getDb();
      const parsed = parseCsv(filePath);
      const totalParsed = parsed.length;
      let imported = 0;
      let skippedDuplicates = 0;
      const errors = [];
      const rules = db.prepare("SELECT id, pattern, category_id, is_business FROM categorization_rules").all();
      const insertStmt = db.prepare(
        `INSERT OR IGNORE INTO transactions
         (external_id, account_id, date, amount, currency, original_amount,
          counterparty_name, counterparty_account, description, category_id, is_business, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'csv_import')`
      );
      const insertAll = db.transaction(() => {
        for (const txn of parsed) {
          // Auto-categorize using regex rules against the counterparty name.
          let categoryId = null;
          let isBusiness = false;
          const counterparty = txn.counterpartyName || "";
          for (const rule of rules) {
            try {
              const re = new RegExp(rule.pattern, "i");
              if (re.test(counterparty)) { categoryId = rule.category_id; isBusiness = rule.is_business !== 0; break; }
            } catch { /* skip invalid regex */ }
          }
          const result = insertStmt.run(
            txn.externalId, accountId, txn.date, txn.amount,
            txn.currency, txn.originalAmount, txn.counterpartyName,
            txn.counterpartyAccount, txn.description, categoryId, isBusiness ? 1 : 0
          );
          if (result.changes === 0) {
            skippedDuplicates++;
          } else {
            imported++;
          }
        }
        // Recompute the account balance from the full transaction history.
        const balanceRow = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE account_id = ?").get(accountId);
        db.prepare("UPDATE accounts SET balance = ?, last_synced_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(balanceRow.total, accountId);
      });
      try { insertAll(); } catch (e) { errors.push(e.message); }
      return { content: [{ type: "text", text: JSON.stringify({ totalParsed, imported, skippedDuplicates, errors }) }] };
    }
  );
}
