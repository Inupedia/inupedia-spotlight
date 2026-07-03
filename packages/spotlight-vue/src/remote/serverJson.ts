import { getSpotlightHttp } from "../plugin.js";

export async function postSpotlightJson<T>(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<T> {
  return getSpotlightHttp().postJson<T>(path, body, signal);
}

export async function getSpotlightJson<T>(
  path: string,
  signal?: AbortSignal,
): Promise<T> {
  return getSpotlightHttp().getJson<T>(path, signal);
}
