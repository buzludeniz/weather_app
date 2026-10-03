import compression from "compression";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { healthRouter } from "./features/health/health.routes.js";
import { locationsRouter } from "./features/locations/locations.routes.js";
import { notificationsRouter } from "./features/notifications/notifications.routes.js";
import { weatherRouter } from "./features/weather/weather.routes.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { apiRateLimiter } from "./middleware/rateLimiter.js";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN === "*" ? true : env.CORS_ORIGIN }));
  app.use(compression());
  app.use(express.json({ limit: "1mb" }));
  // pino-http's type can be incompatible with our Node ESM interop; cast to any to ensure middleware works
  app.use((pinoHttp as unknown as any)({ logger }));
  app.use(apiRateLimiter);

  app.get("/", (_req, res) => {
    res.json({
      name: "Nimbus Weather API",
      version: "1.0.0",
      docs: "/v1"
    });
  });

  app.use("/health", healthRouter);
  app.use("/v1/weather", weatherRouter);
  app.use("/v1/locations", locationsRouter);
  app.use("/v1/notifications", notificationsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
