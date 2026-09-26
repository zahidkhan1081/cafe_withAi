import { ApiError } from "../errors/api-error.js";
import * as productRepository from "../repositories/product.repository.js";
import { decodeCursor, pageResult } from "../utils/catalog-pagination.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const publicSorts = new Set(["name", "createdAt"]);
const adminSorts = new Set(["name", "createdAt", "categoryName"]);
const writableFields = new Set(["categoryId", "name", "description", "isActive"]);

function invalidQuery(message, field = "query") {
  throw new ApiError(400, "INVALID_QUERY", message, [{ field, code: "invalid_value", message }]);
}

function parseSingle(query, key) {
  const value = query[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string") invalidQuery(`${key} must be provided once as a string.`, key);
  return value;
}

function parseBooleanQuery(value, field) {
  if (value === undefined) return undefined;
  if (value !== "true" && value !== "false") {
    invalidQuery(`${field} must be true or false.`, field);
  }
  return value === "true";
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

function parseListQuery(query, admin) {
  const allowed = new Set(["limit", "cursor", "categoryId", "q", "sort", "direction"]);
  if (admin) {
    ["isActive", "hasActiveVariant"].forEach((key) => allowed.add(key));
  }
  for (const key of Object.keys(query)) {
    if (!allowed.has(key)) invalidQuery(`Unsupported query parameter: ${key}.`, key);
  }

  const categoryId = parseSingle(query, "categoryId");
  if (categoryId !== undefined && !uuidPattern.test(categoryId)) {
    invalidQuery("categoryId must be a valid UUID.", "categoryId");
  }

  const search = parseSingle(query, "q")?.trim() || undefined;
  if (search && search.length > 100) invalidQuery("q must be at most 100 characters.", "q");

  const isActive = admin ? parseBooleanQuery(parseSingle(query, "isActive"), "isActive") : undefined;
  const hasActiveVariant = admin
    ? parseBooleanQuery(parseSingle(query, "hasActiveVariant"), "hasActiveVariant")
    : undefined;
  const sort = parseSingle(query, "sort") ?? "name";
  if (!(admin ? adminSorts : publicSorts).has(sort)) {
    invalidQuery(`sort is not supported for this endpoint.`, "sort");
  }
  const direction = parseSingle(query, "direction") ?? "asc";
  if (direction !== "asc" && direction !== "desc") {
    invalidQuery("direction must be asc or desc.", "direction");
  }
  const limit = parseLimit(parseSingle(query, "limit"));
  const filters = JSON.stringify({
    categoryId: categoryId ?? null,
    search: search ?? null,
    isActive: isActive ?? null,
    hasActiveVariant: hasActiveVariant ?? null
  });
  const context = {
    endpoint: admin ? "admin:products" : "public:products",
    parent: { categoryId: categoryId ?? null },
    sort,
    direction,
    filters
  };
  const cursor = decodeCursor(parseSingle(query, "cursor"), context, (value) => {
    if (sort === "createdAt") return typeof value === "string" && !Number.isNaN(Date.parse(value));
    return typeof value === "string";
  });

  return { publicOnly: !admin, categoryId, search, isActive, hasActiveVariant, sort, direction, limit, cursor, filters, context };
}

function invalidBody(details) {
  throw new ApiError(422, "VALIDATION_FAILED", "Request validation failed.", details);
}

function validateProductBody(body, partial) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    invalidBody([{ field: "body", code: "object_required", message: "Request body must be a JSON object." }]);
  }

  const details = [];
  for (const field of Object.keys(body)) {
    if (!writableFields.has(field)) {
      details.push({ field, code: "unknown_field", message: "This field cannot be set." });
    }
  }

  const changes = {};
  if (!partial || Object.hasOwn(body, "categoryId")) {
    const categoryId = body.categoryId;
    if (typeof categoryId !== "string" || !uuidPattern.test(categoryId)) {
      details.push({ field: "categoryId", code: "invalid_uuid", message: "categoryId must be a valid category UUID." });
    } else {
      changes.categoryId = categoryId;
    }
  }

  if (!partial || Object.hasOwn(body, "name")) {
    const name = body.name;
    if (typeof name !== "string" || name.trim().length === 0) {
      details.push({ field: "name", code: "required_nonblank", message: "name is required and cannot be blank." });
    } else {
      changes.name = name.trim();
    }
  }

  if (!partial || Object.hasOwn(body, "description")) {
    const description = body.description;
    if (description !== undefined && description !== null && typeof description !== "string") {
      details.push({ field: "description", code: "string_required", message: "description must be a string or null." });
    } else {
      const normalizedDescription = typeof description === "string" ? description.trim() : null;
      changes.description = normalizedDescription || null;
    }
  }

  if (!partial || Object.hasOwn(body, "isActive")) {
    const isActive = Object.hasOwn(body, "isActive") ? body.isActive : true;
    if (typeof isActive !== "boolean") {
      details.push({ field: "isActive", code: "boolean_required", message: "isActive must be a boolean." });
    } else {
      changes.isActive = isActive;
    }
  }

  if (partial && Object.keys(body).length === 0) {
    details.push({ field: "body", code: "empty_patch", message: "Provide at least one field to update." });
  }
  if (details.length > 0) invalidBody(details);
  return changes;
}

function requireProductId(productId) {
  if (!uuidPattern.test(productId)) {
    throw new ApiError(422, "VALIDATION_FAILED", "productId must be a valid UUID.", [
      { field: "productId", code: "invalid_uuid", message: "Provide a valid UUID." }
    ]);
  }
}

function ensureFound(product) {
  if (!product) throw new ApiError(404, "PRODUCT_NOT_FOUND", "Product not found.");
  return product;
}

async function validateCategoryExists(categoryId) {
  if (!(await productRepository.categoryExists(categoryId))) {
    throw new ApiError(422, "INVALID_CATEGORY", "The selected category does not exist.", [
      { field: "categoryId", code: "not_found", message: "Choose an existing category." }
    ]);
  }
}

async function listProducts(query, admin) {
  const options = parseListQuery(query, admin);
  const result = await productRepository.listProducts(options);
  const rows = result.rows.slice(0, options.limit);
  const last = rows.at(-1);
  return {
    data: rows.map(productRepository.mapProduct),
    page: pageResult({
      limit: options.limit,
      hasMore: result.hasMore,
      lastRow: last,
      context: options.context,
      value: (row) => ({ name: row.name, createdAt: row.created_at, categoryName: row.category_name })[options.sort],
      id: (row) => row.product_id
    })
  };
}

export function listPublicProducts(query) {
  return listProducts(query, false);
}

export function listAdminProducts(query) {
  return listProducts(query, true);
}

export async function getPublicProduct(productId) {
  requireProductId(productId);
  return ensureFound(await productRepository.findPublicProductById(productId));
}

export async function getAdminProduct(productId) {
  requireProductId(productId);
  return ensureFound(await productRepository.findAdminProductById(productId));
}

export async function createProduct(body) {
  const product = validateProductBody(body, false);
  await validateCategoryExists(product.categoryId);
  return productRepository.createProduct(product);
}

export async function updateProduct(productId, body) {
  requireProductId(productId);
  ensureFound(await productRepository.findAdminProductById(productId));
  const changes = validateProductBody(body, true);
  if (Object.hasOwn(changes, "categoryId")) {
    await validateCategoryExists(changes.categoryId);
  }
  return ensureFound(await productRepository.updateProduct(productId, changes));
}