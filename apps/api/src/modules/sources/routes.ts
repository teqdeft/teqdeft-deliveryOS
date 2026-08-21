import { Router } from 'express';
import multer from 'multer';
import { createSourceBody } from '@deliveryos/shared';
import { prisma } from '../../db.js';
import { requireUser } from '../../lib/auth.js';
import { parseBody, route } from '../../lib/http.js';
import { requireCapability, requireProjectAccess } from '../../lib/rbac.js';
import { recordAudit } from '../../lib/audit.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { extractFragments } from './extract.js';
import { parseDocument } from './parse.js';
import { storeObject } from './storage.js';

export const sourcesRouter = Router();

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
});

sourcesRouter.get(
  '/:projectId/sources',
  route(async (req, res) => {
    const user = requireUser(req);
    const project = await requireProjectAccess(user, req.params.projectId);

    const sources = await prisma.source.findMany({
      where: { projectId: project.id },
      orderBy: [{ statedAt: 'desc' }],
      include: {
        uploadedBy: { select: { id: true, name: true, avatarColor: true } },
        _count: { select: { fragments: true } },
      },
    });

    res.json({ sources });
  }),
);

sourcesRouter.get(
  '/:projectId/sources/:sourceId',
  route(async (req, res) => {
    const user = requireUser(req);
    const project = await requireProjectAccess(user, req.params.projectId);

    const source = await prisma.source.findFirst({
      where: { id: req.params.sourceId, projectId: project.id },
      include: {
        uploadedBy: { select: { id: true, name: true, avatarColor: true } },
        fragments: { orderBy: { ordinal: 'asc' } },
      },
    });
    if (!source) throw notFound('Source');

    res.json({ source });
  }),
);

/**
 * Ingest a source. Accepts either an uploaded file or pasted text — transcripts
 * and client emails usually arrive as a paste, and forcing them through a file
 * upload is the kind of friction that pushes people back into their inbox.
 *
 * The whole ingest is one transaction: a source row without its fragments would
 * look ready to analyse while being uncitable.
 */
sourcesRouter.post(
  '/:projectId/sources',
  upload.single('file'),
  route(async (req, res) => {
    const user = requireUser(req);
    requireCapability(user, 'source.upload');
    const project = await requireProjectAccess(user, req.params.projectId);

    // Multipart bodies arrive as strings; JSON bodies do not.
    const raw = req.file ? { ...req.body } : req.body;
    const body = parseBody(createSourceBody, raw);

    // Only a PM or admin may declare how much a document is worth (§8.3).
    if (!hasAuthorityRight(user.role)) {
      requireCapability(user, 'source.setAuthority');
    }

    const file = req.file;
    if (!file && !body.inlineText?.trim()) {
      throw badRequest('Provide a file or paste the text of the source');
    }

    let text = body.inlineText?.trim() ?? '';
    let supported = true;
    let note: string | undefined;
    let stored: { storageKey: string; checksum: string; byteSize: number } | null = null;

    if (file) {
      stored = await storeObject(project.id, file.originalname, file.buffer);
      const parsed = await parseDocument(file.originalname, file.mimetype, file.buffer);
      supported = parsed.supported;
      note = parsed.note;
      if (parsed.text.trim()) text = parsed.text;
    }

    const fragments = supported && text ? extractFragments(text, body.kind) : [];

    const source = await prisma.$transaction(async (tx) => {
      const created = await tx.source.create({
        data: {
          projectId: project.id,
          title: body.title,
          kind: body.kind,
          authority: body.authority,
          confidentiality: body.confidentiality,
          statedAt: body.statedAt,
          notes: body.notes || null,
          originalFilename: file?.originalname ?? null,
          mimeType: file?.mimetype ?? (body.inlineText ? 'text/plain' : null),
          byteSize: stored?.byteSize ?? Buffer.byteLength(text, 'utf8'),
          storageKey: stored?.storageKey ?? null,
          checksum: stored?.checksum ?? null,
          uploadedById: user.id,
          extractedChars: text.length,
          processingState: !supported ? 'UNSUPPORTED' : fragments.length > 0 ? 'READY' : 'FAILED',
          processingError: !supported
            ? (note ?? 'Unsupported file type')
            : fragments.length === 0
              ? 'No citable text could be extracted from this source.'
              : null,
        },
      });

      if (fragments.length > 0) {
        await tx.sourceFragment.createMany({
          data: fragments.map((f) => ({
            sourceId: created.id,
            ordinal: f.ordinal,
            locator: f.locator,
            text: f.text,
            charStart: f.charStart,
            charEnd: f.charEnd,
          })),
        });
      }

      await recordAudit(
        {
          projectId: project.id,
          actorId: user.id,
          action: 'source.uploaded',
          entityType: 'Source',
          entityId: created.id,
          summary: `${user.name} added "${created.title}" (${created.authority}) with ${fragments.length} citable fragments`,
          detail: {
            kind: created.kind,
            authority: created.authority,
            confidentiality: created.confidentiality,
            filename: file?.originalname ?? null,
            checksum: stored?.checksum ?? null,
            fragments: fragments.length,
            processingState: created.processingState,
          },
          request: req,
        },
        tx,
      );

      return created;
    });

    res.status(201).json({ source, fragmentCount: fragments.length, note });
  }),
);

function hasAuthorityRight(role: string): boolean {
  return ['FOUNDER', 'DELIVERY_HEAD', 'PROJECT_MANAGER'].includes(role);
}
