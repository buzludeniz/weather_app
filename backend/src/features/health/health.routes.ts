import { Router } from "express";
import { pool } from "../../db/pool.js";
import { redis } from "../../services/redis.js";
import { asyncHandler } from "../../http/asyncHandler.js";

export const healthRouter = Router();

healthRouter.get("/", asyncHandler(async (_req, res) => {
  const checks = {
    api: "ok",
    database: "unknown",
    redis: "unknown"
  };

  try {
    await pool.query("SELECT 1");
    checks.database = "ok";
  } catch {
    checks.database = "degraded";
  }

  try {
    const client = redis();
    if (!client) {
      checks.redis = "skipped";
    } else {
      if (client.status === "wait") await client.connect();
      await client.ping();
      checks.redis = "ok";
    }
  } catch {
    checks.redis = "degraded";
  }

  const degraded = Object.values(checks).includes("degraded");
  res.status(degraded ? 503 : 200).json({
    status: degraded ? "degraded" : "ok",
    checks,
    timestamp: new Date().toISOString()
  });
}));
