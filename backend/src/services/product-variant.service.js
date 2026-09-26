import { ApiError } from "../errors/api-error.js";
import * as productService from "./product.service.js";
import * as variantRepository from "../repositories/product-variant.repository.js";
import { decodeCursor, pageResult } from "../utils/catalog-pagination.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sortableFields = new Set(["name", "sku", "unitPrice", "createdAt"]);
const writableFields = new Set(["sku", "name", "unitPrice", "isActive"]);

function validationError(details) {
  throw new ApiError(422, "VALIDATION_FAILED", "Request validation failed.", details);
}

function requireValidId(value, field) {
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
  const sort = singleQuery(query, "sort") ?? "name";
  if (!sortableFields.has(sort)) invalidQuery("sort must be name, sku, unitPrice, or createdAt.", "sort");
  const direction = singleQuery(query, "direction") ?? "asc";
  if (direction !== "asc" && direction !== "desc") invalidQuery("direction must be asc or desc.", "direction");
  const isActive = activeValue === undefined ? undefined : activeValue === "true";
  const filters = JSON.stringify({ isActive: isActive ?? null, search: search ?? null });
  const context = { endpoint: "admin:product-variants", parent: { productId }, sort, direction, filters };
  const cursor = decodeCursor(singleQuery(query, "cursor"), context, (value) => {
    if (["name", "sku"].includes(sort)) return typeof value === "string";
    if (sort === "unitPrice") return typeof value === "string" && /^\d+(?:\.\d{1,2})?$/.test(value);
    return typeof value === "string" && !Number.isNaN(Date.parse(value));
  });

  return { productId, isActive, search, sort, direction, limit: parseLimit(singleQuery(query, "limit")), cursor, filters, context };
}

function parsePublicListQuery(query, productId) {
  for (const key of Object.keys(query)) {
    if (key !== "limit" && key !== "cursor") invalidQuery(`Unsupported query parameter: ${key}.`, key);
  }
  const context = { endpoint: "public:product-variants", parent: { productId }, sort: "name", direction: "asc", filters: "{}" };
  const cursor = decodeCursor(singleQuery(query, "cursor"), context, (value) => typeof value === "string");
  return { productId, limit: parseLimit(singleQuery(query, "limit")), cursor, context };
}

function validateVariantBody(body, partial) {
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
  for (const field of ["sku", "name"]) {
    if (!partial || Object.hasOwn(body, field)) {
      const value = body[field];
      if (typeof value !== "string" || value.trim().length === 0) {
        details.push({ field, code: "required_nonblank", message: `${field} is required and cannot be blank.` });
      } else {
        changes[field] = field === "sku" ? value.trim().toUpperCase() : value.trim();
      }
    }
  }

  if (!partial || Object.hasOwn(body, "unitPrice")) {
    const value = body.unitPrice;
    if (typeof value !== "string" || !/^\d+(?:\.\d{1,2})?$/.test(value.trim())) {
      details.push({ field: "unitPrice", code: "decimal_string_required", message: "unitPrice must be a nonnegative decimal string with at most two decimal places." });
    } else {
      const normalizedPrice = value.trim();
      const integerDigits = normalizedPrice.split(".")[0].replace(/^0+/, "").length;
      if (integerDigits > 10 || normalizedPrice.length > 32) {
        details.push({ field: "unitPrice", code: "out_of_range", message: "unitPrice exceeds the supported range." });
      } else {
        changes.unitPrice = normalizedPrice;
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

async function ensureAdminProduct(productId) {
  requireValidId(productId, "productId");
  return productService.getAdminProduct(productId);
}

async function ensurePublicProduct(productId) {
  requireValidId(productId, "productId");
  return productService.getPublicProduct(productId);
}

function ensureVariant(variant) {
  if (!variant) throw new ApiError(404, "VARIANT_NOT_FOUND", "Variant not found.");
  return variant;
}

export async function listPublicVariants(productId, query) {
  await ensurePublicProduct(productId);
  const options = parsePublicListQuery(query, productId);
  const result = await variantRepository.listPublicVariants(options);
  const rows = result.rows.slice(0, options.limit);
  const last = rows.at(-1);
  return {
    data: rows.map(variantRepository.mapVariant),
    page: pageResult({
      limit: options.limit,
      hasMore: result.hasMore,
      lastRow: last,
      context: options.context,
      value: (row) => row.name,
      id: (row) => row.variant_id
    })
  };
}

export async function getPublicVariant(productId, variantId) {
  requireValidId(variantId, "variantId");
  await ensurePublicProduct(productId);
  return ensureVariant(await variantRepository.findPublicVariant(productId, variantId));
}

export async function listAdminVariants(productId, query) {
  await ensureAdminProduct(productId);
  const options = parseListQuery(query, productId);
  const result = await variantRepository.listAdminVariants(options);
  const rows = result.rows.slice(0, options.limit);
  const last = rows.at(-1);
  return {
    data: rows.map(variantRepository.mapVariant),
    page: pageResult({
      limit: options.limit,
      hasMore: result.hasMore,
      lastRow: last,
      context: options.context,
      value: (row) => ({ name: row.name, sku: row.sku, unitPrice: row.unit_price, createdAt: row.created_at })[options.sort],
      id: (row) => row.variant_id
    })
  };
}

export async function getAdminVariant(productId, variantId) {
  requireValidId(variantId, "variantId");
  await ensureAdminProduct(productId);
  return ensureVariant(await variantRepository.findAdminVariant(productId, variantId));
}

export async function createVariant(productId, body) {
  await ensureAdminProduct(productId);
  const variant = validateVariantBody(body, false);
  return variantRepository.createVariant(productId, variant);
}

export async function updateVariant(productId, variantId, body) {
  requireValidId(variantId, "variantId");
  await ensureAdminProduct(productId);
  ensureVariant(await variantRepository.findAdminVariant(productId, variantId));
  const changes = validateVariantBody(body, true);
  return ensureVariant(await variantRepository.updateVariant(productId, variantId, changes));
}