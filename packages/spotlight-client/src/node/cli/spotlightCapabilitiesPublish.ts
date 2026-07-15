#!/usr/bin/env node
import { runCapabilityPublishCliV1 } from "../capabilityPublishCli.js";

runCapabilityPublishCliV1(process.argv.slice(2)).then(
  (code) => { process.exitCode = code; },
  (error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; },
);
