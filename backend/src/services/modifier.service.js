import { ApiError } from "../errors/api-error.js";
import * as groupService from "./modifier-group.service.js";
import * as modifierRepository from "../repositories/modifier.repository.js";
import { decodeCursor, pageResult } from "../utils/catalog-pagination.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const writableFields = new Set(["name", "priceAdjustment", "isActive"]);

function validationError(details) {
  throw new ApiError(422, "VALIDATION_FAILED", "Request validation failed.", details);
}

function requireUuid(value, field) {
  if (typeof value !== "string" || !uuidPattern.test(value)) {
    validationError([{ field, code: "invalid_uuid", message: `${field} must be a valid UUID.` }]);
  }
}

function invalidQuery(message, field = "query") {
  throw new ApiError(400, "INVALID_QUERY", message, [{ field, code: "invalid_value", message }]);
}

function singleQuery(query, key) {
  const value = query[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string") invalidQuery(`${key} must be provided once as a string.`, key);
  return value;
}

function parseLimit(value) {
  if (value === undefined) return 20;
  if (!/^[0-9]+$/.test(value)) invalidQuery("limit must be an integer from 1 to 100.", "limit");
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    invalidQuery("limit must be an integer from 1 to 100.", "limit");
  }
  return limit;
}

function parseListQuery(query, productId, groupId) {
  const allowed = new Set(["isActive", "q", "limit", "cursor", "sort", "direction"]);
  for (const key of Object.keys(query)) {
    if (!allowed.has(key)) invalidQuery(`Unsupported query parameter: ${key}.`, key);
  }

  const activeValue = singleQuery(query, "isActive");
  if (activeValue !== undefined && activeValue !== "true" && activeValue !== "false") {
    invalidQuery("isActive must be true or false.", "isActive");
  }
  const search = singleQuery(query, "q")?.trim() || undefined;
  if (search && search.length > 100) invalidQuery("q must be at most 100 characters.", "q");
  const sort = singleQuery(query, "sort") ?? "name";
  if (sort !== "name") invalidQuery("sort must be name; no other modifier sort fields exist.", "sort");
  const direction = singleQuery(query, "direction") ?? "asc";
  if (direction !== "asc" && direction !== "desc") {
    invalidQuery("direction must be asc or desc.", "direction");
  }

  const isActive = activeValue === undefined ? undefined : activeValue === "true";
  const filters = JSON.stringify({ isActive: isActive ?? null, search: search ?? null });
  const context = {
    endpoint: "admin:modifiers",
    parent: { productId, groupId },
    sort,
    direction,
    filters
  };
  const cursor = decodeCursor(singleQuery(query, "cursor"), context, (value) => typeof value === "string");
  return {
    groupId,
    isActive,
    search,
    direction,
    limit: parseLimit(singleQuery(query, "limit")),
    cursor,
    filters,
    context
  };
}

function parsePublicListQuery(query, productId, groupId) {
  for (const key of Object.keys(query)) {
    if (key !== "limit" && key !== "cursor") invalidQuery(`Unsupported query parameter: ${key}.`, key);
  }
  const context = {
    endpoint: "public:modifiers",
    parent: { productId, groupId },
    sort: "name",
    direction: "asc",
    filters: "{}"
  };
  const cursor = decodeCursor(singleQuery(query, "cursor"), context, (value) => typeof value === "string");
  return { groupId, limit: parseLimit(singleQuery(query, "limit")), cursor, context };
}

