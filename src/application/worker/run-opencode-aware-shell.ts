/** @deprecated 实现已迁至 infrastructure/executors；保留 re-export 以免破坏内部 import 路径。 */
export {
  commandLooksLikeOpencodeRun,
  runShellWithOptionalOpencodeJsonStream,
  type OpencodeStreamObserver,
} from "../../infrastructure/executors/opencode-shell-runner.js";
