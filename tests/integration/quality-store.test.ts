import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  applyApprovedProposal,
  createProposal,
  reviewProposal,
} from "@ai-native-qa-workbench/application";
import {
  FileProjectStore,
  QUALITY_FILE_RELATIVE_PATH,
} from "@ai-native-qa-workbench/project-store";
import { QUALITY_SCHEMA_VERSION, type QualitySnapshot } from "@ai-native-qa-workbench/domain";

const temporaryDirectories: string[] = [];

function emptySnapshot(): QualitySnapshot {
  return {
    schemaVersion: QUALITY_SCHEMA_VERSION,
    requirements: [],
    acceptanceCriteria: [],
    qualityRisks: [],
    testObligations: [],
    testCases: [],
    traceLinks: [],
  };
}

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "qaw-quality-store-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("FileProjectStore quality boundary", () => {
  it("initializes, reads, validates, and atomically writes quality YAML with a revision", async () => {
    const directory = await createTemporaryDirectory();
    const store = new FileProjectStore();

    const initialized = await store.initProject({ rootDirectory: directory });
    const initial = await store.readQuality(directory);

    expect(initialized.created).toBe(true);
    expect(initial.valid).toBe(true);
    expect(initial.projectQuality).toEqual(emptySnapshot());
    expect(initial.revision).toMatch(/^[a-f0-9]{64}$/);

    const written = await store.writeQuality(directory, {
      ...emptySnapshot(),
      requirements: [{ id: "checkout", title: "Checkout", description: "Checkout flow" }],
    });
    const after = await store.validateQuality(directory);
    const files = await readdir(join(directory, ".ai-qa"));

    expect(written).toMatchObject({
      written: true,
      qualityPath: join(directory, QUALITY_FILE_RELATIVE_PATH),
    });
    expect(written.revision).toMatch(/^[a-f0-9]{64}$/);
    expect(after.valid).toBe(true);
    expect(after.revision).toBe(written.revision);
    expect(files.some((file) => file.endsWith(".tmp"))).toBe(false);
    await expect(readFile(join(directory, QUALITY_FILE_RELATIVE_PATH), "utf8")).resolves.toContain(
      "id: checkout",
    );
  });

  it("returns a missing-file diagnostic without touching project data", async () => {
    const directory = await createTemporaryDirectory();
    const store = new FileProjectStore();

    await store.initProject({ rootDirectory: directory });
    await rm(join(directory, QUALITY_FILE_RELATIVE_PATH));
    const result = await store.readQuality(directory);

    expect(result).toMatchObject({
      valid: false,
      diagnostics: [{ code: "QUALITY_FILE_MISSING", path: QUALITY_FILE_RELATIVE_PATH }],
    });
    await expect(readFile(join(directory, ".ai-qa", "project.yaml"), "utf8")).resolves.toContain(
      'schemaVersion: "0.1"',
    );
  });

  it("rejects an invalid snapshot before creating a temporary file", async () => {
    const directory = await createTemporaryDirectory();
    const store = new FileProjectStore();
    await store.initProject({ rootDirectory: directory });

    const result = await store.writeQuality(directory, {
      ...emptySnapshot(),
      requirements: "not-an-array",
    } as unknown as QualitySnapshot);

    expect(result.written).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "QUALITY_REQUIREMENTS_NOT_ARRAY" }),
    );
    expect((await readdir(join(directory, ".ai-qa"))).some((file) => file.endsWith(".tmp"))).toBe(
      false,
    );
  });

  it("writes only after explicit human approval and rejects a stale base revision", async () => {
    const directory = await createTemporaryDirectory();
    const store = new FileProjectStore();
    await store.initProject({ rootDirectory: directory });
    const seeded = {
      ...emptySnapshot(),
      requirements: [{ id: "checkout", title: "Checkout", description: "Checkout flow" }],
    };
    const seedWrite = await store.writeQuality(directory, seeded);
    const before = await store.readQuality(directory);
    const proposal = createProposal(
      seeded,
      [
        {
          kind: "create",
          entityType: "qualityRisk",
          entity: { id: "checkout-risk", requirementId: "checkout", statement: "Rounding risk" },
        },
      ],
      seedWrite.revision ?? "",
    );

    const notApproved = await applyApprovedProposal(store, directory, proposal);
    expect(notApproved.applied).toBe(false);
    expect(notApproved.diagnostics).toContainEqual(
      expect.objectContaining({ code: "PROPOSAL_NOT_APPROVED" }),
    );
    expect((await store.readQuality(directory)).revision).toBe(before.revision);

    const approved = await applyApprovedProposal(
      store,
      directory,
      reviewProposal(proposal, { reviewer: "nao", decision: "approve" }),
    );
    expect(approved.applied).toBe(true);
    expect(approved.snapshot?.qualityRisks).toHaveLength(1);

    const stale = await applyApprovedProposal(
      store,
      directory,
      reviewProposal(proposal, { reviewer: "nao", decision: "approve" }),
    );
    expect(stale.applied).toBe(false);
    expect(stale.diagnostics).toContainEqual(
      expect.objectContaining({ code: "PROPOSAL_BASE_REVISION_STALE" }),
    );
  });
});
