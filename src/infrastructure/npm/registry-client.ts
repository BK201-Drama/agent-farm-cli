const DEFAULT_REGISTRY = "https://registry.npmjs.org";
const PACKAGE_NAME = "agent-farm-cli";

export type RegistryLatest = {
  name: string;
  version: string;
  registry: string;
};

export type FetchRegistryLatest = (name: string, registryBase: string) => Promise<RegistryLatest>;

function registryBaseUrl(): string {
  const fromEnv =
    process.env.AGENT_FARM_NPM_REGISTRY?.trim() || process.env.npm_config_registry?.trim() || DEFAULT_REGISTRY;
  return fromEnv.replace(/\/$/, "");
}

/** 查询 npm registry 上 `latest` 标签的版本（可注入 fetch 供测试）。 */
export async function fetchRegistryLatest(
  name = PACKAGE_NAME,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<RegistryLatest> {
  const registry = registryBaseUrl();
  const url = `${registry}/${encodeURIComponent(name)}/latest`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 15_000);
  try {
    const res = await fetchImpl(url, {
      signal: ac.signal,
      headers: { accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`registry HTTP ${res.status} for ${url}`);
    }
    const body = (await res.json()) as { version?: string };
    const version = typeof body.version === "string" ? body.version.trim() : "";
    if (!version) throw new Error(`registry response missing version: ${url}`);
    return { name, version, registry };
  } finally {
    clearTimeout(timer);
  }
}

export function packageName(): string {
  return PACKAGE_NAME;
}
