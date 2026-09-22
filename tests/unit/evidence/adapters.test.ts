import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  MAX_EVIDENCE_IMPORT_BYTES,
  EvidenceParseError,
  normalizeEvidenceFormat,
  parseEvidenceImport,
} from "@ai-native-qa-workbench/evidence";

const fixturesDirectory = new URL("../../fixtures/evidence/", import.meta.url);

async function fixtureBytes(name: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(new URL(name, fixturesDirectory)));
}

function context(format: string) {
  return {
    runId: "run-" + format + "-input",
    sourceFileName: "report." + format,
    importedAt: "2026-09-22T01:00:00Z",
  };
}

async function expectParseError(
  action: () => unknown | Promise<unknown>,
  code: string,
): Promise<void> {
  let errorCaught = false;
  try {
    await action();
  } catch (error) {
    errorCaught = true;
    expect(error).toBeInstanceOf(EvidenceParseError);
    expect((error as EvidenceParseError).code).toBe(code);
    expect((error as EvidenceParseError).path).toBeTruthy();
  }
  if (!errorCaught) throw new Error("Expected EvidenceParseError.");
}

describe("Evidence adapter registry", () => {
  it("normalizes only the supported CLI aliases", () => {
    expect(normalizeEvidenceFormat("junit")).toBe("junit");
    expect(normalizeEvidenceFormat("playwright")).toBe("playwright-json");
    expect(normalizeEvidenceFormat("pytest")).toBe("pytest-json");
    expect(normalizeEvidenceFormat("json")).toBeUndefined();
    expect(normalizeEvidenceFormat("playwright-json")).toBe("playwright-json");
  });

  it("preserves JUnit bytes, Unicode names, statuses, and rounded durations", async () => {
    const bytes = await fixtureBytes("junit-minimal.xml");
    const parsed = parseEvidenceImport("junit", bytes, context("junit"));

    expect(parsed.testRun).toEqual({
      id: "run-junit-input",
      format: "junit",
      status: "error",
      results: [
        { name: "通过-登录", status: "passed", durationMs: 123 },
        { name: "失败-支付", status: "failed", durationMs: 200 },
        { name: "错误-网络", status: "error" },
        { name: "跳过-短信", status: "skipped", durationMs: 0 },
      ],
    });
    expect(parsed.artifact).toMatchObject({
      sourceFileName: "report.junit",
      mediaType: "application/xml",
    });
    expect(parsed.artifact.bytes).toEqual(bytes);
  });

  it("returns an incomplete JUnit run for an empty suite", () => {
    const bytes = new TextEncoder().encode('<testsuite name="empty"></testsuite>');
    const parsed = parseEvidenceImport("junit", bytes, context("junit"));

    expect(parsed.testRun).toEqual({
      id: "run-junit-input",
      format: "junit",
      status: "incomplete",
      results: [],
    });
  });

  it("accepts an empty testsuites container as an incomplete run", () => {
    const bytes = new TextEncoder().encode("<testsuites></testsuites>");
    expect(parseEvidenceImport("junit", bytes, context("junit")).testRun.status).toBe("incomplete");
  });

  it("rejects malformed XML and external entities", async () => {
    await expectParseError(
      () => parseEvidenceImport("junit", new TextEncoder().encode("<testsuite>"), context("junit")),
      "EVIDENCE_REPORT_MALFORMED",
    );
    await expectParseError(
      async () =>
        parseEvidenceImport(
          "junit",
          await fixtureBytes("junit-external-entity.xml"),
          context("junit"),
        ),
      "EVIDENCE_REPORT_SECURITY_REJECTED",
    );
  });

  it("parses Playwright statuses, title fallback, and summed durations", async () => {
    const bytes = await fixtureBytes("playwright-minimal.json");
    const parsed = parseEvidenceImport("playwright-json", bytes, context("playwright-json"));

    expect(parsed.testRun.id).toBe("run-playwright-json-input");
    expect(parsed.testRun.format).toBe("playwright-json");
    expect(parsed.testRun.status).toBe("error");
    expect(parsed.testRun.results).toEqual([
      { name: "通过测试", status: "passed", durationMs: 10 },
      { name: "预期失败", status: "passed", durationMs: 10 },
      { name: "失败测试", status: "failed", durationMs: 11 },
      { name: "跳过测试", status: "skipped", durationMs: 0 },
      { name: "超时测试", status: "error", durationMs: 12 },
      { name: "中断测试", status: "error", durationMs: 13 },
      { name: "无状态测试", status: "unknown" },
      { name: "无结果测试", status: "unknown" },
      { name: "备用规格", status: "passed", durationMs: 1 },
    ]);
    expect(parsed.artifact.mediaType).toBe("application/json");
    expect(parsed.artifact.bytes).toEqual(bytes);
  });

  it("rejects missing Playwright core fields and malformed JSON", async () => {
    await expectParseError(
      () =>
        parseEvidenceImport(
          "playwright-json",
          new TextEncoder().encode(JSON.stringify({ suites: [{}] })),
          context("playwright-json"),
        ),
      "EVIDENCE_REPORT_FIELD_INVALID",
    );
    await expectParseError(
      () => parseEvidenceImport("playwright-json", new TextEncoder().encode("{"), context("x")),
      "EVIDENCE_REPORT_MALFORMED",
    );
  });

  it("parses Pytest outcomes and converts seconds to integer milliseconds", async () => {
    const bytes = await fixtureBytes("pytest-minimal.json");
    const parsed = parseEvidenceImport("pytest-json", bytes, context("pytest-json"));

    expect(parsed.testRun).toEqual({
      id: "run-pytest-json-input",
      format: "pytest-json",
      status: "error",
      results: [
        { name: "test_passed", status: "passed", durationMs: 125 },
        { name: "test_failed", status: "failed", durationMs: 0 },
        { name: "test_skipped", status: "skipped" },
        { name: "test_error", status: "error", durationMs: 250 },
        { name: "test_unknown", status: "unknown" },
      ],
    });
    expect(parsed.artifact.bytes).toEqual(bytes);
  });

  it("rejects unsupported non-empty Pytest outcomes and invalid durations", async () => {
    await expectParseError(
      () =>
        parseEvidenceImport(
          "pytest-json",
          new TextEncoder().encode(
            JSON.stringify({ tests: [{ nodeid: "test", outcome: "flaky" }] }),
          ),
          context("pytest-json"),
        ),
      "EVIDENCE_REPORT_FIELD_INVALID",
    );
    await expectParseError(
      () =>
        parseEvidenceImport(
          "pytest-json",
          new TextEncoder().encode(
            JSON.stringify({ tests: [{ nodeid: "test", outcome: "passed", duration: -1 }] }),
          ),
          context("pytest-json"),
        ),
      "EVIDENCE_REPORT_FIELD_INVALID",
    );
  });

  it("does not guess a format from a JSON file and rejects oversized input first", async () => {
    await expectParseError(
      () =>
        parseEvidenceImport(
          "junit",
          new TextEncoder().encode(JSON.stringify({ tests: [] })),
          context("junit"),
        ),
      "EVIDENCE_REPORT_MALFORMED",
    );
    await expectParseError(
      () =>
        parseEvidenceImport(
          "pytest-json",
          new Uint8Array(MAX_EVIDENCE_IMPORT_BYTES + 1),
          context("pytest-json"),
        ),
      "EVIDENCE_INPUT_TOO_LARGE",
    );
  });

  it("rejects an unsupported explicit format", async () => {
    await expectParseError(
      () =>
        parseEvidenceImport("unknown" as never, new TextEncoder().encode("{}"), context("unknown")),
      "EVIDENCE_FORMAT_UNSUPPORTED",
    );
  });
});
