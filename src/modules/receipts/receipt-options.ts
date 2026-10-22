export const RECEIPT_REASON_CODES = ["CANCELLED", "TORN", "LOST"] as const;
export const RECEIPT_REASON_OPTIONS = [
  { code: "CANCELLED", nameEn: "Cancelled receipt", nameUr: "منسوخ رسید" },
  { code: "TORN", nameEn: "Torn receipt", nameUr: "پھٹی رسید" },
  { code: "LOST", nameEn: "Lost receipt", nameUr: "گم شدہ رسید" },
] as const;
export const RECEIPT_FLAG_OPTIONS = [
  { code: "CASH_SHORT", nameEn: "Cash short", nameUr: "نقد رقم کم" },
  { code: "CASH_EXCESS", nameEn: "Cash excess", nameUr: "نقد رقم زیادہ" },
  { code: "RECEIPT_MISSING", nameEn: "Receipt missing", nameUr: "رسید غائب" },
  { code: "COUNT_DIFFERS", nameEn: "Receipt count differs", nameUr: "رسیدوں کی تعداد میں فرق" },
  { code: "AMOUNT_DIFFERS", nameEn: "Amount differs", nameUr: "رقم میں فرق" },
  { code: "TORN_LOST", nameEn: "Torn or lost receipt", nameUr: "پھٹی یا گم شدہ رسید" },
  { code: "OTHER", nameEn: "Other", nameUr: "دیگر" },
] as const;
