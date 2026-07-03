import { getSpotlightConfig, getSpotlightHttp } from "../plugin.js";

export function getSpotlightServerBase(): string {
  return getSpotlightHttp().getBase();
}

export function buildSpotlightJsonHeaders(): Record<string, string> {
  return getSpotlightHttp().jsonHeaders();
}

export function getSpotlightProjectId(): string {
  return getSpotlightConfig().projectId;
}

export function appendSpotlightProjectQuery(path: string): string {
  return getSpotlightHttp().appendProjectQuery(path);
}
