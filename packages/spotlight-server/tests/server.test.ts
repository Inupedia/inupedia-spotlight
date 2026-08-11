import { readFileSync } from "node:fs";
import type { RunManager } from "../src/runManager.js";
import { buildServer, SPOTLIGHT_SERVER_VERSION } from "../src/server.js";

describe("Spotlight Server metadata", () => {
  it("reports the package version from health and host tool metadata", async () => {
    const packageVersion = (
      JSON.parse(
        readFileSync(new URL("../package.json", import.meta.url), "utf8"),
      ) as { version: string }
    ).version;
    const app = await buildServer({
      runManager: {} as RunManager,
      projectId: "test-project",
    });

    try {
      const health = await app.inject({ method: "GET", url: "/health" });
      const hostTools = await app.inject({
        method: "GET",
        url: "/v1/meta/host-tools",
      });

      expect(SPOTLIGHT_SERVER_VERSION).toBe(packageVersion);
      expect(health.statusCode).toBe(200);
      expect(health.json()).toMatchObject({ version: packageVersion });
      expect(hostTools.statusCode).toBe(200);
      expect(hostTools.json()).toMatchObject({ version: packageVersion });
    } finally {
      await app.close();
    }
  });
});
