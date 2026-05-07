export type DashboardTheme = "dark" | "light";

export function pipelineBorderColor(theme: DashboardTheme): "cyan" | "magenta" {
  return theme === "light" ? "magenta" : "cyan";
}

export function historyBorderColor(theme: DashboardTheme): "blue" | "gray" {
  return theme === "light" ? "gray" : "blue";
}
