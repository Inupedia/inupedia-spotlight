import { describe, expect, it } from "vitest";
import {
  buildYuxiResumeInput,
  isYuxiInterruptStatus,
  parseYuxiInterrupt,
} from "../src/yuxiInterrupts.js";

describe("Yuxi interrupt resume payloads", () => {
  it("approves every pending tool action", () => {
    const interrupt = parseYuxiInterrupt("interrupt", {
      payload: {
        reason: "human_approval",
        chunk: {
          status: "human_approval_required",
          approval: {
            action_requests: [{ name: "write_file" }, { name: "execute" }],
          },
        },
      },
    });

    expect(interrupt?.kind).toBe("human_approval");
    expect(buildYuxiResumeInput(interrupt!)).toEqual({
      decisions: [{ type: "approve" }, { type: "approve" }],
    });
  });

  it("answers ask_user_question with the recommended option", () => {
    const interrupt = parseYuxiInterrupt("interrupt", {
      payload: {
        reason: "ask_user_question_required",
        chunk: {
          status: "ask_user_question_required",
          questions: [
            {
              question_id: "q1",
              question: "是否继续检索知识库？",
              options: [
                { label: "直接检索 (Recommended)", value: "search" },
                { label: "先问用户", value: "ask" },
              ],
            },
          ],
        },
      },
    });

    expect(interrupt?.kind).toBe("ask_user_question");
    expect(buildYuxiResumeInput(interrupt!)).toEqual({ q1: "search" });
  });

  it("treats interrupted run status as resumable", () => {
    expect(isYuxiInterruptStatus("interrupted")).toBe(true);
    expect(isYuxiInterruptStatus("ask_user_question_required")).toBe(true);
    expect(isYuxiInterruptStatus("completed")).toBe(false);
  });
});
