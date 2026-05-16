import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { ControlPlaneService } from "../../application/facades/control-plane.js";

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
    .meta { color: #8b9cb3; font-size: 0.85rem; margin-bottom: 1rem; }
    pre { background: #1a2332; padding: 0.75rem; border-radius: 6px; overflow: auto; font-size: 0.8rem; }
    button { background: #3b82f6; color: #fff; border: 0; padding: 0.4rem 0.8rem; border-radius: 4px; cursor: pointer; }
    button:hover { background: #2563eb; }
    input, textarea { width: 100%; box-sizing: border-box; margin: 0.25rem 0 0.5rem; padding: 0.4rem; border-radius: 4px; border: 1px solid #334155; background: #1a2332; color: #e7ecf3; }
    .stuck { color: #fbbf24; }
    label { font-size: 0.85rem; color: #8b9cb3; }
  </style>
</head>
<body>
  <h1>agent-farm · control plane</h1>
  <p class="meta">M1 面板：队列快照 + stuck · <span id="ts">—</span> <button type="button" id="refresh">刷新</button></p>
  <div id="summary"></div>
  <h2 style="font-size:0.95rem">Stuck</h2>
  <pre id="stuck">加载中…</pre>
  <h2 style="font-size:0.95rem">派活</h2>
  <label for="prompt">prompt</label>
  <textarea id="prompt" rows="3" placeholder="描述任务…"></textarea>
  <button type="button" id="dispatch">入队</button>
  <pre id="dispatch-result"></pre>
  <h2 style="font-size:0.95rem">原始 JSON</h2>
  <pre id="raw">—</pre>
  <script>
    async function load() {
      const r = await fetch('/api/view');
      const j = await r.json();
      document.getElementById('ts').textContent = j.generated_at || '';
      const sc = j.status?.status_counts || {};
      const parts = Object.entries(sc).map(([k,v]) => k + '×' + v).join(' · ');
      const stuckN = j.stuck?.items?.length ?? 0;
      document.getElementById('summary').innerHTML =
        '<p>任务 ' + (j.status?.tasks_total ?? 0) + ' · 管线 ' + (j.board?.pipeline?.length ?? 0) +
        (stuckN ? ' · <span class="stuck">stuck ' + stuckN + '</span>' : '');
      document.getElementById('stuck').textContent = JSON.stringify(j.stuck, null, 2);
      document.getElementById('raw').textContent = JSON.stringify(j, null, 2);
    }
    document.getElementById('refresh').onclick = load;
    document.getElementById('dispatch').onclick = async () => {
      const prompt = document.getElementById('prompt').value.trim();
      if (!prompt) return;
      const r = await fetch('/api/dispatch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      document.getElementById('dispatch-result').textContent = await r.text();
      await load();
    };
    load();
    setInterval(load, 8000);
  </script>
</body>
</html>`;
}

export function startControlPlaneHttpServer(
  service: ControlPlaneService,
  port: number,
): ReturnType<typeof createServer> {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
    try {
      if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(panelHtml());
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/view") {
        sendJson(res, 200, await service.buildView());
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/dispatch") {
        const raw = await readBody(req);
        let body: { prompt?: string; dedupe_key?: string } = {};
        try {
          body = JSON.parse(raw || "{}") as typeof body;
        } catch {
          sendJson(res, 400, { ok: false, error: "invalid JSON body" });
          return;
        }
        const prompt = String(body.prompt ?? "").trim();
        if (!prompt) {
          sendJson(res, 400, { ok: false, error: "prompt required" });
          return;
        }
        sendJson(res, 200, await service.dispatchPrompt(prompt, body.dedupe_key));
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
