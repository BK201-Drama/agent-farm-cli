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
    h2 { font-size: 0.95rem; margin: 1.2rem 0 0.4rem; }
    .meta { color: #8b9cb3; font-size: 0.85rem; margin-bottom: 0.75rem; }
    pre { background: #1a2332; padding: 0.75rem; border-radius: 6px; overflow: auto; font-size: 0.8rem; white-space: pre-wrap; }
    button { background: #3b82f6; color: #fff; border: 0; padding: 0.4rem 0.8rem; border-radius: 4px; cursor: pointer; }
    button:hover { background: #2563eb; }
    input, textarea { width: 100%; box-sizing: border-box; margin: 0.25rem 0 0.5rem; padding: 0.4rem; border-radius: 4px; border: 1px solid #334155; background: #1a2332; color: #e7ecf3; }
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
    .badge-cancelled { background: #1e293b; color: #64748b; }
    .badge-rejected { background: #1e293b; color: #64748b; }
    .badge-approved { background: #1e293b; color: #64748b; }
    .stuck { color: #fbbf24; }
    .stuck-card { background: #1a2332; border-left: 3px solid #fbbf24; padding: 0.5rem 0.75rem; border-radius: 4px; margin-bottom: 0.4rem; font-size: 0.82rem; }
    .stuck-card.high { border-left-color: #ef4444; }
    .stuck-card.medium { border-left-color: #f59e0b; }
    .stuck-kind { color: #8b9cb3; font-size: 0.7rem; }
    .stuck-summary { margin: 0.15rem 0; }
    .stuck-cmd { color: #60a5fa; font-size: 0.75rem; font-family: monospace; }
    .stuck-none { color: #22c55e; font-size: 0.85rem; }
    .summary-line { margin-bottom: 0.5rem; }
    .raw-toggle { color: #3b82f6; cursor: pointer; font-size: 0.8rem; }
  </style>
</head>
<body>
  <h1>agent-farm · control plane</h1>
  <p class="meta"><span id="ts">—</span> &nbsp; <button type="button" id="refresh">刷新</button> &nbsp; <span style="font-size:0.7rem;color:#475569">8s auto</span></p>
  <div id="summary"></div>
  <h2>Stuck <span id="stuck-count"></span></h2>
  <div id="stuck">加载中…</div>
  <h2>派活</h2>
  <label for="prompt">prompt</label>
  <textarea id="prompt" rows="3" placeholder="描述任务…"></textarea>
  <div style="margin-top:0.3rem">
    <button type="button" id="dispatch">入队</button>
  </div>
  <pre id="dispatch-result"></pre>
  <h2><span class="raw-toggle" id="raw-toggle">原始 JSON ▸</span></h2>
  <pre id="raw" style="display:none">—</pre>
  <script>
    var STATUS_COLORS = {
      queued: 'badge-queued', claimed: 'badge-claimed', running: 'badge-running',
      done: 'badge-done', failed: 'badge-failed', retry: 'badge-retry',
      review: 'badge-review', blocked: 'badge-blocked', cancelled: 'badge-cancelled',
      rejected: 'badge-rejected', approved: 'badge-approved'
    };

    function renderSummary(j) {
      var sc = j.status?.status_counts || {};
      var entries = Object.entries(sc);
      var badges = entries.map(function(e) {
        var cls = STATUS_COLORS[e[0]] || 'badge-claimed';
        return '<span class="badge ' + cls + '">' + e[0] + ' × ' + e[1] + '</span>';
      });
      var total = j.status?.tasks_total ?? 0;
      var pipeline = j.board?.pipeline?.length ?? 0;
      var stuckN = j.stuck?.items?.length ?? 0;
      var stuckBadge = stuckN > 0 ? ' <span class="badge" style="background:#78350f;color:#fbbf24">⚠ stuck ' + stuckN + '</span>' : '';
      return '<p class="summary-line">总数 <strong>' + total + '</strong>'
        + ' · 管线 ' + pipeline
        + stuckBadge
        + '</p><p>' + (badges.length ? badges.join('') : '<span style="color:#64748b">—</span>') + '</p>';
    }

    function renderStuck(items) {
      if (!items || items.length === 0) {
        return '<p class="stuck-none">✓ 未发现需介入项</p>';
      }
      return items.map(function(item) {
        var sev = item.severity || 'medium';
        var kind = item.kind ? '<span class="stuck-kind">' + item.kind + '</span><br>' : '';
        var cmd = item.suggested_command ? '<div class="stuck-cmd">$ ' + item.suggested_command + '</div>' : '';
        return '<div class="stuck-card ' + sev + '">'
          + kind
          + '<div class="stuck-summary">' + item.summary + '</div>'
          + cmd
          + '</div>';
      }).join('');
    }

    async function load() {
      var r = await fetch('/api/view');
      var j = await r.json();
      document.getElementById('ts').textContent = j.generated_at || '';
      document.getElementById('summary').innerHTML = renderSummary(j);
      var items = j.stuck?.items || [];
      document.getElementById('stuck-count').textContent = items.length > 0 ? '(' + items.length + ')' : '';
      document.getElementById('stuck').innerHTML = renderStuck(items);
      document.getElementById('raw').textContent = JSON.stringify(j, null, 2);
    }

    document.getElementById('refresh').onclick = load;
    document.getElementById('dispatch').onclick = async function() {
      var prompt = document.getElementById('prompt').value.trim();
      if (!prompt) return;
      var r = await fetch('/api/dispatch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: prompt }),
      });
      document.getElementById('dispatch-result').textContent = await r.text();
      document.getElementById('prompt').value = '';
      await load();
    };
    document.getElementById('raw-toggle').onclick = function() {
      var el = document.getElementById('raw');
      var tog = document.getElementById('raw-toggle');
      if (el.style.display === 'none') {
        el.style.display = '';
        tog.textContent = '原始 JSON ▾';
      } else {
        el.style.display = 'none';
        tog.textContent = '原始 JSON ▸';
      }
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
