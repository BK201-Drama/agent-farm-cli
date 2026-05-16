import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { ControlPlaneService } from "../../application/facades/control-plane.js";

const PANEL_CORE_PATH = join(dirname(fileURLToPath(import.meta.url)), "panel-core.js");

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, code: number, body: unknown): void {
  res.writeHead(code, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body, null, 2));
}

function sendText(res: ServerResponse, code: number, body: string, contentType: string): void {
  res.writeHead(code, { "content-type": contentType });
  res.end(body);
}

async function parseJsonBody<T extends Record<string, unknown>>(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<T | undefined> {
  const raw = await readBody(req);
  try {
    return JSON.parse(raw || "{}") as T;
  } catch {
    sendJson(res, 400, { ok: false, error: "invalid JSON body" });
    return undefined;
  }
}

function panelHtml(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>agent-farm control plane</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 1rem; background: #0f1419; color: #e7ecf3; }
    h1 { font-size: 1.1rem; margin: 0 0 0.5rem; }
    h2 { font-size: 0.95rem; margin: 1.2rem 0 0.4rem; }
    .meta { color: #8b9cb3; font-size: 0.85rem; margin-bottom: 0.75rem; }
    pre { background: #1a2332; padding: 0.75rem; border-radius: 6px; overflow: auto; font-size: 0.8rem; white-space: pre-wrap; }
    button { background: #3b82f6; color: #fff; border: 0; padding: 0.4rem 0.8rem; border-radius: 4px; cursor: pointer; }
    button:hover { background: #2563eb; }
    button.secondary { background: transparent; color: #e7ecf3; border: 1px solid #334155; }
    textarea { width: 100%; box-sizing: border-box; margin: 0.25rem 0 0.5rem; padding: 0.4rem; border-radius: 4px; border: 1px solid #334155; background: #1a2332; color: #e7ecf3; }
    label { font-size: 0.85rem; color: #8b9cb3; }
    .badge { display: inline-block; padding: 0.15rem 0.45rem; border-radius: 3px; font-size: 0.78rem; margin: 0.15rem 0.25rem 0.15rem 0; }
    .badge-queued { background: #1e3a5f; color: #93c5fd; }
    .badge-claimed { background: #374151; color: #d1d5db; }
    .badge-running { background: #14532d; color: #86efac; }
    .badge-done { background: #1e293b; color: #64748b; }
    .badge-failed { background: #7f1d1d; color: #fca5a5; }
    .badge-retry { background: #713f12; color: #fde047; }
    .badge-review { background: #4a1d6b; color: #d8b4fe; }
    .badge-blocked { background: #3b0764; color: #a78bfa; }
    .badge-cancelled, .badge-rejected, .badge-approved { background: #1e293b; color: #64748b; }
    .stuck-card { background: #1a2332; border-left: 3px solid #fbbf24; padding: 0.5rem 0.75rem; border-radius: 4px; margin-bottom: 0.4rem; font-size: 0.82rem; }
    .stuck-card.high { border-left-color: #ef4444; }
    .stuck-card.medium { border-left-color: #f59e0b; }
    .stuck-kind { color: #8b9cb3; font-size: 0.7rem; }
    .stuck-cmd { color: #60a5fa; font-size: 0.75rem; font-family: monospace; }
    .stuck-actions { margin-top: 0.35rem; }
    .stuck-actions button { font-size: 0.72rem; padding: 0.2rem 0.5rem; margin-right: 0.35rem; }
    .stuck-none { color: #22c55e; font-size: 0.85rem; }
    .summary-line { margin-bottom: 0.5rem; }
    .pipe-row { cursor: pointer; padding: 3px 0; border-bottom: 1px solid #334155; font-size: 0.8rem; }
    .pipe-row span { color: #8b9cb3; }
    .raw-toggle { color: #3b82f6; cursor: pointer; font-size: 0.8rem; }
    #err { color: #f87171; white-space: pre-wrap; }
  </style>
</head>
<body>
  <h1>agent-farm · control plane</h1>
  <p class="meta"><span id="ts">—</span> <button type="button" id="refresh">刷新</button> <span style="font-size:0.7rem;color:#475569">8s auto</span></p>
  <div id="err" style="display:none"></div>
  <div id="health"></div>
  <div id="summary"></div>
  <h2>Stuck <span id="stuck-count"></span></h2>
  <div id="stuck">加载中…</div>
  <h2>管线 <span id="pipe-n"></span></h2>
  <div id="pipeline"></div>
  <h2>派活</h2>
  <label for="prompt">prompt</label>
  <textarea id="prompt" rows="3" placeholder="描述任务…"></textarea>
  <div style="margin-top:0.3rem"><button type="button" id="dispatch">入队</button></div>
  <pre id="dispatch-result"></pre>
  <h2><span class="raw-toggle" id="raw-toggle">原始 JSON ▸</span></h2>
  <pre id="raw" style="display:none">—</pre>
  <script src="/panel-core.js"></script>
  <script>initAgentFarmPanel({ apiBase: '', theme: 'http', pollMs: 8000 });</script>
</body>
</html>`;
}

function readPanelCoreJs(): string {
  return readFileSync(PANEL_CORE_PATH, "utf8");
}

export function startControlPlaneHttpServer(
  service: ControlPlaneService,
  port: number,
): ReturnType<typeof createServer> {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
    try {
      if (req.method === "GET" && url.pathname === "/panel-core.js") {
        sendText(res, 200, readPanelCoreJs(), "application/javascript; charset=utf-8");
        return;
      }
      if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
        sendText(res, 200, panelHtml(), "text/html; charset=utf-8");
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/health") {
        sendJson(res, 200, await service.buildHealth());
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/view") {
        sendJson(res, 200, await service.buildView());
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/dispatch") {
        const body = await parseJsonBody<{ prompt?: string; dedupe_key?: string }>(req, res);
        if (!body) return;
        const prompt = String(body.prompt ?? "").trim();
        if (!prompt) {
          sendJson(res, 400, { ok: false, error: "prompt required" });
          return;
        }
        sendJson(res, 200, await service.dispatchPrompt(prompt, body.dedupe_key));
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/stuck/retry") {
        const body = await parseJsonBody<{ task_id?: string; reason?: string }>(req, res);
        if (!body) return;
        const taskId = String(body.task_id ?? "").trim();
        if (!taskId) {
          sendJson(res, 400, { ok: false, error: "task_id required" });
          return;
        }
        const result = await service.stuckRetry(taskId, body.reason);
        sendJson(res, result.ok === true ? 200 : 400, result);
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/stuck/recover") {
        const body = await parseJsonBody<{ lease_timeout_seconds?: number }>(req, res);
        if (!body) return;
        const lease = body.lease_timeout_seconds ?? 1800;
        sendJson(res, 200, await service.stuckRecover(Number(lease)));
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/stuck/review-approve") {
        const body = await parseJsonBody<{ task_id?: string; reviewer?: string }>(req, res);
        if (!body) return;
        const taskId = String(body.task_id ?? "").trim();
        if (!taskId) {
          sendJson(res, 400, { ok: false, error: "task_id required" });
          return;
        }
        const result = await service.stuckReviewApprove(taskId, body.reviewer);
        sendJson(res, result.ok === true ? 200 : 400, result);
        return;
      }
      sendJson(res, 404, { ok: false, error: "not found" });
    } catch (e) {
      sendJson(res, 500, { ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });
  server.listen(port, "127.0.0.1");
  return server;
}
