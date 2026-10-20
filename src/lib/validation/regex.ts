export const VALIDATION_PATTERNS = {
  indianMobile: /^[6-9]\d{9}$/,
  otp: /^\d{6}$/,
  passwordLetter: /\p{L}/u,
  passwordDigit: /\d/,
} as const;
