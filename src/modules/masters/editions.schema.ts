import { z } from "zod";

const page = z.string().regex(/^[1-9]\d{0,9}$/).refine((value) => Number(value) <= 2147483647);
const tokenCount = z.string().regex(/^\d{1,8}$/);
const fields = {
  editionNumber: z.string().trim().regex(/^[1-9]\d{0,3}(?:(?:st|nd|rd|th)?\s+edition)?$/i)
    .transform((value) => String(Number.parseInt(value, 10))),
  bookType: z.enum(["REGULAR", "TOKEN"]),
  tokenTen: tokenCount, tokenTwenty: tokenCount, tokenFifty: tokenCount,
  printingYear: z.string().regex(/^\d{4}$/).refine((value) => Number(value) >= 1900 && Number(value) <= 2100),
  editionCode: z.string().trim().min(1).max(40).regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/).toUpperCase(),
  pagesFrom: page, pagesTo: page,
  designedPrintedBy: z.string().trim().min(2).max(160),
};
export function editionQuantity(from: string, to: string) {
  const count = Number(to) - Number(from) + 1;
  return /^\d+$/.test(from) && /^\d+$/.test(to) && Number(from) >= 1 && Number(to) <= 2147483647
    && count > 0 && count % 50 === 0 ? count / 50 : null;
}
export function editionLabel(number: number) {
  const last = number % 10;
  const suffix = number % 100 >= 11 && number % 100 <= 13 ? "th" : last === 1 ? "st" : last === 2 ? "nd" : last === 3 ? "rd" : "th";
  return `${number}${suffix} edition`;
}
function validateTokens(value: { bookType: string; tokenTen: string; tokenTwenty: string; tokenFifty: string; pagesFrom: string; pagesTo: string }, context: z.RefinementCtx) {
  if (value.bookType === "TOKEN" && Number(value.tokenTen) + Number(value.tokenTwenty) + Number(value.tokenFifty) !== editionQuantity(value.pagesFrom, value.pagesTo)) {
    context.addIssue({ code: "custom", path: ["tokenFifty"], message: "editionTokenRequired" });
  }
}
export const editionInputSchema = z.strictObject(fields).superRefine((value, context) => {
  if (editionQuantity(value.pagesFrom, value.pagesTo) === null) context.addIssue({ code: "custom", path: ["pagesTo"], message: "editionRangeHelp" });
  validateTokens(value, context);
});
export const editionValuesSchema = z.strictObject({ ...fields,
  pagesPerBook: z.literal(50), quantity: z.number().int().positive() })
  .superRefine((value, context) => {
    if (editionQuantity(value.pagesFrom, value.pagesTo) !== value.quantity) context.addIssue({ code: "custom", path: ["pagesTo"], message: "editionRangeHelp" });
    validateTokens(value, context);
  });
export type EditionInput = z.infer<typeof editionInputSchema>;
