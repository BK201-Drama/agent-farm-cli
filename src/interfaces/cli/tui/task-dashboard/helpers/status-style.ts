export function statusColor(st: string):
  | "white"
  | "gray"
  | "green"
  | "yellow"
  | "cyan"
  | "magenta"
  | "red"
  | "blue" {
  switch (st) {
    case "running":
      return "green";
    case "claimed":
      return "yellow";
    case "review":
      return "cyan";
    case "approved":
      return "blue";
    case "queued":
    case "retry":
      return "gray";
    case "done":
      return "green";
    case "failed":
      return "red";
    case "blocked":
    case "cancelled":
      return "red";
    case "rejected":
      return "magenta";
    default:
      return "white";
  }
}
