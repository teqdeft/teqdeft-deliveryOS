import type { Tx } from '../db.js';

/**
 * Human-facing ids (REQ-014, CR-003). Sequential per project rather than
 * global, because these end up in client emails and "REQ-14" reading as the
 * fourteenth requirement on *this* project is the whole point.
 *
 * Takes the next number inside the caller's transaction, so two concurrent
 * extractions cannot mint the same reference. The unique constraint on
 * (projectId, reference) is the backstop if they somehow do.
 */
export async function nextReference(
  tx: Tx,
  projectId: string,
  entity: 'requirement' | 'deliverable' | 'workItem' | 'changeRequest',
): Promise<string> {
  const prefixes = {
    requirement: 'REQ',
    deliverable: 'DEL',
    workItem: 'TSK',
    changeRequest: 'CR',
  } as const;
  const prefix = prefixes[entity];

  const count =
    entity === 'requirement'
      ? await tx.requirement.count({ where: { projectId } })
      : entity === 'deliverable'
        ? await tx.deliverable.count({ where: { projectId } })
        : entity === 'workItem'
          ? await tx.workItem.count({ where: { projectId } })
          : await tx.changeRequest.count({ where: { projectId } });

  return `${prefix}-${String(count + 1).padStart(3, '0')}`;
}

/** Allocates a contiguous block of references in one pass — used by bulk AI extraction. */
export async function nextReferenceBlock(
  tx: Tx,
  projectId: string,
  entity: 'requirement',
  count: number,
): Promise<string[]> {
  const existing = await tx.requirement.count({ where: { projectId } });
  return Array.from({ length: count }, (_, i) => `REQ-${String(existing + i + 1).padStart(3, '0')}`);
}
