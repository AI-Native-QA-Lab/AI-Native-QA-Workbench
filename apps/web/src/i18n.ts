export type UiLocale = "en" | "zh-CN";

const messages = {
  en: {
    brand: "AI-Native QA",
    title: "QA Workbench",
    subtitle: "Local-first quality intelligence",
    project: "Project",
    quality: "Quality snapshot",
    requirements: "Requirements",
    acceptanceCriteria: "Acceptance criteria",
    qualityRisks: "Quality risks",
    testObligations: "Test obligations",
    testCases: "Test cases",
    traceLinks: "Trace links",
    analyze: "Analyze requirement",
    requirementId: "Requirement ID",
    outputLocale: "AI output locale",
    proposalReview: "Proposal review",
    approve: "Approve proposal",
    reject: "Reject proposal",
    proposal: "Proposal",
    operations: "operations",
    reviewer: "Reviewer",
    status: "Status",
    chinese: "中文",
    english: "English",
    loading: "Loading…",
    failed: "Unable to load the workbench.",
  },
  "zh-CN": {
    brand: "AI-Native QA",
    title: "QA 工作台",
    subtitle: "Local-first 质量智能",
    project: "项目",
    quality: "质量快照",
    requirements: "需求",
    acceptanceCriteria: "验收标准",
    qualityRisks: "质量风险",
    testObligations: "测试义务",
    testCases: "测试用例",
    traceLinks: "追踪链接",
    analyze: "分析需求",
    requirementId: "需求 ID",
    outputLocale: "AI 输出语言",
    proposalReview: "Proposal 审查",
    approve: "批准 Proposal",
    reject: "拒绝 Proposal",
    proposal: "Proposal",
    operations: "操作",
    reviewer: "审查者",
    status: "状态",
    chinese: "中文",
    english: "English",
    loading: "加载中…",
    failed: "无法加载工作台。",
  },
} as const;

export type MessageKey = keyof (typeof messages)["en"];

export function translate(locale: UiLocale, key: MessageKey): string {
  return messages[locale][key];
}

export function readStoredUiLocale(): UiLocale {
  if (typeof window === "undefined") return "en";
  return window.localStorage.getItem("qaw.uiLocale") === "zh-CN" ? "zh-CN" : "en";
}

export function storeUiLocale(locale: UiLocale): void {
  if (typeof window !== "undefined") window.localStorage.setItem("qaw.uiLocale", locale);
}
