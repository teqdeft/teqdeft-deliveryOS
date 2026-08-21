import { z } from 'zod';

/**
 * Blueprint §7.3. A baseline is approved once and never edited. Every later
 * change produces version N+1 with an approver, a reason and an effective
 * date, and version N stays readable forever.
 */
export const proposeBaselineBody = z.object({
  title: z.string().min(3).max(200),
  /** Free-text summary of what this version changes relative to the previous one. */
  changeReason: z.string().max(2000).optional(),
  effectiveDate: z.coerce.date().optional(),
});
export type ProposeBaselineBody = z.infer<typeof proposeBaselineBody>;

export const approveBaselineBody = z.object({
  comment: z.string().max(2000).optional(),
  /**
   * Typing the project code is the deliberate friction on an irreversible act.
   * Checked server-side against the project.
   */
  confirmProjectCode: z.string().min(1),
});
export type ApproveBaselineBody = z.infer<typeof approveBaselineBody>;

export interface BaselineDiffEntry {
  requirementId: string;
  title: string;
  change: 'ADDED' | 'REMOVED' | 'MODIFIED' | 'UNCHANGED';
  fields?: string[];
}

export interface BaselineDiff {
  fromVersion: number | null;
  toVersion: number;
  entries: BaselineDiffEntry[];
  summary: { added: number; removed: number; modified: number; unchanged: number };
}
