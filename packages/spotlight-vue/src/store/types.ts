/**
 * Spotlight 相关类型、枚举与配置
 */

import type { ToolTraceEvent } from "@inupedia/spotlight-protocol";

export interface AgentStep {
  id: string;
  label: string;
  status: "pending" | "active" | "done" | "error";
  content?: string;
  attachments?: AgentStepAttachment[];
  files?: AgentStepFile[];
  artifacts?: SpotlightArtifact[];
  toolCalls?: AgentStepToolCall[];
  chatItems?: AgentStepChatItem[];
}

export interface AgentStepAttachment {
  id: string;
  type: "image" | "file" | "html";
  name?: string;
  url: string;
  mimeType?: string;
}

export interface AgentStepFile {
  id: string;
  path: string;
  name: string;
  content?: string[];
  createdAt?: string;
  modifiedAt?: string;
}

export type SpotlightArtifactKind =
  | "table"
  | "html"
  | "image"
  | "json"
  | "text";

export interface SpotlightArtifactTablePayload {
  columns: string[];
  rows: Array<Record<string, unknown>>;
}

export interface SpotlightArtifact {
  id: string;
  kind: SpotlightArtifactKind;
  title: string;
  sourceToolCallId?: string;
  sourceToolName?: string;
  summary?: string;
  payload:
    | SpotlightArtifactTablePayload
    | { html: string }
    | { url: string }
    | { value: unknown }
    | { text: string };
}

export interface AgentStepToolCall {
  id: string;
  name: string;
  displayName?: string;
  argsText?: string;
  resultText?: string;
  summary?: string;
  errorCode?: string;
  trace?: ToolTraceEvent[];
  status: "pending" | "running" | "done" | "error";
}

/** 具体 id 由宿主 skill pack（video-channels.json）定义 */
export type SpotlightVideoChannelId = string;

export type AgentStepChatItem =
  | {
      id: string;
      type: "text";
      text: string;
    }
  | {
      id: string;
      type: "tool";
      toolCall: AgentStepToolCall;
    };

export enum SpotlightCommandDomain {
  Navigate = "navigate",
  Operate = "operate",
  SessionControl = "session_control",
  Fallback = "fallback",
}

export enum SpotlightCommandScope {
  Global = "global",
  CurrentContext = "current_context",
  ExplicitTarget = "explicit_target",
}

export type SpotlightCommandAction = string;

export type SpotlightCommandTarget = string;

export interface SpotlightCommand {
  domain: SpotlightCommandDomain;
  action: SpotlightCommandAction;
  target?: SpotlightCommandTarget;
  videoChannelId?: SpotlightVideoChannelId;
  scope: SpotlightCommandScope;
  requiresContext: boolean;
  reason: string;
}

/** 意图枚举：后续可在此扩展（如车辆位置、安全管理等） */
export enum SpotlightIntent {
  /** 查看施工进度 */
  Progress = "progress",
  /** 查看地质情况 */
  Geology = "geology",
  /** 查看投资情况（如引大 2 号支洞投资） */
  Investment = "investment",
  /** 查看工程质量情况（如引大 2 号支洞质量） */
  Quality = "quality",
  /** 查看安全情况（如引大 2 号支洞安全） */
  Safety = "safety",
  /** 控制二郎山二号支洞内部观察与人物巡检步行 */
  TunnelWander = "tunnel_wander",
  /** 其他（未匹配到具体功能） */
  Other = "other",
}

/** 意图对应的中文标签，用于展示；新增意图时在此补充 */
export const SPOTLIGHT_INTENT_LABELS: Record<SpotlightIntent, string> = {
  [SpotlightIntent.Progress]: "查看施工进度",
  [SpotlightIntent.Geology]: "查看地质情况",
  [SpotlightIntent.Investment]: "查看投资情况",
  [SpotlightIntent.Quality]: "查看质量情况",
  [SpotlightIntent.Safety]: "查看安全情况",
  [SpotlightIntent.TunnelWander]: "控制二郎山二号支洞漫游",
  [SpotlightIntent.Other]: "其他",
};

/**
 * Progress 意图下的子任务枚举：用于区分「打开面板」「要完整报告」「打开模拟进度」等不同操作。
 * 后续可扩展：累计进尺、今日掘进、某断面进度、对比分析等。
 */
export enum ProgressSubIntent {
  /** 仅打开施工进度面板/入口 */
  OpenPanel = "open_panel",
  /** 打开模拟进度面板/入口 */
  OpenSimulationPanel = "open_simulation_panel",
  /** 打开施工进度面板并生成完整数据分析报告 */
  FullReport = "full_report",
  /** 打开模拟进度面板并生成完整数据分析报告 */
  FullReportSimulation = "full_report_simulation",
}

