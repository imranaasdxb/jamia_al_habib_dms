import { z } from "zod";

const status = z.enum(["ACTIVE", "EXPIRED", "CLOSED", "REVOKED", "NOT_STARTED"]);
export const certificateScopeSchema = z.enum(["ASSIGNMENT", "FUNDRAISER"]);
export type CertificateScope = z.infer<typeof certificateScopeSchema>;
export const certificateSchema = z.object({
  scope: certificateScopeSchema,
  number: z.string(), assignmentNumber: z.string(), collectorName: z.string(), collectorCode: z.string(),
  fatherName: z.string(), address: z.string(), phone: z.string(),
  books: z.array(z.object({ id: z.uuid(), number: z.string(), editionName: z.string(), assignmentNumber: z.string(),
    receiptFrom: z.number().int(), receiptTo: z.number().int(), status, validFrom: z.iso.date(), validUntil: z.iso.date() })).min(1),
  validFrom: z.iso.date(), expiresOn: z.iso.date(), validUntil: z.iso.date(),
  status,
  historical: z.boolean(),
});
export const certificateResponseSchema = z.object({ data: certificateSchema });
export type AuthorizationCertificate = z.infer<typeof certificateSchema>;
