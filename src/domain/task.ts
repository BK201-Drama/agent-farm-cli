/**
 * 任务限界上下文对外入口：子模块见 `domain/task/`（model / transitions / enqueue / board）。
 * 应用层可继续 `import { TaskRecord } from "../domain/task.js"`，策略也可显式引用子路径。
 */
export * from "./task/model.js";
export * from "./task/transitions.js";
export * from "./task/enqueue.js";
export * from "./task/board.js";
