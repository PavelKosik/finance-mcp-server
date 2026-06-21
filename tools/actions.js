import { z } from "zod";
import { getDb } from "../db.js";

export function register(server) {
  server.tool(
    "get_actions",
    { goalId: z.number().optional() },
    async ({ goalId }) => {
      const db = getDb();
      const rows = goalId
        ? db.prepare(
            "SELECT id, goal_id, title, description, due_date, completed_at, sort_order, created_at, updated_at FROM actions WHERE goal_id = ? ORDER BY completed_at IS NOT NULL, sort_order, id"
          ).all(goalId)
        : db.prepare(
            "SELECT id, goal_id, title, description, due_date, completed_at, sort_order, created_at, updated_at FROM actions ORDER BY goal_id, completed_at IS NOT NULL, sort_order, id"
          ).all();
      return { content: [{ type: "text", text: JSON.stringify(rows) }] };
    }
  );

  server.tool(
    "create_action",
    {
      goalId: z.number(),
      title: z.string(),
      description: z.string().optional(),
      dueDate: z.string().optional(),
    },
    async ({ goalId, title, description, dueDate }) => {
      const db = getDb();
      const nextOrder = db.prepare(
        "SELECT COALESCE(MAX(sort_order), -1) + 1 as n FROM actions WHERE goal_id = ?"
      ).get(goalId).n;
      const result = db.prepare(
        "INSERT INTO actions (goal_id, title, description, due_date, sort_order) VALUES (?, ?, ?, ?, ?)"
      ).run(goalId, title, description ?? null, dueDate ?? null, nextOrder);
      return { content: [{ type: "text", text: JSON.stringify({ id: Number(result.lastInsertRowid) }) }] };
    }
  );

  server.tool(
    "update_action",
    {
      id: z.number(),
      title: z.string().optional(),
      description: z.string().nullable().optional(),
      dueDate: z.string().nullable().optional(),
      sortOrder: z.number().optional(),
    },
    async ({ id, ...updates }) => {
      const db = getDb();
      const current = db.prepare("SELECT * FROM actions WHERE id = ?").get(id);
      if (!current) throw new Error(`Action ${id} not found`);
      db.prepare(
        "UPDATE actions SET title = ?, description = ?, due_date = ?, sort_order = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(
        updates.title ?? current.title,
        updates.description !== undefined ? updates.description : current.description,
        updates.dueDate !== undefined ? updates.dueDate : current.due_date,
        updates.sortOrder ?? current.sort_order,
        id
      );
      return { content: [{ type: "text", text: JSON.stringify({ success: true }) }] };
    }
  );

  server.tool("delete_action", { id: z.number() }, async ({ id }) => {
    getDb().prepare("DELETE FROM actions WHERE id = ?").run(id);
    return { content: [{ type: "text", text: JSON.stringify({ success: true }) }] };
  });

  server.tool("toggle_action", { id: z.number() }, async ({ id }) => {
    const db = getDb();
    const action = db.prepare("SELECT completed_at FROM actions WHERE id = ?").get(id);
    if (!action) throw new Error(`Action ${id} not found`);
    if (action.completed_at) {
      db.prepare("UPDATE actions SET completed_at = NULL, updated_at = datetime('now') WHERE id = ?").run(id);
    } else {
      db.prepare("UPDATE actions SET completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(id);
    }
    return { content: [{ type: "text", text: JSON.stringify({ success: true }) }] };
  });
}
