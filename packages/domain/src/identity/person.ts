export type PersonClassification = "P2";
export type PersonStatus = "ACTIVE" | "INACTIVE" | "ANONYMIZED";

export interface Person {
  readonly id: string;
  readonly tenantId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly displayName: string;
  readonly birthDate: Date | null;
  readonly classification: PersonClassification;
  readonly status: PersonStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export function displayNameFor(firstName: string, lastName: string): string {
  return `${firstName.trim()} ${lastName.trim()}`.trim();
}

