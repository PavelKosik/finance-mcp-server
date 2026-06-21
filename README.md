# Finance MCP Server

A **Model Context Protocol (MCP) server** that turns a personal-finance SQLite database into a set of typed, schema-validated tools an AI assistant (such as Claude Desktop) can call directly — letting you manage accounts, transactions, budgets, debts, investments, tax estimates, and goals through natural language.

> The Model Context Protocol is an open standard that lets AI assistants connect to external tools and data sources through a uniform interface.

This repository is a clean, self-contained reference implementation. It ships with **no data and no secrets** — just the schema, the tool definitions, and the server scaffolding. Create an empty database, point an MCP client at it, and start talking to your finances.

## Why this exists

It is a focused demonstration of how to build a production-shaped MCP server:

- **Modular tool registration** — each domain (accounts, transactions, tax, …) is a small module exposing a `register(server)` function.
- **Typed, validated inputs** — every tool declares its parameters with [Zod](https://zod.dev) schemas, so bad input is rejected before it reaches the database.
- **A real data layer** — [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) with parameterized queries, foreign keys, WAL mode, and atomic multi-statement transactions.
- **Analytical tools, not just CRUD** — e.g. monthly spending rollups, budget progress, a debt-payoff amortization simulator, a tax estimator, and a derived financial-health score.
- **Safe external integrations** — an example brokerage-sync tool that reads credentials from environment variables / settings (never hard-coded) and writes results inside a single transaction.

## Tools

| Tool | Description | Key inputs |
| --- | --- | --- |
| `get_setting` / `set_setting` / `get_all_settings` | Read/write key-value app settings | `key`, `value` |
| `get_accounts` / `get_account` | List accounts or fetch one | `id` |
| `create_account` / `delete_account` | Add or remove an account | `name`, `type`, `bank`, `balance`, `creditLimit` |
| `get_transactions` | Query transactions with filters & paging | `accountId`, `categoryId`, `fromDate`, `toDate`, `search`, `isBusiness`, `limit`, `offset` |
| `create_transaction` / `delete_transaction` | Add or remove a transaction | `accountId`, `date`, `amount`, `currency`, `categoryId` |
| `update_transaction_category` | Recategorize a transaction | `id`, `categoryId`, `isBusiness` |
| `get_monthly_spending` | Spending grouped by category for a month | `year`, `month` |
| `import_csv` | Import a bank-export CSV with auto-categorization & dedup | `filePath`, `accountId` |
| `get_categories` / `create_category` / `update_category` / `delete_category` | Manage categories | `name`, `type`, `icon`, `color`, `isTaxDeductible` |
| `get_categorization_rules` / `create_categorization_rule` / `delete_categorization_rule` | Regex rules that auto-tag imported transactions | `pattern`, `categoryId`, `isBusiness` |
| `get_debts` / `create_debt` / `delete_debt` | Manage debts | `name`, `type`, `originalBalance`, `currentBalance`, `interestRate` |
| `get_payoff_projection` | Simulate months & interest to pay off a debt | `debtId`, `extraMonthly` |
| `get_budget_rules` / `set_budget_rule` / `delete_budget_rule` | Per-category monthly budget limits | `categoryId`, `monthlyLimit`, `alertThreshold` |
| `get_budget_progress` | Spend-vs-limit progress for a month | `year`, `month` |
| `get_holdings` / `create_holding` / `update_holding_value` / `delete_holding` | Manage investment holdings | `name`, `type`, `units`, `currentValue` |
| `add_investment_transaction` / `get_holding_transactions` | Record & list buy/sell/dividend/fee events | `holdingId`, `type`, `units`, `pricePerUnit` |
| `get_portfolio_snapshots` / `record_portfolio_snapshot` | Track portfolio value over time | — |
| `get_tax_estimate` | Estimate tax burden for a year | `year` |
| `get_tax_config` / `update_tax_config` | Per-year tax rule parameters | `year`, `key`, `value` |
| `add_tax_record` | Record an income/expense/deduction item | `year`, `type`, `amount` |
| `export_tax_csv` | Export business transactions as CSV | `year` |
| `get_health_score` | Derived 0–10 financial-health score | — |
| `check_payment_reminders` | Upcoming debt payments due soon | — |
| `get_goals` / `get_goal` / `create_goal` / `update_goal` / `delete_goal` | Financial goals with live computed metrics | `title`, `type`, `targetValue`, `metric` |
| `get_actions` / `create_action` / `update_action` / `toggle_action` / `delete_action` | Action items attached to goals | `goalId`, `title`, `dueDate` |
| `sync_brokerage` | Example: sync holdings from an external brokerage API | — (credentials from env/settings) |
| `get_sync_history` | Recent external-sync log entries | `source` |

## Architecture

```
index.js              # MCP server entry point — registers every tool module over stdio
db.js                 # SQLite connection (better-sqlite3), path from DATABASE_PATH
schema/schema.sql     # Consolidated database schema (no data)
scripts/init-db.js    # Creates an empty database from the schema
lib/
  csv-parser.js       # Tolerant bank-CSV parser (pure, unit-tested)
  tax-calc.js         # Tax-estimation logic (pure, unit-tested)
tools/
  settings.js         # Key-value settings
  accounts.js         # Accounts CRUD
  transactions.js     # Transactions + CSV import
  categories.js       # Categories + categorization rules
  debts.js            # Debts + payoff projection
  budget.js           # Budget rules + progress
  investments.js      # Holdings, investment transactions, snapshots
  tax.js              # Tax records, config, estimate, export
  health.js           # Financial-health score + reminders
  goals.js            # Goals with computed metrics
  actions.js          # Action items for goals
  broker.js           # Example external brokerage sync
test/                 # Unit tests for the pure library functions
```

**Design notes**

- Money is stored as **integer minor units** (e.g. cents) to avoid floating-point errors.
- Every query is **parameterized** — no string-concatenated SQL with user values.
- Bulk writes (CSV import, brokerage sync) run inside a **single transaction** so a failure leaves the database unchanged.
- Each tool returns its result as JSON text content, the standard MCP shape.

## Getting started

Requires **Node.js 18+** (for the global `fetch` used by the example integration).

```bash
git clone <your-fork-url> finance-mcp-server
cd finance-mcp-server
npm install

# Create an empty database at ./data/finance.db
npm run init-db

# (optional) configure environment
cp .env.example .env

# Run the test suite (no database required)
npm test

# Start the server (speaks MCP over stdio)
npm start
```

## Connecting to Claude Desktop

Add the server to your Claude Desktop config
(`%APPDATA%\Claude\claude_desktop_config.json` on Windows,
`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "finance": {
      "command": "node",
      "args": ["C:/path/to/finance-mcp-server/index.js"],
      "env": {
        "DATABASE_PATH": "C:/path/to/finance-mcp-server/data/finance.db"
      }
    }
  }
}
```

Restart Claude Desktop. The finance tools will appear and Claude can call them on your behalf — e.g. *"Add a $42 grocery expense today"* or *"How much did I spend on dining last month?"*. The same server works with any MCP-compatible client over stdio.

## Scope & honesty note

This is a **portfolio / reference implementation** extracted and generalized from a private personal-finance application. It demonstrates the engineering — MCP tool design, schema validation, and a SQLite data layer — and intentionally ships with no data, no credentials, and no jurisdiction-specific business rules.

The `sync_brokerage` tool is a **generic example**: it shows the credentials-from-environment + atomic-write pattern but points at a placeholder API. Wire it up to a real provider before using it. The tax estimator is **illustrative only and is not tax advice** for any country.

## License

[MIT](LICENSE)
