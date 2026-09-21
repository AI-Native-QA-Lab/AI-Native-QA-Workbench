import type { ProjectLocale } from "@ai-native-qa-workbench/domain";

export interface ModelRequest {
  system?: string;
  prompt: string;
  outputLocale?: ProjectLocale;
}

export interface ModelResponse {
  text: string;
  finishReason?: string;
  done?: boolean;
  requiresApproval?: string;
}

export interface ModelProvider {
  generate(request: ModelRequest): Promise<ModelResponse>;
}
