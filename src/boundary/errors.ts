export class BoundaryError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "BoundaryError";
  }
}

export function unauthorized(message = "Sign in to continue."): BoundaryError {
  return new BoundaryError(message, 401, "UNAUTHORIZED");
}

export function forbidden(
  message = "This plan is outside your workspace.",
): BoundaryError {
  return new BoundaryError(message, 403, "FORBIDDEN");
}

export function conflict(message: string): BoundaryError {
  return new BoundaryError(message, 409, "CONFLICT");
}

export function invalid(message: string): BoundaryError {
  return new BoundaryError(message, 400, "INVALID");
}
