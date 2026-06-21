# CLAUDE.md

Project handbook for [Claude Code](https://claude.com/claude-code) (and any AI assistant) working in this repository. This project was built with Claude Code, and this file is the source of truth for how to extend it.

## What this is

A **Model Context Protocol (MCP) server** that exposes a personal-finance SQLite database as typed, schema-validated tools an AI assistant (e.g. Claude Desktop) can call directly — accounts, transactions, budgets, debts, investments, tax estimates, and goals over natural language.

It is a clean, self-contained **reference implementation**: it ships with **no data and no secrets**, just the schema, tool definitions, and server scaffolding. See `README.md` for the full tool table and the Claude Desktop wiring.

## Layout

```
index.js              # MCP server entry point — registers every tool module over stdio
db.js                 # SQLite connection (better-sqlite3); path from DATABASE_PATH env var
schema/schema.sql     # Consolidated schema (no data)
scripts/init-db.js    # Creates an empty database from the schema
lib/
  csv-parser.js       # Tolerant bank-CSV parser (pure, unit-tested)
  tax-calc.js         # Tax-estimation logic (pure, unit-tested)
tools/                # One module per domain, each exporting register(server)
  settings.js  accounts.js  transactions.js  categories.js  debts.js
  budget.js    investments.js  tax.js  health.js  goals.js  actions.js  broker.js
test/                 # Unit tests for the pure lib/ functions
```

## The core pattern

Every domain is a module that exports a single `register(server)` function. Inside, each tool is declared with a **Zod schema** for its inputs and a handler that runs parameterized SQL through `db.js` and returns its result as JSON text content (the standard MCP shape).

Adding a tool (the common task):
1. Pick (or add) the right module in `tools/`.
2. Declare the tool inside that module's `register(server)` with a Zod input schema.
3. Use **parameterized** queries via the shared `db` — never string-concatenate user values into SQL.
4. If it's bulk (import/sync), wrap writes in a single transaction so a failure leaves the DB unchanged.
5. If you add a new module, register it in `index.js`.
6. Update the tool table in `README.md`.

## Conventions

- **Money is integer minor units** (e.g. cents). Never store currency as a float. Convert at the edges only.
- **Validate every input with Zod** at the tool boundary so malformed agent calls fail loudly instead of corrupting state.
- **All SQL is parameterized.** Foreign keys on, WAL mode, atomic multi-statement transactions for bulk writes.
- **Keep pure logic in `lib/` and unit-tested.** `csv-parser.js` and `tax-calc.js` have no DB or MCP dependency — that's why they're testable. Preserve that separation.
- **No secrets, no data, no jurisdiction-specific rules in the repo.** Credentials (e.g. the `sync_brokerage` example) come from env vars / settings, never hardcoded. The tax estimator is illustrative only — not tax advice for any country.
- **DB path is `DATABASE_PATH`** from the environment; don't assume a fixed location.

## Working here

```bash
npm install
npm run init-db    # creates ./data/finance.db (empty) from the schema
npm test           # runs the pure-function unit tests; no database needed
npm start          # starts the MCP server over stdio
```

When changing `lib/csv-parser.js` or `lib/tax-calc.js`, run `npm test` — those are the only parts with automated coverage, so keep them green.

## Guardrails

- Never commit a real database, a populated `data/`, a `.env`, or any credential.
- `broker.js` is a **generic placeholder** demonstrating the credentials-from-env + atomic-write pattern; it points at no real provider. Keep it that way unless explicitly wiring a real one.
- This is a portfolio/reference build generalized from a private app — keep it free of personal financial data and provider-specific secrets.
