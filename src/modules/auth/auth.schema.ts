import { z } from "zod";
import { VALIDATION_PATTERNS } from "@/lib/validation/regex";

export type AuthScreen = "login" | "signup" | "forgot" | "verifySignup" | "verifyReset" | "reset";

interface ValidationMessages {
  name: string;
  email: string;
  requiredPassword: string;
  password: string;
  confirm: string;
  otp: string;
}

export function createAuthSchema(screen: AuthScreen, messages: ValidationMessages) {
  return z.strictObject({
    fullName: z.string().trim(),
    email: z.string().trim(),
    password: z.string(),
    confirmPassword: z.string(),
    code: z.string().trim(),
  }).superRefine((values, context) => {
    const addError = (path: keyof typeof values, message: string) => {
      context.addIssue({ code: "custom", path: [path], message });
    };

    if (screen === "signup" && (values.fullName.length < 2 || values.fullName.length > 100)) {
      addError("fullName", messages.name);
    }

    if (["login", "signup", "forgot"].includes(screen)
      && !z.email().safeParse(values.email).success) {
      addError("email", messages.email);
    }

    if (screen === "login" && values.password.length === 0) {
      addError("password", messages.requiredPassword);
    }

    if (screen === "signup" || screen === "reset") {
      const isStrongPassword = values.password.length >= 12 && values.password.length <= 128
        && VALIDATION_PATTERNS.passwordLetter.test(values.password)
        && VALIDATION_PATTERNS.passwordDigit.test(values.password);
      if (!isStrongPassword) addError("password", messages.password);
      if (values.confirmPassword !== values.password) addError("confirmPassword", messages.confirm);
    }

    if ((screen === "verifySignup" || screen === "verifyReset")
      && !VALIDATION_PATTERNS.otp.test(values.code)) {
      addError("code", messages.otp);
    }
  });
}

export type AuthFormValues = z.infer<ReturnType<typeof createAuthSchema>>;
