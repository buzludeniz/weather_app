import { z } from "zod";
import { ThemePreferenceSchema, UnitsSchema } from "./weather.js";

export const LanguageSchema = z.enum(["en", "es", "fr", "de", "it", "sq"]);
export type Language = z.infer<typeof LanguageSchema>;

export const NotificationPreferencesSchema = z.object({
  severeAlerts: z.boolean(),
  dailyForecast: z.boolean(),
  rainSoon: z.boolean(),
  airQuality: z.boolean(),
  quietHoursStart: z.string().regex(/^\d{2}:\d{2}$/),
  quietHoursEnd: z.string().regex(/^\d{2}:\d{2}$/)
});
export type NotificationPreferences = z.infer<typeof NotificationPreferencesSchema>;

export const UserPreferencesSchema = z.object({
  units: UnitsSchema,
  theme: ThemePreferenceSchema,
  language: LanguageSchema,
  notifications: NotificationPreferencesSchema,
  privacy: z.object({
    preciseLocation: z.boolean(),
    analytics: z.boolean(),
    crashReports: z.boolean()
  })
});
export type UserPreferences = z.infer<typeof UserPreferencesSchema>;

export const DefaultUserPreferences: UserPreferences = {
  units: "metric",
  theme: "system",
  language: "en",
  notifications: {
    severeAlerts: true,
    dailyForecast: true,
    rainSoon: true,
    airQuality: false,
    quietHoursStart: "22:00",
    quietHoursEnd: "07:00"
  },
  privacy: {
    preciseLocation: true,
    analytics: false,
    crashReports: true
  }
};
