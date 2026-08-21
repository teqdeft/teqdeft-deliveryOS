import type { Db } from '../db/index.js';

/**
 * Human-facing ids (REQ-014, CR-003). Sequential per project rather than
 * global, because these end up in client emails and "REQ-14" reading as the
 * fourteenth requirement on *this* project is the whole point.
 *
 * Takes the next number inside the caller's transaction, so two concurrent
 * extractions cannot mint the same reference. The unique constraint on
 * (projectId, reference) is the backstop if they somehow do.
 */
const PREFIXES = {
  requirement: { table: 'Requirement', prefix: 'REQ' },
  deliverable: { table: 'Deliverable', prefix: 'DEL' },
  workItem: { table: 'WorkItem', prefix: 'TSK' },
  changeRequest: { table: 'ChangeRequest', prefix: 'CR' },
} as const;

export type ReferenceEntity = keyof typeof PREFIXES;

async function countFor(db: Db, entity: ReferenceEntity, projectId: string): Promise<number> {
  const { table } = PREFIXES[entity];
  const row = (await db(table).where({ projectId }).count({ n: '*' }).first()) as
    | { n: number | string }
    | undefined;
  return Number(row?.n ?? 0);
}

export async function nextReference(
  db: Db,
  projectId: string,
  entity: ReferenceEntity,
): Promise<string> {
  const count = await countFor(db, entity, projectId);
  return `${PREFIXES[entity].prefix}-${String(count + 1).padStart(3, '0')}`;
}

/** Allocates a contiguous block of references in one pass — used by bulk AI extraction. */
export async function nextReferenceBlock(
  db: Db,
  projectId: string,
  entity: ReferenceEntity,
  count: number,
): Promise<string[]> {
  const existing = await countFor(db, entity, projectId);
  const { prefix } = PREFIXES[entity];
  return Array.from({ length: count }, (_, i) => `${prefix}-${String(existing + i + 1).padStart(3, '0')}`);
}
