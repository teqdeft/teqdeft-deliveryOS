import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, type TypeOf, type ZodTypeAny } from 'zod';
import { AppError } from './errors.js';
import { isProduction } from '../env.js';
import { logger } from './logger.js';

/** Wraps an async handler so a rejected promise reaches the error middleware. */
export const route =
  <T>(handler: (req: Request, res: Response) => Promise<T>): RequestHandler =>
  (req, res, next) => {
    handler(req, res).catch(next);
  };

/**
 * Generic over the schema rather than its type, so a field with `.default()`
 * comes back as the resolved output type instead of `T | undefined`.
 */
export function parseBody<S extends ZodTypeAny>(schema: S, body: unknown): TypeOf<S> {
  const result = schema.safeParse(body);
  if (!result.success) throw zodToAppError(result.error);
  return result.data;
}

export function parseQuery<S extends ZodTypeAny>(schema: S, query: unknown): TypeOf<S> {
  const result = schema.safeParse(query);
  if (!result.success) throw zodToAppError(result.error);
  return result.data;
}

function zodToAppError(error: ZodError): AppError {
  const details = error.issues.map((i) => ({
    field: i.path.join('.') || '(root)',
    message: i.message,
  }));
  const first = details[0];
  return new AppError(
    400,
    'VALIDATION_FAILED',
    first ? `${first.field}: ${first.message}` : 'Request validation failed',
    details,
  );
}

export function paginate<T>(items: T[], total: number, page: number, pageSize: number) {
  return {
    items,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No such endpoint' } });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  if (err instanceof ZodError) {
    const app = zodToAppError(err);
    res.status(app.status).json({ error: { code: app.code, message: app.message, details: app.details } });
    return;
  }

  logger.error({ err, path: req.path, method: req.method }, 'Unhandled error');

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      // Never leak a stack or a driver message to the client in production.
      message: isProduction ? 'Something went wrong on our side' : String(err),
    },
  });
}