function validateModifierBody(body, partial) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    validationError([{ field: "body", code: "object_required", message: "Request body must be a JSON object." }]);
  }

  const details = [];
  for (const field of Object.keys(body)) {
    if (!writableFields.has(field)) {
      details.push({ field, code: "unknown_field", message: "This field cannot be set." });
    }
  }

  const changes = {};
  if (!partial || Object.hasOwn(body, "name")) {
    if (typeof body.name !== "string" || body.name.trim().length === 0) {
      details.push({ field: "name", code: "required_nonblank", message: "name is required and cannot be blank." });
    } else {
      changes.name = body.name.trim();
    }
  }

  if (!partial || Object.hasOwn(body, "priceAdjustment")) {
    const value = body.priceAdjustment;
    if (typeof value !== "string" || !/^\d+(?:\.\d{1,2})?$/.test(value.trim())) {
      details.push({
        field: "priceAdjustment",
        code: "invalid_decimal_string",
        message: "priceAdjustment must be a nonnegative decimal string with at most two decimal places under the current database constraint."
      });
    } else {
      const normalized = value.trim();
      const integerDigits = normalized.split(".")[0].replace(/^0+/, "").length;
      if (integerDigits > 10 || normalized.length > 32) {
        details.push({
          field: "priceAdjustment",
          code: "out_of_range",
          message: "priceAdjustment exceeds the supported range."
        });
      } else {
        changes.priceAdjustment = normalized;
      }
    }
  }

  if (!partial || Object.hasOwn(body, "isActive")) {
    const value = Object.hasOwn(body, "isActive") ? body.isActive : true;
    if (typeof value !== "boolean") {
      details.push({ field: "isActive", code: "boolean_required", message: "isActive must be a boolean." });
    } else {
      changes.isActive = value;
    }
  }

  if (partial && Object.keys(body).length === 0) {
    details.push({ field: "body", code: "empty_patch", message: "Provide at least one field to update." });
  }
  if (details.length > 0) validationError(details);
  return changes;
}

async function ensureAdminGroup(productId, groupId) {
  requireUuid(productId, "productId");
  requireUuid(groupId, "groupId");
  return groupService.getAdminGroup(productId, groupId);
}

async function ensurePublicGroup(productId, groupId) {
  requireUuid(productId, "productId");
  requireUuid(groupId, "groupId");
  return groupService.getPublicGroup(productId, groupId);
}

function ensureModifier(modifier) {
  if (!modifier) throw new ApiError(404, "MODIFIER_NOT_FOUND", "Modifier not found.");
  return modifier;
}

export async function listPublicModifiers(productId, groupId, query) {
  await ensurePublicGroup(productId, groupId);
  const options = parsePublicListQuery(query, productId, groupId);
  const result = await modifierRepository.listPublicModifiers(options);
  const rows = result.rows.slice(0, options.limit);
  const last = rows.at(-1);
  return {
    data: rows.map(modifierRepository.mapModifier),
    page: pageResult({
      limit: options.limit,
      hasMore: result.hasMore,
      lastRow: last,
      context: options.context,
      value: (row) => row.name,
      id: (row) => row.modifier_id
    })
  };
}

export async function getPublicModifier(productId, groupId, modifierId) {
  requireUuid(modifierId, "modifierId");
  await ensurePublicGroup(productId, groupId);
  return ensureModifier(await modifierRepository.findPublicModifier(groupId, modifierId));
}

export async function listAdminModifiers(productId, groupId, query) {
  await ensureAdminGroup(productId, groupId);
  const options = parseListQuery(query, productId, groupId);
  const result = await modifierRepository.listAdminModifiers(options);
  const rows = result.rows.slice(0, options.limit);
  const last = rows.at(-1);
  return {
    data: rows.map(modifierRepository.mapModifier),
    page: pageResult({
      limit: options.limit,
      hasMore: result.hasMore,
      lastRow: last,
      context: options.context,
      value: (row) => row.name,
      id: (row) => row.modifier_id
    })
  };
}

export async function getAdminModifier(productId, groupId, modifierId) {
  requireUuid(modifierId, "modifierId");
  await ensureAdminGroup(productId, groupId);
  return ensureModifier(await modifierRepository.findAdminModifier(groupId, modifierId));
}

export async function createModifier(productId, groupId, body) {
  await ensureAdminGroup(productId, groupId);
  const modifier = validateModifierBody(body, false);
  return modifierRepository.createModifier(groupId, modifier);
}

export async function updateModifier(productId, groupId, modifierId, body) {
  requireUuid(modifierId, "modifierId");
  await ensureAdminGroup(productId, groupId);
  ensureModifier(await modifierRepository.findAdminModifier(groupId, modifierId));
  const changes = validateModifierBody(body, true);
  return ensureModifier(await modifierRepository.updateModifier(groupId, modifierId, changes));
}