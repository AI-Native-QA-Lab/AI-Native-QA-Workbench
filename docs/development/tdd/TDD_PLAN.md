# TDD 开发规范

## 默认循环

`Contract → Behavior → RED → GREEN → REFACTOR → Architecture Check → Regression → Docs`

## 分层策略

-   Domain: Strict TDD
-   Application: TDD
-   Project Store: File Contract + integration TDD
-   Agent Runtime: state-machine TDD
-   QA Task Loop: Completion Contract TDD
-   Tool Runtime: contract-driven TDD
-   Model Provider: contract-driven TDD
-   UI: behavior/component tests
-   Golden Path: E2E

## 核心规则

-   Core CI 不调用真实 LLM。
-   MockProvider 是一等测试组件。
-   测试表达业务行为，不锁死实现细节。
-   Architecture invariants 必须有 fitness tests。
-   line coverage 不是唯一目标，重点是
    invariant、contract、state-transition coverage。

## 每个 Issue 的开发顺序

1.  Context
2.  Expected Behavior
3.  Acceptance Criteria
4.  Domain/Contract Impact
5.  RED tests
6.  Minimal implementation
7.  GREEN
8.  Refactor
9.  Regression
10. i18n/docs update
