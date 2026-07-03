import type { SpotlightSkill } from "@inupedia/spotlight-protocol";
import type { SpotlightClientConfig } from "@inupedia/spotlight-client";
import type { SpotlightConfig, SpotlightHostServicesRegistration } from "./config.js";

/** Single host registration entry: tools/services + skills pool. */
export type SpotlightHostRegistration = SpotlightHostServicesRegistration & {
  skills?: () => SpotlightSkill[];
  /** Host-provided operate domain executor (from defineSpotlightHost `operate`). */
  executeOperateWorkflow?: (
    ctx: import("./store/pipeline/types.js").SpotlightContext,
    api: import("./store/pipeline/types.js").HandlerApi,
  ) => Promise<void>;
};

export type SpotlightConfigInput = SpotlightClientConfig & {
  /** Preferred: one-shot host registration (tools, UI hooks, skills). */
  host?: () => SpotlightHostRegistration;
  /** @deprecated use `host` */
  services?: () => SpotlightHostServicesRegistration;
  /** @deprecated use `host` */
  skills?: () => SpotlightSkill[];
} & Partial<
    Omit<
      SpotlightConfig,
      keyof SpotlightClientConfig | "host" | "services" | "skills" | "tools"
    >
  > & {
    tools?: SpotlightConfig["tools"];
  };

export function resolveSpotlightConfig(input: SpotlightConfigInput): SpotlightConfig {
  const { host, services, skills, ...base } = input;
  const registered: SpotlightHostRegistration = host?.() ?? services?.() ?? {};
  const skillProvider = skills ?? registered.skills ?? base.getSkillsForRun;
  const resolved = {
    ...base,
    ...registered,
    getSkillsForRun: skillProvider,
    tools: registered.tools ?? base.tools,
    executeOperateWorkflow:
      registered.executeOperateWorkflow ?? base.executeOperateWorkflow,
  } as SpotlightConfig;
  return resolved;
}
