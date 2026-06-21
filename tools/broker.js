import { z } from "zod";
import { getDb } from "../db.js";

/**
 * Example external-integration tools.
 *
 * These tools demonstrate the pattern for syncing data from a third-party
 * brokerage / exchange API into the local database:
 *
 *   1. Read credentials from settings (which are populated from environment
 *      variables — never hard-code secrets).
 *   2. Fetch remote data over HTTPS (async, outside any DB transaction).
 *   3. Write the results to the database atomically inside a transaction.
 *   4. Record a sync-log entry and a portfolio snapshot.
 *
 * The fetch function below is a generic placeholder. Replace `fetchPortfolio`
 * with a real client for whatever provider you integrate (REST, Basic auth,
 * Bearer/JWT, etc.). No real provider, endpoint, or credential is shipped.
 */

/**
 * Read a setting value, preferring the database (set via `set_setting`) and
 * falling back to an environment variable of the same upper-cased name.
 */
function readCredential(db, key) {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(key);
  return row?.value ?? process.env[key.toUpperCase()] ?? null;
}

/**
 * Placeholder remote fetch. In a real integration this would call the
 * provider's HTTP API using the supplied credentials and return a normalized
 * list of positions: { ticker, quantity, currentPrice, averagePrice }.
 */
async function fetchPortfolio(baseUrl, apiKey) {
  const res = await fetch(`${baseUrl}/portfolio`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`Brokerage API error ${res.status}`);
  return res.json();
}

export function register(server) {
  server.tool("sync_brokerage", {}, async () => {
    const db = getDb();
    const apiKey = readCredential(db, "brokerage_api_key");
    const baseUrl = readCredential(db, "brokerage_base_url");
    if (!apiKey || !baseUrl) {
      throw new Error(
        "Brokerage credentials not configured. Set BROKERAGE_API_KEY and " +
          "BROKERAGE_BASE_URL (env) or the brokerage_api_key / brokerage_base_url settings."
      );
    }

    // Exchange rate to convert provider currency into the base currency.
    const fxRate = parseFloat(readCredential(db, "fx_rate") || "1.0");

    // 1. Fetch remote data (network I/O happens before the DB transaction).
    const positions = await fetchPortfolio(baseUrl, apiKey);

    // 2. Atomic write: replace previously-synced holdings and snapshot totals.
    const tx = db.transaction(() => {
      db.prepare("DELETE FROM investment_holdings WHERE source = 'brokerage'").run();
      let totalValue = 0;
      for (const pos of positions) {
        const value = Math.round(pos.currentPrice * pos.quantity * fxRate * 100);
        const avgPrice = Math.round(pos.averagePrice * fxRate * 100);
        totalValue += value;
        db.prepare(
          `INSERT INTO investment_holdings
           (name, type, units, avg_purchase_price, current_value, source, source_ticker, last_updated_at)
           VALUES (?, 'etf', ?, ?, ?, 'brokerage', ?, datetime('now'))`
        ).run(pos.ticker, pos.quantity, avgPrice, value, pos.ticker);
      }
      db.prepare("INSERT INTO sync_log (source, holdings_snapshot) VALUES ('brokerage', ?)")
        .run(JSON.stringify(positions));
      const total = db.prepare("SELECT COALESCE(SUM(current_value), 0) as v FROM investment_holdings").get().v;
      const today = new Date().toISOString().split("T")[0];
      db.prepare("INSERT OR REPLACE INTO portfolio_snapshots (date, total_value) VALUES (?, ?)").run(today, total);
      return { syncedCount: positions.length, totalValue };
    });

    const result = tx();
    return { content: [{ type: "text", text: JSON.stringify({ source: "brokerage", ...result }) }] };
  });

  server.tool("get_sync_history", { source: z.string().optional() }, async ({ source }) => {
    const db = getDb();
    const rows = source
      ? db.prepare("SELECT id, source, synced_at, holdings_snapshot FROM sync_log WHERE source = ? ORDER BY synced_at DESC LIMIT 50").all(source)
      : db.prepare("SELECT id, source, synced_at, holdings_snapshot FROM sync_log ORDER BY synced_at DESC LIMIT 50").all();
    return { content: [{ type: "text", text: JSON.stringify(rows) }] };
  });
}
