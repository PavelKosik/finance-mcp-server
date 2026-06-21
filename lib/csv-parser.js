import { readFileSync } from "fs";
import { createHash } from "crypto";

/**
 * Parse a bank-export CSV into normalized transaction objects.
 *
 * This parser is intentionally tolerant of the messy real-world formats banks
 * produce: it auto-detects the header row, matches columns by a list of
 * candidate names (so multiple bank dialects work), handles both UTF-8 and
 * Windows-1250 encodings, strips BOMs, and parses localized number formats
 * (thousands separators, comma decimals, currency symbols).
 *
 * Expected (case-insensitive) column names — any one candidate per field works:
 *   date         : "date", "booking date", "transaction date"
 *   amount       : "amount", "value"
 *   currency     : "currency"
 *   counterparty : "counterparty", "counterparty name", "payee"
 *   account no.  : "counterparty account", "account number"
 *   description  : "description", "message", "note"
 *
 * Returns: [{ date, amount, currency, originalAmount, counterpartyName,
 *             counterpartyAccount, description, externalId }]
 * Amounts are returned as integer minor units (e.g. cents). A stable
 * `externalId` hash is derived per row so re-imports can deduplicate.
 */
export function parseCsv(filePath) {
  const content = readFileSync(filePath);
  let text;
  try {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    text = decoder.decode(content);
  } catch {
    const decoder = new TextDecoder("windows-1250");
    text = decoder.decode(content);
  }
  text = text.replace(/^﻿/, "");
  const lines = text.split(/\r?\n/);

  let headerIdx = 0;
  while (headerIdx < lines.length && !lines[headerIdx].trim()) headerIdx++;
  if (headerIdx >= lines.length) throw new Error("CSV file is empty or has no header");

  const headers = splitCsvLine(lines[headerIdx]).map((h) => h.toLowerCase().trim());
  const colDate = findColumn(headers, ["date", "booking date", "transaction date"]);
  const colAmount = findColumn(headers, ["amount", "value"]);
  const colCurrency = findColumn(headers, ["currency"]);
  const colCounterpartyName = findColumn(headers, ["counterparty", "counterparty name", "payee"]);
  const colCounterpartyAccount = findColumn(headers, ["counterparty account", "account number"]);
  const colMessage = findColumn(headers, ["description", "message"]);
  const colNote = headers.indexOf("note");
  const colOriginalAmount = findColumn(headers, ["original amount"]);

  if (colDate === -1) throw new Error("No date column found");
  if (colAmount === -1) throw new Error("No amount column found");

  const transactions = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const fields = splitCsvLine(line);
    const getField = (idx) => (idx >= 0 && idx < fields.length ? fields[idx].trim() : "");

    const dateRaw = getField(colDate);
    if (!dateRaw) continue;
    const date = parseDate(dateRaw);
    if (!date) throw new Error(`Invalid date: ${dateRaw}`);

    const amountRaw = getField(colAmount);
    const amount = parseAmount(amountRaw);
    if (amount === null) throw new Error(`Invalid amount: ${amountRaw}`);

    const currency = (colCurrency >= 0 ? getField(colCurrency) : "") || "USD";
    const counterpartyName = nonempty(getField(colCounterpartyName));
    const counterpartyAccount = nonempty(getField(colCounterpartyAccount));
    const message = colMessage >= 0 ? nonempty(getField(colMessage)) : null;
    const note = colNote >= 0 ? nonempty(getField(colNote)) : null;

    let description = null;
    if (message && note) description = `${message} | ${note}`;
    else if (message) description = message;
    else if (note) description = note;

    let originalAmount = null;
    if (colOriginalAmount >= 0) {
      const raw = getField(colOriginalAmount);
      if (raw) originalAmount = parseAmount(raw);
    }

    const externalId = computeExternalId(date, amount, counterpartyName, description);
    transactions.push({ date, amount, currency, originalAmount, counterpartyName, counterpartyAccount, description, externalId });
  }
  return transactions;
}

// Splits on both `;` and `,` delimiters and unwraps quoted fields.
function splitCsvLine(line) {
  const delimiter = line.includes(";") ? ";" : ",";
  return line.split(delimiter).map((field) => {
    field = field.trim();
    if (field.startsWith('"') && field.endsWith('"') && field.length >= 2) {
      return field.slice(1, -1);
    }
    return field;
  });
}

function findColumn(headers, candidates) {
  for (const candidate of candidates) {
    const idx = headers.indexOf(candidate);
    if (idx !== -1) return idx;
  }
  return -1;
}

function nonempty(s) {
  if (!s) return null;
  s = s.trim();
  return s || null;
}

// Accepts D.M.Y, D/M/Y, and Y-M-D; returns ISO `YYYY-MM-DD`.
export function parseDate(s) {
  s = s.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const sep = s.includes(".") ? "." : s.includes("/") ? "/" : null;
  if (!sep) return null;
  const parts = s.split(sep);
  if (parts.length !== 3) return null;
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const year = parseInt(parts[2], 10);
  if (day < 1 || day > 31 || month < 1 || month > 12 || year < 1000) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Parses localized amounts into integer minor units (cents). Strips currency
// symbols, non-breaking spaces, and thousands separators; treats `,` as decimal.
export function parseAmount(s) {
  if (!s) return null;
  const cleaned = s
    .replace(/[A-Za-z$€£]/g, "")
    .replace(/ /g, "")
    .replace(/ /g, "")
    .replace(/ /g, "")
    .replace(/,/g, ".")
    .trim();
  if (!cleaned) return null;
  const value = parseFloat(cleaned);
  if (isNaN(value)) return null;
  return Math.round(value * 100);
}

function computeExternalId(date, amount, counterparty, description) {
  const input = `${date}|${amount}|${counterparty || ""}|${description || ""}`;
  return createHash("sha256").update(input).digest("hex");
}
