import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { logger } from "../config/logger.js";

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code = "http_error"
  ) {
    super(message);
  }
}

export const notFoundHandler = () => {
  throw new HttpError(404, "Route not found", "not_found");
};

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "validation_error",
        message: "Invalid request",
        details: error.flatten()
      }
    });
    return;
  }

  if (error instanceof HttpError) {
    res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message
      }
    });
    return;
  }

  logger.error({ error }, "Unhandled API error");
  res.status(500).json({
    error: {
      code: "internal_error",
      message: "Unexpected server error"
    }
  });
};
