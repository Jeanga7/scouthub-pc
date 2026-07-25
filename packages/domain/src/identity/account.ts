export type AccountStatus =
  | "INVITED"
  | "ACTIVE"
  | "SUSPENDED"
  | "DISABLED"
  | "ANONYMIZED";

export interface Account {
  readonly id: string;
  readonly externalIdentityId: string | null;
  readonly primaryEmail: string;
  readonly status: AccountStatus;
  readonly lastLoginAt: Date | null;
  readonly emailVerifiedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export function isActiveAccount(account: Account): boolean {
  return account.status === "ACTIVE";
}

