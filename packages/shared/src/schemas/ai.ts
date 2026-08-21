import { z } from 'zod';
import { AI_JOB_TYPES, AI_PROVIDERS } from '../enums.js';

export const startAnalysisBody = z.object({
  /** Empty means every READY source on the project. */
  sourceIds: z.array(z.string().uuid()).max(100).default([]),
  jobType: z.enum(AI_JOB_TYPES).default('REQUIREMENT_EXTRACTION'),
  /** Overrides the configured model policy for this run; recorded on the AiRun. */
  provider: z.enum(AI_PROVIDERS).optional(),
  instructions: z.string().max(4000).optional(),
});
export type StartAnalysisBody = z.infer<typeof startAnalysisBody>;

export interface AiRunSummary {
  id: string;
  jobType: string;
  state: string;
  provider: string;
  model: string;
  promptVersion: string;
  schemaVersion: string;
  startedAt: string | null;
  finishedAt: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  producedCount: number;
  warnings: string[];
  error: string | null;
}

/** §8.4 — model policy is per job type, never one model hard-coded product-wide. */
export interface ModelPolicyEntry {
  jobType: string;
  provider: 'ANTHROPIC' | 'OPENAI';
  model: string;
  maxOutputTokens: number;
  /** Guard against a runaway document set; §19 "AI costs grow without value". */
  maxInputChars: number;
}
