export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, 'BAD_REQUEST', message, details);

export const unauthorized = (message = 'Sign in to continue') =>
  new AppError(401, 'UNAUTHORIZED', message);

/**
 * Deliberately vague. Telling a caller "this project exists but you may not
 * see it" leaks the client list (§16 confidentiality), so authorization
 * failures on project-scoped records surface as notFound instead.
 */
export const forbidden = (message = 'You do not have access to this action') =>
  new AppError(403, 'FORBIDDEN', message);

export const notFound = (what = 'Record') => new AppError(404, 'NOT_FOUND', `${what} not found`);

export const conflict = (message: string, details?: unknown) =>
  new AppError(409, 'CONFLICT', message, details);

/** A gate refused: the action is understood and permitted, but its preconditions fail. */
export const gateFailed = (message: string, details?: unknown) =>
  new AppError(422, 'GATE_FAILED', message, details);
