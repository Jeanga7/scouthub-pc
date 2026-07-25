export class ApplicationError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number
  ) {
    super(message);
    this.name = "ApplicationError";
  }
}

export class NotFoundError extends ApplicationError {
  constructor(message = "Resource not found.") {
    super(message, "NOT_FOUND", 404);
  }
}

export class ConflictError extends ApplicationError {
  constructor(message = "Resource version conflict.") {
    super(message, "CONFLICT", 409);
  }
}

export class ValidationError extends ApplicationError {
  constructor(message: string, code = "VALIDATION_ERROR") {
    super(message, code, 400);
  }
}
