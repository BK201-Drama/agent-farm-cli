/* Shared control-plane panel logic (HTTP + VS Code sidebar). */
(function (global) {
  const STATUS_CLASS = {
    running: "running",
    failed: "failed",
    retry: "failed",
    queued: "queued",
    claimed: "queued",
    blocked: "stuck",
  };

  const STATUS_COLORS_HTTP = {
    queued: "badge-queued",
    claimed: "badge-claimed",
    running: "badge-running",
    done: "badge-done",
    failed: "badge-failed",
    retry: "badge-retry",
    review: "badge-review",
    blocked: "badge-blocked",
    cancelled: "badge-cancelled",
    rejected: "badge-rejected",
    approved: "badge-approved",
  };

  function apiUrl(apiBase, path) {
    return (apiBase || "").replace(/\/$/, "") + path;
  }

  function showErr(el, msg) {
    if (!el) return;
    if (!msg) {
      el.style.display = "none";
      el.textContent = "";
      return;
    }
    el.style.display = "block";
    el.textContent = msg;
  }

  function renderHealth(healthEl, health, theme) {
    if (!healthEl || !health) return;
    const hint = health.worker_hint || "none";
    const detail = health.worker_hint_detail || "";
    const cls =
      hint === "active" ? "health-ok" : hint === "idle" ? "health-warn" : hint === "stalled" ? "health-bad" : "health-muted";
    if (theme === "http") {
      const color =
        hint === "active" ? "#86efac" : hint === "idle" ? "#fbbf24" : hint === "stalled" ? "#f87171" : "#64748b";
      healthEl.innerHTML =
        '<p class="summary-line" style="color:' + color + '">worker: <strong>' + hint + "</strong> · " + detail + "</p>";
    } else {
      healthEl.innerHTML = '<p class="health-line ' + cls + '">worker: <strong>' + hint + "</strong> · " + detail + "</p>";
    }
  }

  function renderSummary(summaryEl, badgesEl, j, theme) {
    if (!summaryEl) return;
    const total = j.status?.tasks_total ?? 0;
    const pipe = j.board?.pipeline?.length ?? 0;
    const stuckN = j.stuck?.items?.length ?? 0;
    if (theme === "http") {
      const sc = j.status?.status_counts || {};
      const badges = Object.entries(sc).map(function (e) {
        const cls = STATUS_COLORS_HTTP[e[0]] || "badge-claimed";
        return '<span class="badge ' + cls + '">' + e[0] + " × " + e[1] + "</span>";
      });
      const stuckBadge =
        stuckN > 0 ? ' <span class="badge" style="background:#78350f;color:#fbbf24">⚠ stuck ' + stuckN + "</span>" : "";
      summaryEl.innerHTML =
        '<p class="summary-line">总数 <strong>' +
        total +
        "</strong> · 管线 " +
        pipe +
        stuckBadge +
        '</p><p class="badges">' +
        (badges.length ? badges.join("") : '<span style="color:#64748b">—</span>') +
        "</p>";
    } else {
      summaryEl.textContent = "任务 " + total + " · 管线 " + pipe + (stuckN ? " · ⚠ stuck " + stuckN : "");
      if (badgesEl) {
        const entries = Object.entries(j.status?.status_counts || {});
        badgesEl.innerHTML = entries.length
          ? entries
              .map(function (e) {
                return '<span class="badge ' + (STATUS_CLASS[e[0]] || "") + '">' + e[0] + " " + e[1] + "</span>";
              })
              .join("")
          : '<span class="muted">无任务</span>';
      }
    }
  }

  function renderPipeline(pipelineEl, pipeNEl, items) {
    if (!pipelineEl) return;
    if (pipeNEl) pipeNEl.textContent = items?.length ? "(" + items.length + ")" : "";
    if (!items?.length) {
      pipelineEl.innerHTML = '<div class="stuck-none">—</div>';
      return;
    }
    pipelineEl.innerHTML = items
      .slice(0, 12)
      .map(function (t) {
        const id = t.task_id || "?";
        const st = t.status || "?";
        const pr = (t.prompt || "").slice(0, 48);
        const full = encodeURIComponent(String(t.prompt || ""));
        return (
          '<div class="pipe-row" data-task-id="' +
          id +
          '" data-task-prompt="' +
          full +
          '" title="点击操作">' +
          "<strong>" +
          st +
          "</strong> " +
          id +
          "<br><span>" +
          pr +
          "</span></div>"
        );
      })
      .join("");
  }

  function stuckActionsHtml(item) {
    if (item.suggested_action === "retry" && item.task_id) {
      return '<div class="stuck-actions"><button type="button" data-stuck-retry="' + item.task_id + '">Retry</button></div>';
    }
    if (item.suggested_action === "recover_stale") {
      return '<div class="stuck-actions"><button type="button" data-stuck-recover="1">Recover</button></div>';
    }
    if (item.suggested_action === "review" && item.task_id) {
      return '<div class="stuck-actions"><button type="button" data-stuck-review="' + item.task_id + '">Approve review</button></div>';
    }
    if (item.suggested_command) {
      return (
        '<div class="stuck-actions"><button type="button" class="secondary" data-copy-cmd="' +
        encodeURIComponent(item.suggested_command) +
        '">复制命令</button></div>'
      );
    }
    return "";
  }

  function renderStuck(stuckEl, stuckNEl, items, theme) {
    if (!stuckEl) return;
    if (stuckNEl) stuckNEl.textContent = items?.length ? "(" + items.length + ")" : "";
    if (!items?.length) {
      stuckEl.innerHTML =
        theme === "http" ? '<p class="stuck-none">✓ 未发现需介入项</p>' : '<p class="stuck-none">✓ 无 stuck</p>';
      return;
    }
    stuckEl.innerHTML = items
      .map(function (item) {
        const sev = item.severity || "medium";
        const kind = theme === "http" && item.kind ? '<span class="stuck-kind">' + item.kind + "</span><br>" : "";
        const cmd = item.suggested_command
          ? theme === "http"
            ? '<div class="stuck-cmd">$ ' + item.suggested_command + "</div>"
            : '<div class="stuck-cmd">' + item.suggested_command + "</div>"
          : "";
        return (
          '<div class="stuck-card ' +
          sev +
          '">' +
          kind +
          '<div class="stuck-summary">' +
          (item.summary || "") +
          "</div>" +
          cmd +
          stuckActionsHtml(item) +
          "</div>"
        );
      })
      .join("");
  }

  function initAgentFarmPanel(opts) {
    const apiBase = opts.apiBase || "";
    const theme = opts.theme || "sidebar";
    const bridge = opts.bridge || {};
    const pollMs = opts.pollMs ?? 8000;

    const errEl = document.getElementById("err");
    const summaryEl = document.getElementById("summary");
    const badgesEl = document.getElementById("badges");
    const healthEl = document.getElementById("health");
    const pipelineEl = document.getElementById("pipeline");
    const pipeNEl = document.getElementById("pipe-n");
    const stuckEl = document.getElementById("stuck");
    const stuckNEl = document.getElementById("stuck-n");
    const rawEl = document.getElementById("raw");
    const dispatchResultEl = document.getElementById("dispatch-result");

    let pollTimer = null;
    let polling = true;

    function setPolling(on) {
      polling = on;
      if (!on && pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      } else if (on && !pollTimer) {
        pollTimer = setInterval(function () {
          load();
        }, pollMs);
      }
    }

    async function stuckApi(path, body) {
      const r = await fetch(apiUrl(apiBase, path), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body || {}),
      });
      const text = await r.text();
      if (!r.ok) showErr(errEl || dispatchResultEl, text);
      else {
        showErr(errEl, "");
        if (dispatchResultEl) dispatchResultEl.textContent = text;
        await load();
      }
    }

    async function load() {
      if (!polling) return;
      showErr(errEl, "");
      try {
        const r = await fetch(apiUrl(apiBase, "/api/view"));
        if (!r.ok) throw new Error("HTTP " + r.status);
        const j = await r.json();
        if (j.health?.service !== "agent-farm-control-plane") {
          throw new Error("端口上的服务不是 agent-farm control-plane");
        }
        const tsEl = document.getElementById("ts");
        if (tsEl) tsEl.textContent = (j.generated_at || "").slice(11, 19) + "Z";
        renderHealth(healthEl, j.health, theme);
        renderSummary(summaryEl, badgesEl, j, theme);
        renderPipeline(pipelineEl, pipeNEl, j.board?.pipeline);
        renderStuck(stuckEl, stuckNEl, j.stuck?.items, theme);
        if (rawEl) rawEl.textContent = JSON.stringify(j, null, 2);
        if (bridge.onView) bridge.onView(j);
      } catch (e) {
        showErr(errEl, String(e.message || e));
        if (bridge.onError) bridge.onError(e);
        if (bridge.ensureServer) bridge.ensureServer();
      }
    }

    const refreshBtn = document.getElementById("refresh");
    if (refreshBtn) {
      refreshBtn.onclick = function () {
        if (bridge.onRefresh) bridge.onRefresh();
        load();
      };
    }

    const dispatchBtn = document.getElementById("dispatch");
    if (dispatchBtn) {
      dispatchBtn.onclick = async function () {
        const promptEl = document.getElementById("prompt");
        const prompt = (promptEl?.value || "").trim();
        if (!prompt) return;
        try {
          const r = await fetch(apiUrl(apiBase, "/api/dispatch"), {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ prompt: prompt }),
          });
          const text = await r.text();
          if (!r.ok) showErr(errEl, text);
          else {
            if (promptEl) promptEl.value = "";
            if (dispatchResultEl) dispatchResultEl.textContent = text;
            await load();
          }
        } catch (e) {
          showErr(errEl, String(e.message || e));
        }
      };
    }

    if (stuckEl) {
      stuckEl.addEventListener("click", function (ev) {
        const t = ev.target;
        if (!t || !t.getAttribute) return;
        const retryId = t.getAttribute("data-stuck-retry");
        if (retryId) {
          ev.preventDefault();
          stuckApi("/api/stuck/retry", { task_id: retryId });
          return;
        }
        if (t.getAttribute("data-stuck-recover")) {
          ev.preventDefault();
          stuckApi("/api/stuck/recover", {});
          return;
        }
        const reviewId = t.getAttribute("data-stuck-review");
        if (reviewId) {
          ev.preventDefault();
          stuckApi("/api/stuck/review-approve", { task_id: reviewId });
          return;
        }
        const cmd = t.getAttribute("data-copy-cmd");
        if (cmd && bridge.copyText) {
          ev.preventDefault();
          bridge.copyText(decodeURIComponent(cmd));
        }
      });
    }

    if (pipelineEl) {
      pipelineEl.addEventListener("click", function (ev) {
        const row = ev.target.closest("[data-task-id]");
        if (!row) return;
        const id = row.getAttribute("data-task-id");
        const pr = row.getAttribute("data-task-prompt");
        if (bridge.onTaskClick) {
          bridge.onTaskClick({ task_id: id, prompt: pr ? decodeURIComponent(pr) : "" });
        } else if (bridge.copyText && id) {
          bridge.copyText(id);
        }
      });
    }

    const rawToggle = document.getElementById("raw-toggle");
    if (rawToggle && rawEl) {
      rawToggle.onclick = function () {
        if (rawEl.style.display === "none") {
          rawEl.style.display = "";
          rawToggle.textContent = "原始 JSON ▾";
        } else {
          rawEl.style.display = "none";
          rawToggle.textContent = "原始 JSON ▸";
        }
      };
    }

    window.addEventListener("message", function (ev) {
      if (ev.data?.type === "reload") load();
      if (ev.data?.type === "setPolling") setPolling(!!ev.data.enabled);
    });

    load();
    setPolling(true);

    return { load: load, setPolling: setPolling };
  }

  global.initAgentFarmPanel = initAgentFarmPanel;
})(typeof window !== "undefined" ? window : globalThis);
