export class OrganizationDomainError extends Error {
  constructor(
    message: string,
    readonly code: string
  ) {
    super(message);
    this.name = "OrganizationDomainError";
  }
}

export function organizationInvariant(message: string, code: string): never {
  throw new OrganizationDomainError(message, code);
}
