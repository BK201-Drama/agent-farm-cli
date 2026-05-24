const fs = require("fs");
const path = require("path");
const os = require("os");

const projectsDir = path.join(os.homedir(), ".claude", "projects");

function collectJsonlFiles(dir, maxFiles) {
  const results = [];
  function walk(d) {
    if (results.length >= maxFiles) return;
    try {
      const entries = fs.readdirSync(d, { withFileTypes: true });
      for (const e of entries) {
        if (results.length >= maxFiles) return;
        const full = path.join(d, e.name);
        if (e.isDirectory() && e.name !== "subagents") {
          walk(full);
        } else if (e.isFile() && e.name.endsWith(".jsonl") && !full.includes("/subagents/")) {
          // Skip subagent transcripts
          results.push(full);
        }
      }
    } catch { /* skip */ }
  }
  walk(dir);
  return results;
}

function extractToolCalls(filePath) {
  const counts = {};
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.trim().split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        const d = JSON.parse(line);
        // Support both formats: message.content and direct content array
        const msg = d.message || d;
        if (!msg.content || !Array.isArray(msg.content)) continue;
        for (const block of msg.content) {
          if (block.type !== "tool_use") continue;
          const name = block.name;
          if (name === "Bash") {
            const cmd = (block.input?.command || "").trim();
            if (!cmd) continue;
            // Extract the command token (skip leading path, handle &&, |, ;)
            const tokens = cmd.replace(/^\s*["']?/, "").split(/\s+/);
            if (tokens.length === 0) continue;
            let cmdName = tokens[0].replace(/^.*\//, ""); // strip path
            // Handle common prefixes
            const prefixes = ["sudo", "timeout", "nice", "nohup", "env"];
            while (prefixes.includes(cmdName) && tokens.length > 1) {
              tokens.shift();
              cmdName = tokens[0].replace(/^.*\//, "");
            }
            // Get subcommand if available
            let sub = "";
            if (tokens.length > 1) {
              sub = tokens[1].replace(/^-+/, "").replace(/["';].*$/, "").slice(0, 20);
              // Skip flags like -C, --foo
              if (sub === "" || sub.match(/^[0-9]/)) sub = "";
            }
            const key = sub ? `${cmdName} ${sub}` : cmdName;
            counts[`Bash(${key})`] = (counts[`Bash(${key})`] || 0) + 1;
          } else {
            counts[name] = (counts[name] || 0) + 1;
          }
        }
      } catch { /* skip bad lines */ }
    }
  } catch { /* skip */ }
  return counts;
}

// Main
const files = collectJsonlFiles(projectsDir, 30);
// Sort by mtime
files.sort((a, b) => {
  try {
    return fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs;
  } catch { return 0; }
});

console.error(`Scanning ${files.length} transcript files...`);

const allCounts = {};
for (const f of files) {
  const c = extractToolCalls(f);
  for (const [k, v] of Object.entries(c)) {
    allCounts[k] = (allCounts[k] || 0) + v;
  }
}

// Sort by count desc
const sorted = Object.entries(allCounts).sort((a, b) => b[1] - a[1]);
for (const [k, v] of sorted) {
  console.log(`${v}\t${k}`);
}
