/** 项目初始化时的文件与 SQLite 脚手架（由基础设施实现，用例只依赖本端口） */
export type ProjectInitGateway = {
  mkdirRecursive(path: string): Promise<void>;
  fileExists(path: string): Promise<boolean>;
  writeUtf8File(path: string, content: string): Promise<void>;
  trySetExecutable(path: string, mode: number): Promise<void>;
  warmSqliteSchema(dbFile: string): Promise<void>;
  buildDispatchScript(opts: { workers: number; commandTemplate?: string }): string;
};