/** Progress 子意图的中文标签；新增子任务时在此补充 */
export const PROGRESS_SUB_INTENT_LABELS: Record<ProgressSubIntent, string> = {
  [ProgressSubIntent.OpenPanel]: "打开进度面板",
  [ProgressSubIntent.OpenSimulationPanel]: "打开模拟进度面板",
  [ProgressSubIntent.FullReport]: "完整进度报告（施工）",
  [ProgressSubIntent.FullReportSimulation]: "完整进度报告（模拟）",
};

/**
 * Investment 意图下的子任务：区分具体项目或未指定。
 * 由 LLM 判断，避免用正则误判（如「二号洞投资」公司名）。
 */
export enum InvestmentSubIntent {
  /** 用户明确问的是本项目「引大 2 号支洞」的投资数据 */
  Yinda2Zhidong = "yinda_2_zhidong",
  /** 仅泛泛问投资、未指明项目，或无法对应到已知项目 */
  Unspecified = "unspecified",
}

export const INVESTMENT_SUB_INTENT_LABELS: Record<InvestmentSubIntent, string> =
  {
    [InvestmentSubIntent.Yinda2Zhidong]: "引大 2 号支洞投资数据",
    [InvestmentSubIntent.Unspecified]: "未指定项目",
  };

/**
 * Quality 意图下的子任务：目前仅区分引大 2 号支洞 / 未指定。
 */
export enum QualitySubIntent {
  /** 用户明确问的是本项目「引大 2 号支洞」的质量情况 */
  Yinda2Zhidong = "yinda_2_zhidong",
  /** 仅泛泛问质量、未指明项目，或无法对应到已知项目 */
  Unspecified = "unspecified",
}

export const QUALITY_SUB_INTENT_LABELS: Record<QualitySubIntent, string> = {
  [QualitySubIntent.Yinda2Zhidong]: "引大 2 号支洞质量情况",
  [QualitySubIntent.Unspecified]: "未指定项目",
};

/**
 * Safety 意图下的子任务：目前仅区分引大 2 号支洞 / 未指定。
 */
export enum SafetySubIntent {
  /** 用户明确问的是本项目「引大 2 号支洞」的安全情况 */
  Yinda2Zhidong = "yinda_2_zhidong",
  /** 仅泛泛问安全、未指明项目，或无法对应到已知项目 */
  Unspecified = "unspecified",
}

export const SAFETY_SUB_INTENT_LABELS: Record<SafetySubIntent, string> = {
  [SafetySubIntent.Yinda2Zhidong]: "引大 2 号支洞安全情况",
  [SafetySubIntent.Unspecified]: "未指定项目",
};

/**
 * TunnelWander 意图下的子任务：进入洞内观察态、开始/暂停/继续/结束巡检，以及地点不明确时的消歧提示。
 */
export enum TunnelWanderSubIntent {
  EnterView = "enter_view",
  StartWalk = "start_walk",
  PauseWalk = "pause_walk",
  ResumeWalk = "resume_walk",
  StopWalk = "stop_walk",
  AmbiguousEnter = "ambiguous_enter",
  MissingContext = "missing_context",
}

export const TUNNEL_WANDER_SUB_INTENT_LABELS: Record<
  TunnelWanderSubIntent,
  string
> = {
  [TunnelWanderSubIntent.EnterView]: "进入二郎山二号支洞内部观察态",
  [TunnelWanderSubIntent.StartWalk]: "开始洞内巡检步行",
  [TunnelWanderSubIntent.PauseWalk]: "暂停洞内巡检步行",
  [TunnelWanderSubIntent.ResumeWalk]: "继续洞内巡检步行",
  [TunnelWanderSubIntent.StopWalk]: "结束洞内巡检步行",
  [TunnelWanderSubIntent.AmbiguousEnter]:
    "地点不明确，要求补全为二郎山二号支洞",
  [TunnelWanderSubIntent.MissingContext]:
    "未进入二郎山二号支洞，无法执行洞内短命令",
};

/**
 * 子任务配置：仅需在此维护「枚举、展示名、何时选」。
 * 新增意图子任务时：加 enum + labels，在此补一条 + IntentWithReason 补一个可选字段即可；
 * schema 与 system/user 提示词均由 intent 模块从此配置生成，无需改长提示词。
 */
export type SubIntentConfig = {
  enum: readonly string[];
  labels: Record<string, string>;
  /** 给 LLM 的简短说明：何时选哪个子任务（会拼进 system prompt） */
  promptHint: string;
};

