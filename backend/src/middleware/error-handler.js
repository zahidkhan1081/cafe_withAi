import { randomUUID } from "node:crypto";
import { ApiError } from "../errors/api-error.js";

export function errorHandler(error, _request, response, next) {
  if (response.headersSent) {
    return next(error);
  }

  const requestId = randomUUID();

  if (error.type === "entity.parse.failed") {
    return response.status(400).json({
      error: {
        code: "BAD_REQUEST",
        message: "Request body contains malformed JSON.",
        details: [],
        requestId
      }
    });
  }

  if (error instanceof ApiError) {
    const codeByStatus = {
      400: "BAD_REQUEST",
      404: "NOT_FOUND",
      409: "CONFLICT",
      422: "VALIDATION_FAILED"
    };
    return response.status(error.status).json({
      error: {
        code: codeByStatus[error.status] ?? "INTERNAL_SERVER_ERROR",
        message: error.message,
        details: error.details,
        requestId
      }
    });
  }

  console.error("Unhandled request error", requestId, error);
  return response.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected server error occurred.",
      details: [],
      requestId
    }
  });
}