#!/usr/bin/env node
process.env.AGENT_FARM_PROMPT_LINT_STRICT = "1";
await import("./validate-waves.mjs");
