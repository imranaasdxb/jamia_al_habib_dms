import { z } from "zod";

export const settingsValuesSchema = z.strictObject({
  sessionTimeoutMinutes: z.number().int().min(5).max(480),
  defaultReturnMonths: z.number().int().min(1).max(60),
});

export const settingsDataSchema = settingsValuesSchema.extend({ updatedAt: z.iso.datetime() });
export const saveSettingsSchema = settingsValuesSchema.extend({
  version: z.iso.datetime(),
  reason: z.string().trim().min(3).max(500),
});
export const settingsResponseSchema = z.object({ data: settingsDataSchema });

export type SettingsData = z.infer<typeof settingsDataSchema>;
export type SaveSettingsValues = z.infer<typeof saveSettingsSchema>;
