import { z } from "zod";
import { getDb } from "../db.js";

export function register(server) {
  server.tool("get_setting", { key: z.string() }, async ({ key }) => {
    const row = getDb().prepare("SELECT value FROM app_settings WHERE key = ?").get(key);
    return { content: [{ type: "text", text: JSON.stringify(row ? row.value : null) }] };
  });

  server.tool("set_setting", { key: z.string(), value: z.string() }, async ({ key, value }) => {
    getDb().prepare(
      "INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    ).run(key, value);
    return { content: [{ type: "text", text: JSON.stringify({ success: true }) }] };
  });

  server.tool("get_all_settings", {}, async () => {
    const rows = getDb().prepare("SELECT key, value FROM app_settings").all();
    const settings = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return { content: [{ type: "text", text: JSON.stringify(settings) }] };
  });
}
