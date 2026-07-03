import { defineStore } from "pinia";
import type {
  SpotlightCommandAction,
  SpotlightCommandDomain,
  SpotlightCommandTarget,
} from "./types.js";

export const useSpotlightRuntimeStore = defineStore("spotlightRuntime", {
  state: () => ({
    activeDomain: null as SpotlightCommandDomain | null,
    activeTarget: null as SpotlightCommandTarget | null,
    activeAction: null as SpotlightCommandAction | null,
    resumableAction: null as SpotlightCommandAction | null,
    lastResolvedTarget: null as SpotlightCommandTarget | null,
  }),
  actions: {
    setActiveCommand(params: {
      domain: SpotlightCommandDomain;
      action: SpotlightCommandAction;
      target?: SpotlightCommandTarget | null;
      resumableAction?: SpotlightCommandAction | null;
    }) {
      this.activeDomain = params.domain;
      this.activeAction = params.action;
      this.activeTarget = params.target ?? null;
      this.resumableAction = params.resumableAction ?? null;
      if (params.target) {
        this.lastResolvedTarget = params.target;
      }
    },
    clearActiveCommand() {
      this.activeDomain = null;
      this.activeAction = null;
      this.activeTarget = null;
      this.resumableAction = null;
    },
    setLastResolvedTarget(target: SpotlightCommandTarget | null) {
      this.lastResolvedTarget = target;
    },
  },
});
