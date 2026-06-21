import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { parseCsv, parseDate, parseAmount } from "../lib/csv-parser.js";

test("parseDate handles multiple formats", () => {
  assert.equal(parseDate("31.12.2026"), "2026-12-31");
  assert.equal(parseDate("1/2/2026"), "2026-02-01");
  assert.equal(parseDate("2026-03-15"), "2026-03-15");
  assert.equal(parseDate("nonsense"), null);
});

test("parseAmount converts to integer minor units", () => {
  assert.equal(parseAmount("12.34"), 1234);
  assert.equal(parseAmount("1 234,56"), 123456); // localized thousands + comma decimal
  assert.equal(parseAmount("-50"), -5000);
  assert.equal(parseAmount("$10.00"), 1000);
  assert.equal(parseAmount(""), null);
});

test("parseCsv reads a semicolon-delimited export", () => {
  const file = join(tmpdir(), `mcp-csv-test-${Date.now()}.csv`);
  const csv = [
    "Date;Amount;Currency;Counterparty;Description",
    "01.03.2026;-12,50;USD;Coffee Shop;Latte",
    "02.03.2026;1000,00;USD;Employer;Salary",
  ].join("\n");
  writeFileSync(file, csv, "utf-8");
  try {
    const rows = parseCsv(file);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].date, "2026-03-01");
    assert.equal(rows[0].amount, -1250);
    assert.equal(rows[0].counterpartyName, "Coffee Shop");
    assert.equal(rows[1].amount, 100000);
    // Stable, unique dedup hash per row.
    assert.match(rows[0].externalId, /^[0-9a-f]{64}$/);
    assert.notEqual(rows[0].externalId, rows[1].externalId);
  } finally {
    rmSync(file, { force: true });
  }
});
