import { ApiError } from "../errors/api-error.js";
import * as categoryRepository from "../repositories/category.repository.js";
import { decodeCursor, pageResult, parseLimit } from "../utils/catalog-pagination.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sortableFields = new Set(["displayOrder", "name", "createdAt"]);
const writableFields = new Set(["name", "slug", "parentCategoryId", "displayOrder", "isActive"]);

function validationError(details) {
  throw new ApiError(422, "VALIDATION_FAILED", "Request validation failed.", details);
}

function invalidQuery(message, field = "query") {
  throw new ApiError(400, "BAD_REQUEST", message, [{ field, code: "invalid_value", message }]);
}

function requireUuid(value, field) {
  if (typeof value !== "string" || !uuidPattern.test(value)) {
    validationError([{ field, code: "invalid_uuid", message: `${field} must be a valid UUID.` }]);
  }
}

function singleQuery(query, key) {
  const value = query[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string") invalidQuery(`${key} must be provided once as a string.`, key);
  return value;
}

function parseListQuery(query, admin) {
  const allowed = new Set(["limit", "cursor"]);
  if (admin) ["isActive", "q", "sort", "direction"].forEach((key) => allowed.add(key));
  for (const key of Object.keys(query)) {
    if (!allowed.has(key)) invalidQuery(`Unsupported query parameter: ${key}.`, key);
  }

  const isActiveValue = admin ? singleQuery(query, "isActive") : undefined;
  if (isActiveValue !== undefined && isActiveValue !== "true" && isActiveValue !== "false") {
    invalidQuery("isActive must be true or false.", "isActive");
  }
  const search = admin ? singleQuery(query, "q")?.trim() || undefined : undefined;
  if (search && search.length > 100) invalidQuery("q must be at most 100 characters.", "q");
  const sort = (admin ? singleQuery(query, "sort") : undefined) ?? "displayOrder";
  if (!sortableFields.has(sort)) invalidQuery("sort must be displayOrder, name, or createdAt.", "sort");
  const direction = (admin ? singleQuery(query, "direction") : undefined) ?? "asc";
  if (direction !== "asc" && direction !== "desc") invalidQuery("direction must be asc or desc.", "direction");

  const active = isActiveValue === undefined ? undefined : isActiveValue === "true";
  const filters = JSON.stringify({ isActive: active ?? null, search: search ?? null });
  const context = {
    endpoint: admin ? "admin:menu-categories" : "public:menu-categories",
    sort,
    direction,
    filters
  };
  const cursor = decodeCursor(singleQuery(query, "cursor"), context, (value) => {
    if (sort === "displayOrder") return Number.isInteger(value) && value >= 0;
    if (sort === "createdAt") return typeof value === "string" && !Number.isNaN(Date.parse(value));
    return typeof value === "string";
  });

  return {
    publicOnly: !admin,
    isActive: active,
    search,
    sort,
    direction,
    limit: parseLimit(singleQuery(query, "limit")),
    cursor,
    context
  };
}

function validateCategoryBody(body, partial) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    validationError([{ field: "body", code: "object_required", message: "Request body must be a JSON object." }]);
  }

  const details = [];
  for (const field of Object.keys(body)) {
    if (!writableFields.has(field)) details.push({ field, code: "unknown_field", message: "This field cannot be set." });
  }

  const changes = {};
  for (const field of ["name", "slug"]) {
    if (!partial || Object.hasOwn(body, field)) {
      const value = body[field];
      if (typeof value !== "string" || value.trim().length === 0) {
        details.push({ field, code: "required_nonblank", message: `${field} is required and cannot be blank.` });
      } else {
        changes[field] = field === "slug" ? value.trim().toLowerCase() : value.trim();
      }
    }
  }

  if (!partial || Object.hasOwn(body, "parentCategoryId")) {
    const value = body.parentCategoryId;
    if (value !== undefined && value !== null && (typeof value !== "string" || !uuidPattern.test(value))) {
      details.push({ field: "parentCategoryId", code: "invalid_uuid", message: "parentCategoryId must be a UUID or null." });
    } else {
      changes.parentCategoryId = value ?? null;
    }
  }

  if (!partial || Object.hasOwn(body, "displayOrder")) {
    const value = Object.hasOwn(body, "displayOrder") ? body.displayOrder : 0;
    if (!Number.isInteger(value) || value < 0) {
      details.push({ field: "displayOrder", code: "invalid_integer", message: "displayOrder must be a nonnegative integer." });
    } else {
      changes.displayOrder = value;
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

function ensureFound(category) {
  if (!category) throw new ApiError(404, "NOT_FOUND", "Category not found.");
  return category;
}

async function listCategories(query, admin) {
  const options = parseListQuery(query, admin);
  const result = await categoryRepository.listCategories(options);
  const rows = result.rows.slice(0, options.limit);
  const last = rows.at(-1);
  return {
    data: rows.map(categoryRepository.mapCategory),
    page: pageResult({
      limit: options.limit,
      hasMore: result.hasMore,
      lastRow: last,
      context: options.context,
      value: (row) => ({ displayOrder: row.display_order, name: row.name, createdAt: row.created_at })[options.sort],
      id: (row) => row.category_id
    })
  };
}

export function listPublicCategories(query) {
  return listCategories(query, false);
}

export function listAdminCategories(query) {
  return listCategories(query, true);
}

export async function getPublicCategory(categoryId) {
  requireUuid(categoryId, "categoryId");
  return ensureFound(await categoryRepository.findPublicCategoryById(categoryId));
}

export async function getAdminCategory(categoryId) {
  requireUuid(categoryId, "categoryId");
  return ensureFound(await categoryRepository.findAdminCategoryById(categoryId));
}

export async function createCategory(body) {
  const category = validateCategoryBody(body, false);
  if (category.parentCategoryId && !(await categoryRepository.parentCategoryExists(category.parentCategoryId))) {
    throw new ApiError(422, "VALIDATION_FAILED", "The parent category does not exist.", [
      { field: "parentCategoryId", code: "not_found", message: "Choose an existing category or null." }
    ]);
  }
  return categoryRepository.createCategory(category);
}

export async function updateCategory(categoryId, body) {
  requireUuid(categoryId, "categoryId");
  ensureFound(await categoryRepository.findAdminCategoryById(categoryId));
  const changes = validateCategoryBody(body, true);
  if (changes.parentCategoryId === categoryId) {
    throw new ApiError(409, "CONFLICT", "A category cannot be its own parent.");
  }
  return categoryRepository.updateCategory(categoryId, changes);
}