#!/usr/bin/env node
import { run } from '../src/mcp.js';

run().catch((err) => {
  process.stderr.write(`cpac-mcp: ${err.stack || err.message}\n`);
  process.exit(1);
});
