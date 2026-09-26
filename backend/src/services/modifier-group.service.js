import { ApiError } from "../errors/api-error.js";
import * as productService from "./product.service.js";
import * as groupRepository from "../repositories/modifier-group.repository.js";
import { decodeCursor, pageResult } from "../utils/catalog-pagination.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sortableFields = new Set(["name", "displayOrder"]);
const writableFields = new Set(["name", "minSelections", "maxSelections", "displayOrder", "isActive"]);

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

function parseListQuery(query, productId) {
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
  const sort = singleQuery(query, "sort") ?? "displayOrder";
  if (!sortableFields.has(sort)) invalidQuery("sort must be name or displayOrder; createdAt is unavailable in this schema.", "sort");
  const direction = singleQuery(query, "direction") ?? "asc";
  if (direction !== "asc" && direction !== "desc") invalidQuery("direction must be asc or desc.", "direction");

  const isActive = activeValue === undefined ? undefined : activeValue === "true";
  const filters = JSON.stringify({ isActive: isActive ?? null, search: search ?? null });
  const context = { endpoint: "admin:modifier-groups", parent: { productId }, sort, direction, filters };
  const cursor = decodeCursor(singleQuery(query, "cursor"), context, (value) =>
    sort === "name" ? typeof value === "string" : Number.isInteger(value) && value >= 0
  );
  return { productId, isActive, search, sort, direction, limit: parseLimit(singleQuery(query, "limit")), cursor, filters, context };
}

function parsePublicListQuery(query, productId) {
  for (const key of Object.keys(query)) {
    if (key !== "limit" && key !== "cursor") invalidQuery(`Unsupported query parameter: ${key}.`, key);
  }
  const context = {
    endpoint: "public:modifier-groups",
    parent: { productId },
    sort: "displayOrder",
    direction: "asc",
    filters: "{}"
  };
  const cursor = decodeCursor(singleQuery(query, "cursor"), context, (value) => Number.isInteger(value) && value >= 0);
  return { productId, limit: parseLimit(singleQuery(query, "limit")), cursor, context };
}

function validateGroupBody(body, partial) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    validationError([{ field: "body", code: "object_required", message: "Request body must be a JSON object." }]);
  }

  const details = [];
  for (const field of Object.keys(body)) {
    if (!writableFields.has(field)) details.push({ field, code: "unknown_field", message: "This field cannot be set." });
  }

  const changes = {};
  if (!partial || Object.hasOwn(body, "name")) {
    if (typeof body.name !== "string" || body.name.trim().length === 0) {
      details.push({ field: "name", code: "required_nonblank", message: "name is required and cannot be blank." });
    } else {
      changes.name = body.name.trim();
    }
  }

  for (const [field, minimum] of [["minSelections", 0], ["maxSelections", 1], ["displayOrder", 0]]) {
    if (!partial || Object.hasOwn(body, field)) {
      const value = body[field];
      if (!Number.isInteger(value) || value < minimum) {
        details.push({
          field,
          code: "invalid_integer",
          message: `${field} must be an integer greater than or equal to ${minimum}.`
        });
      } else {
        changes[field] = value;
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

function validateSelectionPair(minSelections, maxSelections) {
  if (minSelections > maxSelections) {
    validationError([{
      field: "minSelections",
      code: "selection_range_invalid",
      message: "minSelections must be less than or equal to maxSelections."
    }]);
  }
}

async function ensureAdminProduct(productId) {
  requireUuid(productId, "productId");
  return productService.getAdminProduct(productId);
}

async function ensurePublicProduct(productId) {
  requireUuid(productId, "productId");
  return productService.getPublicProduct(productId);
}

function ensureGroup(group) {
  if (!group) throw new ApiError(404, "MODIFIER_GROUP_NOT_FOUND", "Modifier group not found.");
  return group;
}

export async function listPublicGroups(productId, query) {
  await ensurePublicProduct(productId);
  const options = parsePublicListQuery(query, productId);
  const result = await groupRepository.listPublicGroups(options);
  const rows = result.rows.slice(0, options.limit);
  const last = rows.at(-1);
  return {
    data: rows.map(groupRepository.mapGroup),
    page: pageResult({
      limit: options.limit,
      hasMore: result.hasMore,
      lastRow: last,
      context: options.context,
      value: (row) => row.display_order,
      id: (row) => row.modifier_group_id
    })
  };
}

export async function getPublicGroup(productId, groupId) {
  requireUuid(groupId, "groupId");
  await ensurePublicProduct(productId);
  return ensureGroup(await groupRepository.findPublicGroup(productId, groupId));
}

export async function listAdminGroups(productId, query) {
  await ensureAdminProduct(productId);
  const options = parseListQuery(query, productId);
  const result = await groupRepository.listAdminGroups(options);
  const rows = result.rows.slice(0, options.limit);
  const last = rows.at(-1);
  return {
    data: rows.map(groupRepository.mapGroup),
    page: pageResult({
      limit: options.limit,
      hasMore: result.hasMore,
      lastRow: last,
      context: options.context,
      value: (row) => options.sort === "name" ? row.name : row.display_order,
      id: (row) => row.modifier_group_id
    })
  };
}

export async function getAdminGroup(productId, groupId) {
  requireUuid(groupId, "groupId");
  await ensureAdminProduct(productId);
  return ensureGroup(await groupRepository.findAdminGroup(productId, groupId));
}

export async function createGroup(productId, body) {
  await ensureAdminProduct(productId);
  const group = validateGroupBody(body, false);
  validateSelectionPair(group.minSelections, group.maxSelections);
  return groupRepository.createGroup(productId, group);
}

export async function updateGroup(productId, groupId, body) {
  await ensureAdminProduct(productId);
  requireUuid(groupId, "groupId");
  const current = ensureGroup(await groupRepository.findAdminGroup(productId, groupId));
  const changes = validateGroupBody(body, true);
  validateSelectionPair(
    changes.minSelections ?? current.minSelections,
    changes.maxSelections ?? current.maxSelections
  );
  return ensureGroup(await groupRepository.updateGroup(productId, groupId, changes));
}