export const SUB_INTENT_CONFIG: Partial<
  Record<SpotlightIntent, SubIntentConfig>
> = {
  [SpotlightIntent.Progress]: {
    enum: Object.values(ProgressSubIntent),
    labels: PROGRESS_SUB_INTENT_LABELS as Record<string, string>,
    promptHint:
      "用户说「查看面板」「打开面板」「看看进度」「打开施工进度」等仅打开页面、且未提「模拟/仿真」时，用 open_panel；用户明确说「只打开模拟进度面板」时用 open_simulation_panel；用户问「查看项目进度」「施工进度怎么样」「当前进尺多少」「今日掘进」「给个进度报告」等要施工/项目进度的数据或报告时，用 full_report（打开施工进度并生成报告）；用户明确问「模拟进度报告」「仿真进度怎么样」「查看模拟进度」等要模拟进度的数据或报告时，用 full_report_simulation。",
  },
  [SpotlightIntent.Investment]: {
    enum: Object.values(InvestmentSubIntent),
    labels: INVESTMENT_SUB_INTENT_LABELS as Record<string, string>,
    promptHint:
      "investment 仅指本项目（隧道/支洞）的工程投资数据（金额、完成比例等）。用户明确问「引大2号支洞」「2号支洞」投资情况、投资金额、完成比例等时，用 yinda_2_zhidong；用户只泛泛说「投资」未指明哪个项目时，用 unspecified。若用户问的是公司名（如「二号洞投资」公司）、投资理财等非工程投资，应判 intent 为 other，不填 investmentSubIntent。",
  },
  [SpotlightIntent.Quality]: {
    enum: Object.values(QualitySubIntent),
    labels: QUALITY_SUB_INTENT_LABELS as Record<string, string>,
    promptHint:
      "quality 仅指本项目（隧道/支洞）的工程质量情况。用户明确问「引大2号支洞质量情况」「2号支洞质量好不好」等时，用 yinda_2_zhidong；用户只泛泛说「质量」未指明哪个项目时，用 unspecified。若用户问的是某家「质量检测公司」等与工程质量无关的企业，应判 intent 为 other。",
  },
  [SpotlightIntent.Safety]: {
    enum: Object.values(SafetySubIntent),
    labels: SAFETY_SUB_INTENT_LABELS as Record<string, string>,
    promptHint:
      "safety 仅指本项目（隧道/支洞）的安全情况与安全管理数据。用户明确问「引大2号支洞安全情况」「2号支洞危险源情况」等时，用 yinda_2_zhidong；用户只泛泛说「安全」未指明哪个项目时，用 unspecified。若用户问的是安全培训机构、安全保险产品等与工程安全无直接关系的内容，应判 intent 为 other。",
  },
  [SpotlightIntent.TunnelWander]: {
    enum: Object.values(TunnelWanderSubIntent),
    labels: TUNNEL_WANDER_SUB_INTENT_LABELS as Record<string, string>,
    promptHint:
      "tunnel_wander 仅指二郎山二号支洞内部观察与人物巡检步行控制。请结合“当前场景状态”一起判断。用户明确说全“二郎山二号支洞”，并表达“进去看看、进入内部、打开内部场景”等时，用 enter_view；若只说“二号支洞”“二郎山支洞”等地点不完整但明显想进洞时，用 ambiguous_enter；只有当前场景状态明确显示已经在二郎山二号支洞内部时，用户说“往里面走走、巡检、漫游”等短命令才用 start_walk，说“停一下、暂停、先停”时用 pause_walk，说“继续、接着走、继续往前”时用 resume_walk，说“结束漫游、停止行走、停止巡检”时用 stop_walk；如果当前场景状态没有显示已经在二郎山二号支洞内部，但用户只说“往里面走走、停一下、继续、结束漫游”等短命令，则用 missing_context。",
  },
  // [SpotlightIntent.Geology]: { enum: Object.values(GeologySubIntent), labels: GEOLOGY_SUB_INTENT_LABELS, promptHint: "..." },
};

/** 意图识别返回结构；带子任务的意图在对应 xxxSubIntent 字段填值 */
export interface IntentWithReason {
  intent: SpotlightIntent;
  reason: string;
  progressSubIntent?: ProgressSubIntent;
  investmentSubIntent?: InvestmentSubIntent;
  qualitySubIntent?: QualitySubIntent;
  safetySubIntent?: SafetySubIntent;
  tunnel_wanderSubIntent?: TunnelWanderSubIntent;
  geologySubIntent?: string; // 后续改为 GeologySubIntent
}
