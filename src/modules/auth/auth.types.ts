export interface Account {
  id: string;
  fullName: string;
  email: string;
  role: "ADMIN" | "STAFF";
  language: "en" | "ur";
  hasPhoto?: boolean;
}

export interface AuthIdentity {
  id: string;
  email: string;
  emailVerified: boolean;
}

export class AuthFailure extends Error {
  constructor(public readonly code: string, public readonly status = 403) {
    super(code);
    this.name = "AuthFailure";
  }
}
