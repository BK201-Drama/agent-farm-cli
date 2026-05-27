import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { ControlPlaneService } from "../../application/facades/control-plane.js";

const PANEL_CORE_PATH = join(dirname(fileURLToPath(import.meta.url)), "panel-core.js");

const FALLBACK_PANEL_CORE_JS = `(function(){var e=document.getElementById("err");function t(n){e.textContent=n,e.style.display="block"}function o(n,r){var c=document.getElementById(n);if(c){var s=document.createElement("span");s.textContent=" ("+r+")",c.appendChild(s)}}async function n(){try{var r=await fetch("/api/health").then(function(e){return e.json()});document.getElementById("health").textContent=r.env||""}catch(e){}}async function l(){try{var r=await fetch("/api/view").then(function(e){return e.json()});document.getElementById("ts").textContent=r.ts||"";var c=document.getElementById("summary");c.innerHTML="";var s=0;for(var a in r.summary||{}){var i=r.summary[a],d=document.createElement("span");d.className="badge badge-"+a,d.textContent=a+":"+i,c.appendChild(d),s+=i}document.getElementById("pipe-n")&&o("pipe-n",s);var u=document.getElementById("stuck-count"),p=(r.stuck||[]).length;u&&o("stuck-count",p);var f=document.getElementById("stuck");if(f){f.innerHTML="";if(p===0){var m=document.createElement("div");m.className="stuck-none",m.textContent="\\u2714 \\u65e0\\u5361\\u4f4f\\u4efb\\u52a1",f.appendChild(m)}for(var h=0;h<r.stuck.length&&h<50;h++){var g=r.stuck[h],v=document.createElement("div");v.className="stuck-card "+(g.severity||"");var y=document.createElement("div");y.textContent=g.task_id||"";var b=document.createElement("div");b.className="stuck-kind",b.textContent=(g.kind||"")+" \\u00b7 "+(g.age||"");var S=document.createElement("div");S.className="stuck-cmd",S.textContent=g.retry_hint||"";var w=document.createElement("div");w.className="stuck-actions",w.innerHTML='<button onclick="fetch(\\'/api/stuck/retry\\',{method:\\'POST\\',headers:{\\'content-type\\':\\'application/json\\'},body:JSON.stringify({task_id:\\''+g.task_id+"\\'})}).then(function(){return location.reload()})">retry</button> <button onclick=\"fetch('/api/stuck/recover',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({})}).then(function(){return location.reload()})\">recover all</button>";v.appendChild(y),v.appendChild(b),v.appendChild(S),v.appendChild(w),f.appendChild(v)}}var k=document.getElementById("pipeline");if(k){k.innerHTML="";for(var T=r.pipeline||[],E=0;E<T.length&&E<50;E++){var q=T[E],x=document.createElement("div");x.className="pipe-row";var _=document.createElement("span");_.textContent=(q.status||"")+" \\u00b7 "+(q.task_id||"")+" \\u00b7 "+(q.last_event_hint||""),x.appendChild(_),k.appendChild(x)}}}catch(e){t(String(e))}}document.getElementById("refresh").onclick=l,document.getElementById("dispatch").onclick=async function(){var e=document.getElementById("prompt").value.trim();if(!e)return;var r=document.getElementById("dispatch-result"),c=document.getElementById("err");c.style.display="none";try{var s=await fetch("/api/dispatch",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({prompt:e})}),a=await s.json();r.textContent=JSON.stringify(a,null,2),s.ok||t(JSON.stringify(a))}catch(i){t(String(i))}},document.getElementById("raw-toggle").onclick=function(){var e=document.getElementById("raw"),r=document.getElementById("raw-toggle");e.style.display=e.style.display==="none"?"block":"none",r.textContent=e.style.display==="none"?"\\u539f\\u59cb JSON \\u25b8":"\\u539f\\u59cb JSON \\u25b2"},l(),setInterval(l,8000),n()})();`;

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
  try {
    if (existsSync(PANEL_CORE_PATH)) {
      return readFileSync(PANEL_CORE_PATH, "utf8");
    }
  } catch {
    /* disk read failed, use fallback */
  }
  return FALLBACK_PANEL_CORE_JS;
}

function loadPanelHtml(): string {
  const overridePath = process.env.AGENT_FARM_CONTROL_PLANE_HTML?.trim();
  if (overridePath) {
    try {
      return readFileSync(overridePath, "utf8");
    } catch (err) {
      console.error(`[agent-farm] control-plane: cannot read AGENT_FARM_CONTROL_PLANE_HTML=${overridePath}: ${String(err)}`);
    }
  }
  return panelHtml();
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
        sendText(res, 200, loadPanelHtml(), "text/html; charset=utf-8");
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
