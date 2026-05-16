# embed-minimal（M2）

在 Node 脚本中嵌入 `ControlPlaneService`，不启动 HTTP。

## 前提

在 **agent-farm-cli 仓库根** 已 `npm run build`，且当前目录含 `.agent-farm/queue`。

## 运行

```bash
# 仓库根
node examples/embed-minimal/run.mjs
```

## 代码要点

```js
import { ControlPlaneService } from "agent-farm-cli/core";

const svc = new ControlPlaneService(process.cwd());
const view = await svc.buildView();
console.log(view.health, view.stuck.items.length);
```

发布到 npm 后：`import { ControlPlaneService } from "agent-farm-cli/core"`（见根 `package.json` exports）。
