import pool from "../db/pool.js";
import { ApiError } from "../errors/api-error.js";
import { publicCategoryCondition } from "./catalog-visibility.js";

const activeVariantExists = `EXISTS (
  SELECT 1
  FROM public.product_variants v
  WHERE v.product_id = p.product_id AND v.is_active = true
)`;

const productSelection = `
  p.product_id,
  p.category_id,
  p.name,
  p.description,
  p.is_active,
  p.created_at,
  p.updated_at,
  c.name AS category_name,
  c.slug AS category_slug,
  c.is_active AS category_is_active,
  ${activeVariantExists} AS has_active_variant
`;

const sortColumns = {
  name: "p.name",
  createdAt: "p.created_at",
  categoryName: "c.name"
};

function mapProduct(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.product_id,
    categoryId: row.category_id,
    name: row.name,
    description: row.description,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    category: {
      id: row.category_id,
      name: row.category_name,
      slug: row.category_slug,
      isActive: row.category_is_active
    },
    hasActiveVariant: row.has_active_variant
  };
}

function translateDatabaseError(error) {
  if (error.code === "23503" && error.constraint === "products_category_id_fkey") {
    return new ApiError(422, "INVALID_CATEGORY", "The selected category does not exist.", [
      { field: "categoryId", code: "not_found", message: "Choose an existing category." }
    ]);
  }
  if (error.code === "23505") {
    return new ApiError(409, "PRODUCT_CONFLICT", "The product conflicts with an existing record.");
  }
  return error;
}

export async function categoryExists(categoryId) {
  const result = await pool.query(
    "SELECT EXISTS (SELECT 1 FROM public.menu_categories WHERE category_id = $1) AS found",
    [categoryId]
  );
  return result.rows[0].found;
}

export async function listProducts({
  publicOnly,
  categoryId,
  isActive,
  hasActiveVariant,
  search,
  sort,
  direction,
  limit,
  cursor
}) {
  const values = [];
  const conditions = [];
  const bind = (value) => {
    values.push(value);
    return `$${values.length}`;
  };

  if (publicOnly) {
    conditions.push("p.is_active = true", publicCategoryCondition("c"), activeVariantExists);
  }
  if (categoryId) {
    conditions.push(`p.category_id = ${bind(categoryId)}`);
  }
  if (isActive !== undefined) {
    conditions.push(`p.is_active = ${bind(isActive)}`);
  }
  if (hasActiveVariant !== undefined) {
    conditions.push(`${hasActiveVariant ? "" : "NOT "}${activeVariantExists}`);
  }
  if (search) {
    const searchParameter = bind(`%${search}%`);
    conditions.push(`(p.name ILIKE ${searchParameter} OR COALESCE(p.description, '') ILIKE ${searchParameter})`);
  }
  if (cursor) {
    const sortColumn = sortColumns[sort];
    const comparison = direction === "asc" ? ">" : "<";
    const sortValue = bind(cursor.value);
    const productId = bind(cursor.id);
    conditions.push(
      `(${sortColumn} ${comparison} ${sortValue} OR (${sortColumn} = ${sortValue} AND p.product_id ${comparison} ${productId}))`
    );
  }

  const limitParameter = bind(limit + 1);
  const order = direction.toUpperCase();
  const result = await pool.query(
    `SELECT ${productSelection}
     FROM public.products p
     JOIN public.menu_categories c ON c.category_id = p.category_id
     ${conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""}
     ORDER BY ${sortColumns[sort]} ${order}, p.product_id ${order}
     LIMIT ${limitParameter}`,
    values
  );

  return {
    rows: result.rows,
    hasMore: result.rows.length > limit
  };
}

export async function findPublicProductById(productId) {
  const result = await pool.query(
    `SELECT ${productSelection}
     FROM public.products p
     JOIN public.menu_categories c ON c.category_id = p.category_id
     WHERE p.product_id = $1
       AND p.is_active = true
      AND ${publicCategoryCondition("c")}
       AND ${activeVariantExists}`,
    [productId]
  );
  return mapProduct(result.rows[0]);
}

export async function findAdminProductById(productId) {
  const result = await pool.query(
    `SELECT ${productSelection}
     FROM public.products p
     JOIN public.menu_categories c ON c.category_id = p.category_id
     WHERE p.product_id = $1`,
    [productId]
  );
  return mapProduct(result.rows[0]);
}

export async function createProduct(product) {
  try {
    const inserted = await pool.query(
      `INSERT INTO public.products (category_id, name, description, is_active)
       VALUES ($1, $2, $3, $4)
       RETURNING product_id`,
      [product.categoryId, product.name, product.description, product.isActive]
    );
    return findAdminProductById(inserted.rows[0].product_id);
  } catch (error) {
    throw translateDatabaseError(error);
  }
}

export async function updateProduct(productId, changes) {
  const columns = {
    categoryId: "category_id",
    name: "name",
    description: "description",
    isActive: "is_active"
  };
  const values = [];
  const assignments = Object.entries(changes).map(([field, value]) => {
    values.push(value);
    return `${columns[field]} = $${values.length}`;
  });
  assignments.push("updated_at = now()");
  values.push(productId);

  try {
    const result = await pool.query(
      `UPDATE public.products
       SET ${assignments.join(", ")}
       WHERE product_id = $${values.length}
       RETURNING product_id`,
      values
    );
    if (result.rowCount === 0) {
      return null;
    }
    return findAdminProductById(result.rows[0].product_id);
  } catch (error) {
    throw translateDatabaseError(error);
  }
}

export { mapProduct };