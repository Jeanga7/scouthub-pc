export class ProjectDomainError extends Error {
  constructor(
    message: string,
    readonly code: string
  ) {
    super(message);
    this.name = "ProjectDomainError";
  }
}

