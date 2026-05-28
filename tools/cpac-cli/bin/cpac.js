#!/usr/bin/env node
import { main } from '../src/cli.js';

main(process.argv.slice(2)).catch((err) => {
  process.stderr.write(`cpac: ${err.stack || err.message}\n`);
  process.exit(1);
});
