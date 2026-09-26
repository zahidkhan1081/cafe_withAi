import pool from "../db/pool.js";
import { ApiError } from "../errors/api-error.js";

const variantSelection = `
  v.variant_id,
  v.product_id,
  v.sku,
  v.name,
  v.unit_price::text AS unit_price,
  v.is_active,
  v.created_at,
  v.updated_at
`;

const sortColumns = {
  name: "v.name",
  sku: "v.sku",
  unitPrice: "v.unit_price",
  createdAt: "v.created_at"
};

function mapVariant(row) {
  if (!row) return null;
  return {
    id: row.variant_id,
    productId: row.product_id,
    sku: row.sku,
    name: row.name,
    unitPrice: row.unit_price,
    isActive: row.is_active
  };
}

function translateDatabaseError(error) {
  if (error.code === "23505" && error.constraint === "product_variants_sku_unique") {
    return new ApiError(409, "DUPLICATE_SKU", "A variant with this SKU already exists.");
  }
  if (error.code === "23505" && error.constraint === "product_variants_product_name_unique") {
    return new ApiError(409, "DUPLICATE_VARIANT_NAME", "A variant with this name already exists for the product.");
  }
  if (error.code === "23503" && error.constraint === "product_variants_product_id_fkey") {
    return new ApiError(404, "PRODUCT_NOT_FOUND", "Product not found.");
  }
  if (error.code === "23514" && error.constraint === "product_variants_price_check") {
    return new ApiError(422, "INVALID_UNIT_PRICE", "unitPrice must be zero or greater.", [
      { field: "unitPrice", code: "nonnegative_required", message: "unitPrice must be zero or greater." }
    ]);
  }
  if (error.code === "22003") {
    return new ApiError(422, "INVALID_UNIT_PRICE", "unitPrice exceeds the supported range.", [
      { field: "unitPrice", code: "out_of_range", message: "unitPrice exceeds the supported range." }
    ]);
  }
  return error;
}

export async function listPublicVariants({ productId, limit, cursor }) {
  const values = [productId];
  let cursorCondition = "";
  if (cursor) {
    values.push(cursor.value, cursor.id);
    cursorCondition = `AND (v.name > $2 OR (v.name = $2 AND v.variant_id > $3))`;
  }
  values.push(limit + 1);
  const result = await pool.query(
    `SELECT ${variantSelection}
     FROM public.product_variants v
     JOIN public.products p ON p.product_id = v.product_id
     JOIN public.menu_categories c ON c.category_id = p.category_id
     WHERE v.product_id = $1
       AND v.is_active = true
       AND p.is_active = true
       AND c.is_active = true
       ${cursorCondition}
     ORDER BY v.name ASC, v.variant_id ASC
     LIMIT $${values.length}`,
    values
  );
  return { rows: result.rows, hasMore: result.rows.length > limit };
}

export async function findPublicVariant(productId, variantId) {
  const result = await pool.query(
    `SELECT ${variantSelection}
     FROM public.product_variants v
     JOIN public.products p ON p.product_id = v.product_id
     JOIN public.menu_categories c ON c.category_id = p.category_id
     WHERE v.product_id = $1
       AND v.variant_id = $2
       AND v.is_active = true
       AND p.is_active = true
       AND c.is_active = true`,
    [productId, variantId]
  );
  return mapVariant(result.rows[0]);
}

export async function listAdminVariants({ productId, isActive, search, sort, direction, limit, cursor }) {
  const values = [productId];
  const conditions = ["v.product_id = $1"];
  const bind = (value) => {
    values.push(value);
    return `$${values.length}`;
  };

  if (isActive !== undefined) {
    conditions.push(`v.is_active = ${bind(isActive)}`);
  }
  if (search) {
    const searchParameter = bind(`%${search}%`);
    conditions.push(`(v.name ILIKE ${searchParameter} OR v.sku ILIKE ${searchParameter})`);
  }
  if (cursor) {
    const sortColumn = sortColumns[sort];
    const comparison = direction === "asc" ? ">" : "<";
    const sortValue = bind(cursor.value);
    const variantId = bind(cursor.id);
    conditions.push(
      `(${sortColumn} ${comparison} ${sortValue} OR (${sortColumn} = ${sortValue} AND v.variant_id ${comparison} ${variantId}))`
    );
  }

  const limitParameter = bind(limit + 1);
  const order = direction.toUpperCase();
  const result = await pool.query(
    `SELECT ${variantSelection}
     FROM public.product_variants v
     WHERE ${conditions.join(" AND ")}
     ORDER BY ${sortColumns[sort]} ${order}, v.variant_id ${order}
     LIMIT ${limitParameter}`,
    values
  );
  return {
    rows: result.rows,
    hasMore: result.rows.length > limit
  };
}

export async function findAdminVariant(productId, variantId) {
  const result = await pool.query(
    `SELECT ${variantSelection}
     FROM public.product_variants v
     WHERE v.product_id = $1 AND v.variant_id = $2`,
    [productId, variantId]
  );
  return mapVariant(result.rows[0]);
}

export async function createVariant(productId, variant) {
  try {
    const inserted = await pool.query(
      `INSERT INTO public.product_variants (product_id, sku, name, unit_price, is_active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING variant_id`,
      [productId, variant.sku, variant.name, variant.unitPrice, variant.isActive]
    );
    return findAdminVariant(productId, inserted.rows[0].variant_id);
  } catch (error) {
    throw translateDatabaseError(error);
  }
}

export async function updateVariant(productId, variantId, changes) {
  const columns = {
    sku: "sku",
    name: "name",
    unitPrice: "unit_price",
    isActive: "is_active"
  };
  const values = [];
  const assignments = Object.entries(changes).map(([field, value]) => {
    values.push(value);
    return `${columns[field]} = $${values.length}`;
  });
  assignments.push("updated_at = now()");
  values.push(productId, variantId);

  try {
    const result = await pool.query(
      `UPDATE public.product_variants
       SET ${assignments.join(", ")}
       WHERE product_id = $${values.length - 1}
         AND variant_id = $${values.length}
       RETURNING variant_id`,
      values
    );
    if (result.rowCount === 0) return null;
    return findAdminVariant(productId, result.rows[0].variant_id);
  } catch (error) {
    throw translateDatabaseError(error);
  }
}

export { mapVariant };