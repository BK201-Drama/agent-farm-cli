import type { Command } from "commander";
import { ControlPlaneService } from "../../../application/facades/control-plane.js";
import { startControlPlaneHttpServer } from "../../control-plane/http-server.js";

export function registerControlPlaneCommands(program: Command): void {
  const cp = program.command("control-plane").description("Cursor 控制面（HTTP 面板 + API）");

  cp
    .command("serve")
    .description("启动本机控制面 HTTP（默认 127.0.0.1:18765）")
    .option("--port <n>", "listen port", "18765")
    .action(async (opts) => {
      const port = Number(opts.port);
      const service = new ControlPlaneService(process.cwd());
      startControlPlaneHttpServer(service, port);
      process.stderr.write(
        `agent-farm control-plane: http://127.0.0.1:${port}/\n` +
          `api: GET /api/view · POST /api/dispatch\n`,
      );
    });
}
