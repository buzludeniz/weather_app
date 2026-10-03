import { Router } from "express";
import { z } from "zod";
import { DefaultUserPreferences } from "@nimbus/shared";
import { asyncHandler } from "../../http/asyncHandler.js";
import { query } from "../../db/pool.js";
import { HttpError } from "../../middleware/errorHandler.js";
import { validate } from "../../middleware/validate.js";
import { injectSyntheticAlert, syntheticAlertsEnabled } from "./syntheticAlerts.js";

const RegisterDeviceSchema = z.object({
  deviceId: z.string().min(4).max(160),
  pushToken: z.string().min(8).max(512).optional(),
  platform: z.enum(["ios", "android", "web"]),
  language: z.string().min(2).max(8).default("en"),
  units: z.enum(["metric", "imperial"]).default("metric")
});

const PreferencesSchema = z.object({
  severeAlerts: z.boolean(),
  dailyForecast: z.boolean(),
  rainSoon: z.boolean(),
  airQuality: z.boolean(),
  quietHoursStart: z.string().regex(/^\d{2}:\d{2}$/),
  quietHoursEnd: z.string().regex(/^\d{2}:\d{2}$/)
});

export const notificationsRouter = Router();

notificationsRouter.post("/register", validate({ body: RegisterDeviceSchema }), asyncHandler(async (req, res) => {
  const body = req.body as z.infer<typeof RegisterDeviceSchema>;
  const rows = await query<{ id: string }>(
    `INSERT INTO installations (device_id, push_token, platform, language, units)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (device_id)
     DO UPDATE SET push_token = EXCLUDED.push_token, language = EXCLUDED.language, units = EXCLUDED.units, updated_at = NOW()
     RETURNING id`,
    [body.deviceId, body.pushToken ?? null, body.platform, body.language, body.units]
  );

  const installationId = rows[0]?.id;
  if (installationId) {
    await query(
      `INSERT INTO notification_preferences (installation_id, severe_alerts, daily_forecast, rain_soon, air_quality, quiet_hours_start, quiet_hours_end)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (installation_id) DO NOTHING`,
      [
        installationId,
        DefaultUserPreferences.notifications.severeAlerts,
        DefaultUserPreferences.notifications.dailyForecast,
        DefaultUserPreferences.notifications.rainSoon,
        DefaultUserPreferences.notifications.airQuality,
        DefaultUserPreferences.notifications.quietHoursStart,
        DefaultUserPreferences.notifications.quietHoursEnd
      ]
    );
  }

  res.status(201).json({ data: { installationId } });
}));

notificationsRouter.put("/:installationId/preferences", validate({ body: PreferencesSchema }), asyncHandler(async (req, res) => {
  const body = req.body as z.infer<typeof PreferencesSchema>;
  await query(
    `UPDATE notification_preferences
     SET severe_alerts = $2, daily_forecast = $3, rain_soon = $4, air_quality = $5, quiet_hours_start = $6, quiet_hours_end = $7, updated_at = NOW()
     WHERE installation_id = $1`,
    [
      req.params.installationId,
      body.severeAlerts,
      body.dailyForecast,
      body.rainSoon,
      body.airQuality,
      body.quietHoursStart,
      body.quietHoursEnd
    ]
  );
  res.json({ data: body });
}));

const InjectAlertSchema = z.object({
  installationId: z.string().uuid("installationId must be a UUID"),
  alertType: z.enum(["storm", "flood", "heat", "wind", "snow", "air_quality"]),
  severity: z.enum(["minor", "moderate", "severe", "extreme"]).optional(),
  /** Minutes to advance the clock, for exercising the incident gap. */
  advanceMinutes: z.number().int().min(0).max(60 * 24 * 30).optional()
});

/**
 * Inject a severe condition and run one scan over it.
 *
 * Registered only when `syntheticAlertsEnabled()`, which is false in
 * production. In production the path does not exist: the request falls through
 * to the not-found handler rather than being rejected after a check.
 */
if (syntheticAlertsEnabled()) {
  notificationsRouter.post(
    "/synthetic-alert",
    validate({ body: InjectAlertSchema }),
    asyncHandler(async (req, res) => {
      const body = req.body as z.infer<typeof InjectAlertSchema>;
      const at = body.advanceMinutes
        ? new Date(Date.now() + body.advanceMinutes * 60_000)
        : new Date();

      try {
        const data = await injectSyntheticAlert({
          installationId: body.installationId,
          alertType: body.alertType,
          at,
          ...(body.severity ? { overrides: { severity: body.severity } } : {})
        });
        res.status(201).json({ data });
      } catch (error) {
        const code = error instanceof Error ? error.message : "unknown_error";
        if (code === "installation_not_found" || code === "unsupported_alert_type") {
          throw new HttpError(404, code, code);
        }
        throw error;
      }
    })
  );
}
