#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { closeDb } from "./db.js";

import * as settings from "./tools/settings.js";
import * as accounts from "./tools/accounts.js";
import * as transactions from "./tools/transactions.js";
import * as categories from "./tools/categories.js";
import * as debts from "./tools/debts.js";
import * as budget from "./tools/budget.js";
import * as investments from "./tools/investments.js";
import * as tax from "./tools/tax.js";
import * as health from "./tools/health.js";
import * as goals from "./tools/goals.js";
import * as actions from "./tools/actions.js";
import * as broker from "./tools/broker.js";

const server = new McpServer({
  name: "finance-mcp-server",
  version: "1.0.0",
});

// Each tool module exposes a `register(server)` function that attaches its
// tools to the server. Keeping tools in small, domain-focused modules makes
// the surface easy to reason about and extend.
settings.register(server);
accounts.register(server);
transactions.register(server);
categories.register(server);
debts.register(server);
budget.register(server);
investments.register(server);
tax.register(server);
health.register(server);
goals.register(server);
actions.register(server);
broker.register(server);

const transport = new StdioServerTransport();

process.on("SIGINT", () => {
  closeDb();
  process.exit(0);
});

await server.connect(transport);
