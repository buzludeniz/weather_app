import { createRequire } from "node:module";
import pino from "pino";
import { env } from "./env.js";

/**
 * pino-pretty is a dev dependency, so it is absent from the production Docker
 * image even when that image is run with NODE_ENV=development (as
 * docker-compose does). Use it only when it can actually be resolved;
 * otherwise log plain JSON instead of crashing at start-up.
 */
function prettyAvailable(): boolean {
  try {
    createRequire(import.meta.url).resolve("pino-pretty");
    return true;
  } catch {
    return false;
  }
}

const usePretty = env.NODE_ENV !== "production" && prettyAvailable();

export const logger = pino({
  level: env.NODE_ENV === "production" ? "info" : "debug",
  transport: usePretty
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard"
        }
      }
    : undefined
});
