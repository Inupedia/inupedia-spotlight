import type { SpotlightAgentIocOptions } from "./spotlightAgentIoc.js";

import "./capabilityVirtualModuleTypes.js";

export type { SpotlightAgentIocOptions };

export { spotlightCapabilities } from "./spotlightCapabilities.js";
export type {
  CapabilityBuildInfoV1,
  CapabilityPluginBuildResultV1,
  SpotlightCapabilitiesOptionsV1,
  SpotlightCapabilityProjectBuildV1,
} from "./capabilityBuildTypes.js";
export {
  RESOLVED_SPOTLIGHT_CAPABILITIES_MODULE_ID,
  SPOTLIGHT_CAPABILITIES_MODULE_ID,
} from "./capabilityVirtualModule.js";

export {
  transformSpotlightAgentIoc,
  default,
} from "./spotlightAgentIoc.js";
