import { z } from "zod";
import { getDb } from "../db.js";

export function register(server) {
  server.tool("get_categories", {}, async () => {
    const rows = getDb().prepare(
      `SELECT id, name, icon, color, type, is_tax_deductible, created_at, updated_at
       FROM categories ORDER BY name`
    ).all();
    const result = rows.map((r) => ({ ...r, is_tax_deductible: r.is_tax_deductible !== 0 }));
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  });

  server.tool(
    "create_category",
    {
      name: z.string(),
      icon: z.string().optional(),
      color: z.string().optional(),
      type: z.enum(["expense", "income", "transfer"]),
      isTaxDeductible: z.boolean().optional(),
    },
    async ({ name, icon, color, type, isTaxDeductible }) => {
      const result = getDb().prepare(
        `INSERT INTO categories (name, icon, color, type, is_tax_deductible)
         VALUES (?, ?, ?, ?, ?)`
      ).run(name, icon ?? null, color ?? null, type, isTaxDeductible ? 1 : 0);
      return { content: [{ type: "text", text: JSON.stringify({ id: Number(result.lastInsertRowid) }) }] };
    }
  );

  server.tool(
    "update_category",
    {
      id: z.number(),
      name: z.string().optional(),
      icon: z.string().optional(),
      color: z.string().optional(),
      type: z.enum(["expense", "income", "transfer"]).optional(),
      isTaxDeductible: z.boolean().optional(),
    },
    async ({ id, name, icon, color, type, isTaxDeductible }) => {
      const current = getDb().prepare("SELECT * FROM categories WHERE id = ?").get(id);
      if (!current) throw new Error(`Category ${id} not found`);
      getDb().prepare(
        `UPDATE categories SET name = ?, icon = ?, color = ?, type = ?,
         is_tax_deductible = ?, updated_at = datetime('now') WHERE id = ?`
      ).run(
        name ?? current.name,
        icon ?? current.icon,
        color ?? current.color,
        type ?? current.type,
        (isTaxDeductible ?? (current.is_tax_deductible !== 0)) ? 1 : 0,
        id
      );
      return { content: [{ type: "text", text: JSON.stringify({ success: true }) }] };
    }
  );

  server.tool("delete_category", { id: z.number() }, async ({ id }) => {
    getDb().prepare("DELETE FROM categories WHERE id = ?").run(id);
    return { content: [{ type: "text", text: JSON.stringify({ success: true }) }] };
  });

  server.tool("get_categorization_rules", {}, async () => {
    const rows = getDb().prepare(
      `SELECT id, pattern, category_id, is_business, created_at, updated_at
       FROM categorization_rules ORDER BY id`
    ).all();
    const result = rows.map((r) => ({ ...r, is_business: r.is_business !== 0 }));
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  });

  server.tool(
    "create_categorization_rule",
    {
      pattern: z.string(),
      categoryId: z.number().nullable(),
      isBusiness: z.boolean().optional(),
    },
    async ({ pattern, categoryId, isBusiness }) => {
      const result = getDb().prepare(
        `INSERT INTO categorization_rules (pattern, category_id, is_business)
         VALUES (?, ?, ?)`
      ).run(pattern, categoryId, isBusiness ? 1 : 0);
      return { content: [{ type: "text", text: JSON.stringify({ id: Number(result.lastInsertRowid) }) }] };
    }
  );

  server.tool("delete_categorization_rule", { id: z.number() }, async ({ id }) => {
    getDb().prepare("DELETE FROM categorization_rules WHERE id = ?").run(id);
    return { content: [{ type: "text", text: JSON.stringify({ success: true }) }] };
  });
}
