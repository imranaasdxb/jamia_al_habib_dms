export interface UserRow {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  role: "ADMIN" | "STAFF" | "COLLECTOR";
  status: "PENDING" | "ACTIVE" | "INACTIVE" | "BLOCKED";
  accountCreated: boolean;
  language: "en" | "ur";
  age: number | null;
  gender: "UNSPECIFIED" | "MALE" | "FEMALE" | "OTHER";
  address: string;
  remarks: string;
  hasPhoto: boolean;
  updatedAt: string;
  verificationPending: boolean;
  verification: {
    personId: string; flowId: string; email: string; needsVerification: boolean; proofComplete: boolean;
  } | null;
}

export interface UsersPageData {
  users: UserRow[];
  total: number;
  page: number;
  pageSize: number;
}
