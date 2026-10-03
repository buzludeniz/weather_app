import rateLimit from "express-rate-limit";
import { env } from "../config/env.js";

export const apiRateLimiter = rateLimit({
  legacyHeaders: false,
  limit: env.RATE_LIMIT_MAX,
  message: {
    error: {
      code: "rate_limited",
      message: "Too many requests"
    }
  },
  standardHeaders: true,
  windowMs: env.RATE_LIMIT_WINDOW_MS
});
