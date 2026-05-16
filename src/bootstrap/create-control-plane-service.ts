import { ControlPlaneService, type ControlPlanePaths } from "../application/facades/control-plane.js";
import type { ContainerPorts } from "./container-ports.js";

/** 控制面 / MCP / HTTP 面板统一入口（内部装配 createContainer）。 */
export function createControlPlaneService(
  cwd: string = process.cwd(),
  paths: ControlPlanePaths = {},
  portOverrides?: Partial<ContainerPorts>,
): ControlPlaneService {
  return new ControlPlaneService(cwd, paths, portOverrides);
}
