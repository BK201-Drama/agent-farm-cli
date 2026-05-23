import { compareSemver } from "../../../domain/semver/compare.js";
import {
  fetchRegistryLatest,
  packageName,
  type FetchRegistryLatest,
  type RegistryLatest,
} from "../../../infrastructure/npm/registry-client.js";
import { resolveCliInstall, type CliInstallKind } from "../../../infrastructure/npm/resolve-cli-install.js";
import { runNpmInstallPackage } from "../../../infrastructure/npm/run-npm-install.js";

export type SelfUpdateOptions = {
  currentVersion: string;
  /** 仅检查，不安装 */
  checkOnly?: boolean;
  /** 跳过确认，直接安装 */
  yes?: boolean;
  /** 强制 global / local；默认自动检测 */
  installKind?: CliInstallKind;
  tag?: string;
  /** 人类可读输出到 stderr */
  brief?: boolean;
  cliEntryUrl?: string;
  fetchLatest?: FetchRegistryLatest;
};

export type SelfUpdateResult = {
  ok: boolean;
  package: string;
  current: string;
  latest: string;
  registry: string;
  install_kind: CliInstallKind | "skipped";
  update_available: boolean;
  updated: boolean;
  message: string;
  command?: string;
};

function logBrief(brief: boolean, line: string): void {
  if (brief) process.stderr.write(`${line}\n`);
}

function installKindForUpdate(
  detected: ReturnType<typeof resolveCliInstall>,
  forced?: CliInstallKind,
): CliInstallKind | "skipped" {
  if (forced) return forced;
  if (detected.kind === "dev") return "skipped";
  return detected.kind;
}

export async function runSelfUpdate(opts: SelfUpdateOptions): Promise<SelfUpdateResult> {
  const current = opts.currentVersion.trim();
  const tag = String(opts.tag ?? "latest").trim() || "latest";
  const detected = resolveCliInstall(opts.cliEntryUrl);
  const kind = installKindForUpdate(detected, opts.installKind);

  let latestInfo: RegistryLatest;
  try {
    latestInfo = opts.fetchLatest
      ? await opts.fetchLatest(packageName(), "https://registry.npmjs.org")
      : await fetchRegistryLatest();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      package: packageName(),
      current,
      latest: "",
      registry: "",
      install_kind: kind,
      update_available: false,
      updated: false,
      message: `无法查询 npm registry：${msg}`,
    };
  }

  const latest = latestInfo.version;
  const cmp = compareSemver(current, latest);
  const updateAvailable = cmp < 0;

  if (kind === "skipped") {
    const message = `当前为开发目录运行（${current}），请在本机执行：npm install -g ${packageName()}@latest`;
    logBrief(Boolean(opts.brief), message);
    return {
      ok: true,
      package: packageName(),
      current,
      latest,
      registry: latestInfo.registry,
      install_kind: "skipped",
      update_available: updateAvailable,
      updated: false,
      message,
    };
  }

  if (!updateAvailable) {
    const message = `${packageName()} 已是最新：${current}（registry latest ${latest}）`;
    logBrief(Boolean(opts.brief), message);
    return {
      ok: true,
      package: packageName(),
      current,
      latest,
      registry: latestInfo.registry,
      install_kind: kind,
      update_available: false,
      updated: false,
      message,
    };
  }

  if (opts.checkOnly) {
    const message = `有可用更新：${current} → ${latest}（${kind}）。执行：agent-farm self-update --yes`;
    logBrief(Boolean(opts.brief), message);
    return {
      ok: true,
      package: packageName(),
      current,
      latest,
      registry: latestInfo.registry,
      install_kind: kind,
      update_available: true,
      updated: false,
      message,
    };
  }

  if (!opts.yes) {
    const message = `有可用更新：${current} → ${latest}（${kind}）。请加 --yes 确认安装`;
    logBrief(Boolean(opts.brief), message);
    return {
      ok: false,
      package: packageName(),
      current,
      latest,
      registry: latestInfo.registry,
      install_kind: kind,
      update_available: true,
      updated: false,
      message,
    };
  }

  if (kind === "local" && !detected.projectRoot) {
    return {
      ok: false,
      package: packageName(),
      current,
      latest,
      registry: latestInfo.registry,
      install_kind: kind,
      update_available: true,
      updated: false,
      message: "无法定位消费者项目根目录（node_modules 上级）",
    };
  }

  const installKind = kind as "global" | "local";
  logBrief(Boolean(opts.brief), `正在安装 ${packageName()}@${tag}（${installKind}）…`);
  const install = runNpmInstallPackage({
    kind: installKind,
    projectRoot: detected.projectRoot,
    tag,
  });

  if (!install.ok) {
    const message = `npm 安装失败：${install.stderr}`;
    logBrief(Boolean(opts.brief), message);
    return {
      ok: false,
      package: packageName(),
      current,
      latest,
      registry: latestInfo.registry,
      install_kind: kind,
      update_available: true,
      updated: false,
      message,
      command: install.command,
    };
  }

  const message = `已更新 ${packageName()}：${current} → ${latest}。请重新打开终端或再执行 agent-farm --version 确认。`;
  logBrief(Boolean(opts.brief), message);
  return {
    ok: true,
    package: packageName(),
    current,
    latest,
    registry: latestInfo.registry,
    install_kind: kind,
    update_available: true,
    updated: true,
    message,
    command: install.command,
  };
}
