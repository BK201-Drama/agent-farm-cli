#!/usr/bin/env node
import { Command } from "commander";
import { print } from "./print.js";
import { readCliPackageVersion } from "./version.js";
import { registerAllCommands } from "./register/index.js";
import { maybeAutoSelfUpdateFromEnv } from "./register/self-update.js";

const program = new Command();
program.name("agent-farm").description("Parallel agent farm CLI").version(readCliPackageVersion());
registerAllCommands(program);

await maybeAutoSelfUpdateFromEnv(process.argv);

program.parseAsync(process.argv).catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  print({ ok: false, error: message });
  process.exit(1);
});
