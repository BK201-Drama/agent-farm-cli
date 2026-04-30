#!/usr/bin/env node
import { access, chmod, mkdir, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";
import { Command } from "commander";
import { TASK_STATUSES, type TaskStatus } from "../../domain/task.js";
import { runWorkerLoop } from "../../application/services/worker-service.js";
import { createJsonlContainer } from "../../bootstrap/container.js";
import { AGENT_FARM_SKILL_MD } from "../../infrastructure/templates/skill-template.js";
import { generateDispatchScript } from "../../infrastructure/templates/dispatch-script-template.js";

const DEFAULT_TASK_FILE = `${process.cwd()}/.agent-farm/queue/tasks.jsonl`;
const DEFAULT_EVENT_FILE = `${process.cwd()}/.agent-farm/queue/events.jsonl`;
const DEFAULT_QUARANTINE_FILE = `${process.cwd()}/.agent-farm/queue/quarantine_tasks.jsonl`;
const EXECUTOR_PRESETS: Record<string, string> = {
  opencode: "opencode run --dir . --dangerously-skip-permissions {prompt}",
  codex: "codex exec --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox {prompt}",
  claude: "claude -p {prompt} --dangerously-skip-permissions",
};

function print(data: unknown): void {
  process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
}

function parseStatus(raw: string): TaskStatus {
  if ((TASK_STATUSES as readonly string[]).includes(raw)) {
    return raw as TaskStatus;
  }
  throw new Error(`invalid status: ${raw}`);
}

const program = new Command();
program.name("agent-farm").description("Parallel agent farm CLI").version("0.1.0");

const skill = program.command("skill");
skill
  .command("install")
  .option("--target-dir <path>", "project root for skill install", process.cwd())
  .option("--skill-name <name>", "skill folder name", "agent-farm-dispatch")
  .option("--force", "overwrite existing SKILL.md", false)
  .action(async (opts) => {
    const projectRoot = resolve(String(opts.targetDir));
    const skillDir = resolve(projectRoot, ".cursor/skills", String(opts.skillName));
    const skillPath = resolve(skillDir, "SKILL.md");
    await mkdir(skillDir, { recursive: true });
    if (!opts.force) {
      try {
        await access(skillPath, constants.F_OK);
        throw new Error(`skill already exists: ${skillPath} (use --force to overwrite)`);
      } catch (err) {
        if (err instanceof Error && err.message.startsWith("skill already exists:")) {
          throw err;
        }
      }
    }
    await writeFile(skillPath, AGENT_FARM_SKILL_MD, "utf8");
    print({ ok: true, skill_path: skillPath });
  });

const project = program.command("project");
project
  .command("init")
  .option("--target-dir <path>", "project root directory", process.cwd())
  .option("--skill-name <name>", "skill folder name", "agent-farm-dispatch")
  .option("--workers <n>", "default dispatch workers in script", "6")
  .option("--executor <name>", "executor preset: opencode|codex|claude", "opencode")
  .option("--executor-command <tpl>", "custom executor command template (overrides --executor)")
  .option("--force", "overwrite existing files", false)
  .action(async (opts) => {
    const projectRoot = resolve(String(opts.targetDir));
    const queueDir = resolve(projectRoot, ".agent-farm/queue");
    const taskFile = resolve(queueDir, "tasks.jsonl");
    const eventFile = resolve(queueDir, "events.jsonl");
    const quarantineFile = resolve(queueDir, "quarantine_tasks.jsonl");
    const skillDir = resolve(projectRoot, ".cursor/skills", String(opts.skillName));
    const skillPath = resolve(skillDir, "SKILL.md");
    const scriptDir = resolve(projectRoot, "scripts");
    const dispatchPath = resolve(scriptDir, "agent-farm-dispatch.sh");
    const force = Boolean(opts.force);

    await mkdir(queueDir, { recursive: true });
    await mkdir(skillDir, { recursive: true });
    await mkdir(scriptDir, { recursive: true });

    const ensureWritable = async (path: string): Promise<void> => {
      if (force) return;
      try {
        await access(path, constants.F_OK);
        throw new Error(`file already exists: ${path} (use --force to overwrite)`);
      } catch (err) {
        if (err instanceof Error && err.message.startsWith("file already exists:")) throw err;
      }
    };

    await ensureWritable(skillPath);
    await ensureWritable(dispatchPath);

    await writeFile(taskFile, "", "utf8");
    await writeFile(eventFile, "", "utf8");
    await writeFile(quarantineFile, "", "utf8");
    await writeFile(skillPath, AGENT_FARM_SKILL_MD, "utf8");
    const workers = Number(opts.workers);
    const preset = String(opts.executor).toLowerCase();
    const commandTemplate =
      String(opts.executorCommand ?? "").trim() || EXECUTOR_PRESETS[preset] || EXECUTOR_PRESETS.opencode;
    const scriptText = generateDispatchScript(commandTemplate, Number.isFinite(workers) ? workers : 6);
    await writeFile(dispatchPath, scriptText, "utf8");
    await chmod(dispatchPath, 0o755);

    print({
      ok: true,
      project_root: projectRoot,
      files: {
        task_file: taskFile,
        event_file: eventFile,
        quarantine_file: quarantineFile,
        skill_file: skillPath,
        dispatch_script: dispatchPath,
      },
      executor: {
        selected: String(opts.executorCommand ?? "").trim() ? "custom" : preset,
        command_template: commandTemplate,
      },
    });
  });

const queue = program.command("queue");
queue
  .command("add")
  .requiredOption("--task-json <json>", "task json object")
  .option("--task-file <path>", "task jsonl path", DEFAULT_TASK_FILE)
  .action(async (opts) => {
    const container = createJsonlContainer({
      taskFile: String(opts.taskFile),
      eventFile: DEFAULT_EVENT_FILE,
      quarantineFile: DEFAULT_QUARANTINE_FILE,
    });
    const task = JSON.parse(String(opts.taskJson ?? "{}")) as Record<string, unknown>;
    const row = await container.queueService.addTask(task);
    print({ ok: true, task: row });
  });

queue
  .command("list")
  .option("--task-file <path>", "task jsonl path", DEFAULT_TASK_FILE)
  .action(async (opts) => {
    const container = createJsonlContainer({
      taskFile: String(opts.taskFile),
      eventFile: DEFAULT_EVENT_FILE,
      quarantineFile: DEFAULT_QUARANTINE_FILE,
    });
    print({ ok: true, tasks: await container.queueService.listTasks() });
  });

queue
  .command("claim")
  .option("--task-file <path>", "task jsonl path", DEFAULT_TASK_FILE)
  .option("--limit <n>", "claim count", "1")
  .action(async (opts) => {
    const container = createJsonlContainer({
      taskFile: String(opts.taskFile),
      eventFile: DEFAULT_EVENT_FILE,
      quarantineFile: DEFAULT_QUARANTINE_FILE,
    });
    print({ ok: true, claimed: await container.queueService.claimTasks(Number(opts.limit)) });
  });

queue
  .command("update")
  .requiredOption("--task-id <id>", "task id")
  .requiredOption("--status <status>", "next status")
  .option("--extra-json <json>", "extra fields", "{}")
  .option("--task-file <path>", "task jsonl path", DEFAULT_TASK_FILE)
  .action(async (opts) => {
    const container = createJsonlContainer({
      taskFile: String(opts.taskFile),
      eventFile: DEFAULT_EVENT_FILE,
      quarantineFile: DEFAULT_QUARANTINE_FILE,
    });
    const ok = await container.queueService.updateStatus(
      String(opts.taskId),
      parseStatus(String(opts.status)),
      JSON.parse(String(opts.extraJson))
    );
    print({ ok, task_id: opts.taskId, status: opts.status });
  });

queue
  .command("review-approve")
  .requiredOption("--task-id <id>", "task id")
  .option("--task-file <path>", "task jsonl path", DEFAULT_TASK_FILE)
  .option("--reviewer <name>", "reviewer", "manager")
  .option("--notes <text>", "review notes", "")
  .option("--spawn-execute", "spawn execute task for plan task", false)
  .action(async (opts) => {
    const container = createJsonlContainer({
      taskFile: String(opts.taskFile),
      eventFile: DEFAULT_EVENT_FILE,
      quarantineFile: DEFAULT_QUARANTINE_FILE,
    });
    print(
      await container.queueService.reviewApprove(
        String(opts.taskId),
        String(opts.reviewer),
        String(opts.notes),
        Boolean(opts.spawnExecute)
      )
    );
  });

queue
  .command("review-reject")
  .requiredOption("--task-id <id>", "task id")
  .option("--task-file <path>", "task jsonl path", DEFAULT_TASK_FILE)
  .option("--reviewer <name>", "reviewer", "manager")
  .option("--reason <text>", "reject reason", "")
  .option("--move-to-retry", "move to retry after rejection", false)
  .action(async (opts) => {
    const container = createJsonlContainer({
      taskFile: String(opts.taskFile),
      eventFile: DEFAULT_EVENT_FILE,
      quarantineFile: DEFAULT_QUARANTINE_FILE,
    });
    print(
      await container.queueService.reviewReject(
        String(opts.taskId),
        String(opts.reviewer),
        String(opts.reason),
        Boolean(opts.moveToRetry)
      )
    );
  });

queue
  .command("recover-stale")
  .option("--task-file <path>", "task jsonl path", DEFAULT_TASK_FILE)
  .option("--lease-timeout-seconds <n>", "lease timeout", "1800")
  .action(async (opts) => {
    const container = createJsonlContainer({
      taskFile: String(opts.taskFile),
      eventFile: DEFAULT_EVENT_FILE,
      quarantineFile: DEFAULT_QUARANTINE_FILE,
    });
    print(await container.queueService.recoverStale(Number(opts.leaseTimeoutSeconds)));
  });

queue
  .command("quarantine-poison")
  .option("--task-file <path>", "task jsonl path", DEFAULT_TASK_FILE)
  .option("--quarantine-file <path>", "quarantine jsonl path", DEFAULT_QUARANTINE_FILE)
  .option("--max-attempts <n>", "poison threshold attempts", "3")
  .action(async (opts) => {
    const container = createJsonlContainer({
      taskFile: String(opts.taskFile),
      eventFile: DEFAULT_EVENT_FILE,
      quarantineFile: String(opts.quarantineFile),
    });
    print(await container.queueService.quarantinePoison(Number(opts.maxAttempts)));
  });

program
  .command("worker")
  .option("--task-file <path>", "task jsonl path", DEFAULT_TASK_FILE)
  .option("--event-file <path>", "event jsonl path", DEFAULT_EVENT_FILE)
  .option("--quarantine-file <path>", "quarantine jsonl path", DEFAULT_QUARANTINE_FILE)
  .option("--runs-dir <path>", "run artifacts dir", "/tmp/agent-farm-runs")
  .option("--workers <n>", "parallel workers", "2")
  .option("--loop-sleep-ms <n>", "sleep between loops", "500")
  .option("--command-template <tpl>", "command template", "echo {prompt}")
  .option("--lease-timeout-seconds <n>", "lease timeout", "1800")
  .option("--poison-max-attempts <n>", "poison threshold", "3")
  .option("--auto-approve-review", "auto approve review to done", false)
  .action(async (opts) => {
    const container = createJsonlContainer({
      taskFile: String(opts.taskFile),
      eventFile: String(opts.eventFile),
      quarantineFile: String(opts.quarantineFile),
    });
    await runWorkerLoop({
      queueService: container.queueService,
      eventRepo: container.eventRepo,
      runsDir: String(opts.runsDir),
      workers: Number(opts.workers),
      loopSleepMs: Number(opts.loopSleepMs),
      commandTemplate: String(opts.commandTemplate),
      leaseTimeoutSeconds: Number(opts.leaseTimeoutSeconds),
      poisonMaxAttempts: Number(opts.poisonMaxAttempts),
      autoApproveReview: Boolean(opts.autoApproveReview),
    });
    print({ ok: true });
  });

program
  .command("insights")
  .option("--task-file <path>", "task jsonl path", DEFAULT_TASK_FILE)
  .option("--event-file <path>", "event jsonl path", DEFAULT_EVENT_FILE)
  .option("--top-n <n>", "top failures", "5")
  .option("--output-file <path>", "write json report to file", "")
  .action(async (opts) => {
    const container = createJsonlContainer({
      taskFile: String(opts.taskFile),
      eventFile: String(opts.eventFile),
      quarantineFile: DEFAULT_QUARANTINE_FILE,
    });
    const report = await container.insightsService.build(Number(opts.topN));
    if (String(opts.outputFile)) {
      await writeFile(String(opts.outputFile), `${JSON.stringify(report, null, 2)}\n`, "utf8");
    }
    print(report);
  });

program
  .command("doctor")
  .option("--task-file <path>", "task jsonl path", DEFAULT_TASK_FILE)
  .option("--quarantine-file <path>", "quarantine jsonl path", DEFAULT_QUARANTINE_FILE)
  .option("--lease-timeout-seconds <n>", "lease timeout", "1800")
  .option("--review-overdue-hours <n>", "review overdue threshold", "2")
  .option("--top-n <n>", "top failures", "5")
  .option("--output-file <path>", "write json report to file", "")
  .action(async (opts) => {
    const container = createJsonlContainer({
      taskFile: String(opts.taskFile),
      eventFile: DEFAULT_EVENT_FILE,
      quarantineFile: String(opts.quarantineFile),
    });
    const report = await container.doctorService.build(
      Number(opts.leaseTimeoutSeconds),
      Number(opts.reviewOverdueHours),
      Number(opts.topN)
    );
    if (String(opts.outputFile)) {
      await writeFile(String(opts.outputFile), `${JSON.stringify(report, null, 2)}\n`, "utf8");
    }
    print(report);
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  print({ ok: false, error: message });
  process.exit(1);
});
