import Fastify, { type FastifyInstance } from "fastify";

import {
  createMockRequirementAnalysisProvider,
  createModelRequirementAnalysisProvider,
  QualityTaskLoop,
  type ChangeProposal,
  type HumanReview,
  type RequirementAnalysisProvider,
} from "@ai-native-qa-workbench/application";
import { OpenAICompatibleProvider } from "@ai-native-qa-workbench/model-providers";
import { FileProjectStore, type ProjectStore } from "@ai-native-qa-workbench/project-store";

export interface ServerOptions {
  rootDirectory: string;
  store?: ProjectStore;
  provider?: RequirementAnalysisProvider;
}

export async function buildServer(options: ServerOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const store = options.store ?? new FileProjectStore();
  const loop = new QualityTaskLoop({
    store,
    provider: options.provider ?? providerFromEnvironment(),
  });
  const proposals = new Map<string, ChangeProposal>();

  app.get("/health", async () => ({ status: "ok" }));

  app.get("/api/project", async (_request, reply) => {
    const result = await store.validateProject(options.rootDirectory);
    return reply.code(result.valid ? 200 : 422).send(result);
  });

  app.get("/api/quality", async (_request, reply) => {
    const result = await store.readQuality(options.rootDirectory);
    return reply.code(result.valid ? 200 : 422).send({
      valid: result.valid,
      quality: result.projectQuality,
      revision: result.revision,
      diagnostics: result.diagnostics,
    });
  });

  app.post<{ Body: { requirementId?: string; outputLocale?: "en" | "zh-CN" } }>(
    "/api/analysis",
    async (request, reply) => {
      if (!request.body?.requirementId) {
        return reply.code(400).send({ error: "requirementId is required" });
      }
      try {
        const result = await loop.propose({
          rootDirectory: options.rootDirectory,
          requirementId: request.body.requirementId,
          outputLocale: request.body.outputLocale ?? "en",
        });
        proposals.set(result.proposal.id, result.proposal);
        return reply.code(result.phase === "blocked" ? 422 : 200).send(result);
      } catch (error) {
        return reply
          .code(400)
          .send({ error: error instanceof Error ? error.message : String(error) });
      }
    },
  );

  app.post<{
    Params: { id: string };
    Body: {
      reviewer?: string;
      decision?: HumanReview["decision"];
      approvedOperationIndexes?: number[];
    };
  }>("/api/proposals/:id/decision", async (request, reply) => {
    const proposal = proposals.get(request.params.id);
    if (!proposal) return reply.code(404).send({ error: "Proposal not found" });
    if (!request.body?.reviewer || !request.body.decision) {
      return reply.code(400).send({ error: "reviewer and decision are required" });
    }
    try {
      const result = await loop.decide({
        rootDirectory: options.rootDirectory,
        proposal,
        reviewer: request.body.reviewer,
        decision: request.body.decision,
        ...(request.body.approvedOperationIndexes
          ? { approvedOperationIndexes: request.body.approvedOperationIndexes }
          : {}),
      });
      proposals.set(result.proposal.id, result.proposal);
      return reply.code(result.phase === "blocked" ? 409 : 200).send(result);
    } catch (error) {
      return reply
        .code(400)
        .send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  return app;
}

function providerFromEnvironment(): RequirementAnalysisProvider {
  const baseUrl = process.env.QAW_MODEL_BASE_URL;
  const model = process.env.QAW_MODEL;
  if (baseUrl && model) {
    return createModelRequirementAnalysisProvider(
      new OpenAICompatibleProvider({
        baseUrl,
        model,
        ...(process.env.QAW_MODEL_API_KEY ? { apiKey: process.env.QAW_MODEL_API_KEY } : {}),
      }),
    );
  }
  return createMockRequirementAnalysisProvider();
}
