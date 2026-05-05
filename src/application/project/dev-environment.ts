export const DEV_ENVIRONMENTS = ["cursor", "claude", "codex"] as const;
export type DevEnvironment = (typeof DEV_ENVIRONMENTS)[number];
