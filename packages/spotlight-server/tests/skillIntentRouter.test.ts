import {
  enrichSkillToolRoute,
  extractMonitorTargetName,
  extractOpenTargetName,
  hasOpenTargetIntent,
  isSkillListQuery,
  type SkillRouteResult,
} from "../src/skillIntentRouter.js";

const monitoringSkill = {
  name: "skill.monitoring",
  description: "监控",
  allowedTools: [
    "getVideoInfo",
    "playVideoFullscreen",
    "openVideoMonitoring",
  ],
  responseStrategy: "tool_answer" as const,
};

const bimSkill = {
  name: "skill.bim",
  description: "BIM",
  allowedTools: ["getBimModelInfo", "openBimBuilding"],
  responseStrategy: "tool_answer" as const,
};

const clientTools = [
  {
    name: "getVideoInfo",
    version: "1.0.0",
    description: "列表",
    inputSchema: { type: "object" },
    sideEffect: "none" as const,
    replayPolicy: "safe" as const,
    riskLevel: "low" as const,
  },
  {
    name: "playVideoFullscreen",
    version: "1.0.0",
    description: "播放",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string" } },
    },
    sideEffect: "ui" as const,
    replayPolicy: "never" as const,
    riskLevel: "low" as const,
  },
  {
    name: "getBimModelInfo",
    version: "1.0.0",
    description: "BIM列表",
    inputSchema: { type: "object" },
    sideEffect: "none" as const,
    replayPolicy: "safe" as const,
    riskLevel: "low" as const,
  },
  {
    name: "openBimBuilding",
    version: "1.0.0",
    description: "打开BIM",
    inputSchema: {
      type: "object",
      properties: { target: { type: "string" } },
      required: ["target"],
    },
    sideEffect: "ui" as const,
    replayPolicy: "never" as const,
    riskLevel: "low" as const,
  },
];

describe("skill tool route enrichment", () => {
  it("extracts monitor and BIM target names", () => {
    expect(extractMonitorTargetName("查看昂州河河道水位监测")).toBe(
      "昂州河河道水位监测",
    );
    expect(extractOpenTargetName("看看泸定取水口")).toBe("泸定取水口");
  });

  it("routes named monitor view requests to playVideoFullscreen", () => {
    const route: SkillRouteResult = {
      route: "action",
      matchedSkillNames: ["skill.monitoring"],
      requestedToolNames: ["getVideoInfo"],
      confidence: 0.9,
      reason: "model picked list tool",
    };
    const enriched = enrichSkillToolRoute(
      "查看昂州河河道水位监测",
      route,
      [monitoringSkill],
      clientTools,
    );
    expect(enriched.requestedToolNames).toEqual(["playVideoFullscreen"]);
    expect(enriched.toolInput).toEqual({ name: "昂州河河道水位监测" });
  });

  it("routes named BIM view requests to openBimBuilding", () => {
    const route: SkillRouteResult = {
      route: "action",
      matchedSkillNames: ["skill.bim"],
      requestedToolNames: ["getBimModelInfo"],
      confidence: 0.9,
      reason: "model picked list tool",
    };
    const enriched = enrichSkillToolRoute(
      "看看泸定取水口",
      route,
      [bimSkill],
      clientTools,
    );
    expect(enriched.requestedToolNames).toEqual(["openBimBuilding"]);
    expect(enriched.toolInput).toEqual({ target: "泸定取水口" });
  });

  it("does not treat 看看泸定取水口 as monitoring play intent alone", () => {
    expect(hasOpenTargetIntent("看看泸定取水口")).toBe(true);
    const route: SkillRouteResult = {
      route: "action",
      matchedSkillNames: ["skill.bim"],
      requestedToolNames: [],
      confidence: 0.9,
      reason: "bim",
    };
    const enriched = enrichSkillToolRoute(
      "看看泸定取水口",
      route,
      [bimSkill, monitoringSkill],
      clientTools,
    );
    expect(enriched.requestedToolNames).toEqual(["openBimBuilding"]);
  });

  it("keeps list queries on read-only tools", () => {
    const route: SkillRouteResult = {
      route: "action",
      matchedSkillNames: ["skill.monitoring"],
      requestedToolNames: [],
      confidence: 0.9,
      reason: "list",
    };
    const enriched = enrichSkillToolRoute(
      "目前有哪些监控",
      route,
      [monitoringSkill],
      clientTools,
    );
    expect(enriched.requestedToolNames).toEqual(["getVideoInfo"]);
    expect(isSkillListQuery("目前有哪些模型")).toBe(true);
  });
});
