import { SaxesParser, type SaxesTagPlain } from "saxes";

import type { TestResult } from "@ai-native-qa-workbench/domain";

import {
  createParsedImport,
  createValidatedTestRun,
  decodeEvidenceInput,
  type EvidenceAdapter,
  type EvidenceParseContext,
  type ParsedEvidenceImport,
} from "./contracts.js";
import { EvidenceParseError } from "./errors.js";

interface TestCaseFrame {
  name: string;
  durationMs?: number;
  statusNodes: string[];
}

function attribute(tag: SaxesTagPlain, name: string): string | undefined {
  return tag.attributes[name];
}

function durationMs(value: string | undefined, path: string): number | undefined {
  if (value === undefined) return undefined;
  if (value.trim() === "") {
    throw new EvidenceParseError(
      "EVIDENCE_REPORT_FIELD_INVALID",
      path,
      "Duration must be a non-negative number of seconds.",
    );
  }

  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new EvidenceParseError(
      "EVIDENCE_REPORT_FIELD_INVALID",
      path,
      "Duration must be a non-negative number of seconds.",
    );
  }
  return Math.round(seconds * 1000);
}

function parseJunit(input: Uint8Array, context: EvidenceParseContext): ParsedEvidenceImport {
  const xml = decodeEvidenceInput(input);
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml)) {
    throw new EvidenceParseError(
      "EVIDENCE_REPORT_SECURITY_REJECTED",
      "xml.doctype",
      "JUnit external entities and DOCTYPE declarations are not supported.",
    );
  }

  const results: TestResult[] = [];
  const elementStack: string[] = [];
  const testCaseFrames: TestCaseFrame[] = [];
  let rootName: string | undefined;

  try {
    const parser = new SaxesParser({ xmlns: false });
    parser.on("doctype", () => {
      throw new EvidenceParseError(
        "EVIDENCE_REPORT_SECURITY_REJECTED",
        "xml.doctype",
        "JUnit external entities and DOCTYPE declarations are not supported.",
      );
    });
    parser.on("opentag", (tag) => {
      const name = tag.name;
      if (rootName === undefined) rootName = name;

      const parent = elementStack[elementStack.length - 1];
      elementStack.push(name);

      if (name === "testsuite") {
        durationMs(attribute(tag, "time"), "testsuite.time");
      }

      if (name === "testcase") {
        const caseName = attribute(tag, "name");
        if (caseName === undefined || caseName.trim() === "") {
          throw new EvidenceParseError(
            "EVIDENCE_REPORT_FIELD_INVALID",
            "testcase.name",
            "JUnit testcase name must not be empty.",
          );
        }
        const frame: TestCaseFrame = {
          name: caseName,
          statusNodes: [],
        };
        const caseDuration = durationMs(attribute(tag, "time"), "testcase.time");
        if (caseDuration !== undefined) frame.durationMs = caseDuration;
        testCaseFrames.push(frame);
      }

      const current = testCaseFrames[testCaseFrames.length - 1];
      if (
        current &&
        parent === "testcase" &&
        (name === "failure" || name === "error" || name === "skipped")
      ) {
        current.statusNodes.push(name);
        if (current.statusNodes.length > 1) {
          throw new EvidenceParseError(
            "EVIDENCE_REPORT_FIELD_INVALID",
            "testcase",
            "JUnit testcase contains conflicting status nodes.",
          );
        }
      }
    });
    parser.on("closetag", (tag) => {
      if (tag.name === "testcase") {
        const frame = testCaseFrames.pop();
        if (!frame) {
          throw new EvidenceParseError(
            "EVIDENCE_REPORT_MALFORMED",
            "testcase",
            "JUnit testcase close tag is unexpected.",
          );
        }
        const statusNode = frame.statusNodes[0];
        const result: TestResult = {
          name: frame.name,
          status:
            statusNode === "failure"
              ? "failed"
              : statusNode === "error"
                ? "error"
                : statusNode === "skipped"
                  ? "skipped"
                  : "passed",
        };
        if (frame.durationMs !== undefined) result.durationMs = frame.durationMs;
        results.push(result);
      }
      elementStack.pop();
    });
    parser.on("error", (error) => {
      throw error;
    });
    parser.write(xml).close();
  } catch (error) {
    if (error instanceof EvidenceParseError) throw error;
    throw new EvidenceParseError(
      "EVIDENCE_REPORT_MALFORMED",
      "xml",
      error instanceof Error ? error.message : "JUnit XML is malformed.",
    );
  }

  if (rootName !== "testsuite" && rootName !== "testsuites") {
    throw new EvidenceParseError(
      "EVIDENCE_REPORT_FIELD_INVALID",
      "xml.root",
      "JUnit root must be testsuite or testsuites.",
    );
  }
  const testRun = createValidatedTestRun("junit", results, context);
  return createParsedImport(input, context, testRun, "application/xml");
}

export function createJunitEvidenceAdapter(): EvidenceAdapter {
  return {
    format: "junit",
    parse(input, context) {
      return parseJunit(input, context);
    },
  };
}
