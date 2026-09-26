import { ApiError } from "../errors/api-error.js";

function invalidQuery(message) {
  throw new ApiError(400, "BAD_REQUEST", message, [
    { field: "query", code: "invalid_value", message }
  ]);
}

export function parseLimit(value) {
  if (value === undefined) return 20;
  if (typeof value !== "string" || !/^[0-9]+$/.test(value)) {
    invalidQuery("limit must be an integer from 1 to 100.");
  }
  const limit = Number(value);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    invalidQuery("limit must be an integer from 1 to 100.");
  }
  return limit;
}

export function encodeCursor(context, value, id) {
  return Buffer.from(JSON.stringify({ context, value, id })).toString("base64url");
}

export function decodeCursor(token, context, validateValue) {
  if (token === undefined) return undefined;
  if (typeof token !== "string" || token.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(token)) {
    invalidQuery("cursor is invalid.");
  }

  let cursor;
  try {
    cursor = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
  } catch {
    invalidQuery("cursor is invalid.");
  }

  if (
    !cursor ||
    typeof cursor !== "object" ||
    Array.isArray(cursor) ||
    JSON.stringify(cursor.context) !== JSON.stringify(context) ||
    typeof cursor.id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cursor.id) ||
    !validateValue(cursor.value)
  ) {
    invalidQuery("cursor does not match this endpoint and query.");
  }
  return { value: cursor.value, id: cursor.id };
}

export function pageResult({ limit, hasMore, lastRow, context, value, id }) {
  const nextCursor = hasMore && lastRow
    ? encodeCursor(context, value(lastRow), id(lastRow))
    : null;
  return { limit, nextCursor, hasMore: Boolean(nextCursor) };
}