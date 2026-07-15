import { describe, expect, it } from "vitest";
import { canonicalArchivePathProblem } from "../src/node/capabilities/archivePath.js";

describe("canonical archive path oracle", () => {
  it.each(["C:/evil", "C:\\evil", "..\\evil", "/absolute", "a//b", "a/./b", "a/../b", "a\\b"])("rejects %s", (path) => {
    expect(canonicalArchivePathProblem(path)).toBeTruthy();
  });
  it("accepts canonical nested paths", () => expect(canonicalArchivePathProblem("skills/monitoring/references/a.json")).toBeUndefined());
});
