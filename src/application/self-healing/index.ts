export { type ResolvedSelfHealingConfig, resolveSelfHealingConfig } from "./config.js";
export {
  type DegradationAction,
  nextDegradationAction,
  applyDegradationAction,
  isDegradationExhausted,
} from "./degradation.js";
export { type SelfHealingDeps, type SelfHealingResult, SelfHealingService } from "./service.js";
