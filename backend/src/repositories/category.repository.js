import pool from "../db/pool.js";
import { ApiError } from "../errors/api-error.js";
import { publicCategoryCondition } from "./catalog-visibility.js";

const categoryColumns = `
  category_id,
  parent_category_id,
  slug,
  name,
  display_order,
  is_active,
  created_at,
  updated_at
`;

const sortColumns = {
  displayOrder: "c.display_order",
  name: "c.name",
  createdAt: "c.created_at"
};

function mapCategory(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.category_id,
    parentCategoryId: row.parent_category_id,
    slug: row.slug,
    name: row.name,
    displayOrder: row.display_order,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function translateDatabaseError(error) {
  if (error.code === "23505" && error.constraint === "menu_categories_slug_unique") {
    return new ApiError(409, "DUPLICATE_CATEGORY_SLUG", "A category with this slug already exists.");
  }

  if (error.code === "23503" && error.constraint === "menu_categories_parent_category_id_fkey") {
    return new ApiError(422, "INVALID_PARENT_CATEGORY", "The parent category does not exist.");
  }

  return error;
}

function publicVisibilityCondition(alias) {
  return `${publicCategoryCondition(alias)}
    AND EXISTS (
      SELECT 1
      FROM public.products p
      JOIN public.product_variants v ON v.product_id = p.product_id
      WHERE p.category_id = ${alias}.category_id
        AND p.is_active = true
        AND v.is_active = true
    )`;
}

export async function listCategories({ publicOnly, isActive, search, sort, direction, limit, cursor }) {
  const values = [];
  const conditions = [];
  const bind = (value) => {
    values.push(value);
    return `$${values.length}`;
  };

  if (publicOnly) {
    conditions.push(publicVisibilityCondition("c"));
  }
  if (isActive !== undefined) {
    conditions.push(`c.is_active = ${bind(isActive)}`);
  }
  if (search) {
    conditions.push(`c.name ILIKE ${bind(`%${search}%`)}`);
  }
  if (cursor) {
    const sortColumn = sortColumns[sort];
    const comparison = direction === "asc" ? ">" : "<";
    const sortValue = bind(cursor.value);
    const categoryId = bind(cursor.id);
    conditions.push(
      `(${sortColumn} ${comparison} ${sortValue} OR (${sortColumn} = ${sortValue} AND c.category_id ${comparison} ${categoryId}))`
    );
  }

  const limitParameter = bind(limit + 1);
  const order = direction.toUpperCase();
  const query = `
    SELECT ${categoryColumns.split(",").map((column) => `c.${column.trim()}`).join(", ")}
    FROM public.menu_categories c
    ${conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""}
    ORDER BY ${sortColumns[sort]} ${order}, c.category_id ${order}
    LIMIT ${limitParameter}
  `;

  const result = await pool.query(query, values);
  return {
    rows: result.rows,
    hasMore: result.rows.length > limit
  };
}

export async function findPublicCategoryById(categoryId) {
  const result = await pool.query(
    `SELECT ${categoryColumns}
     FROM public.menu_categories
     WHERE category_id = $1
       AND ${publicVisibilityCondition("menu_categories")}`,
    [categoryId]
  );
  return mapCategory(result.rows[0]);
}

export async function findAdminCategoryById(categoryId) {
  const result = await pool.query(
    `SELECT ${categoryColumns}
     FROM public.menu_categories
     WHERE category_id = $1`,
    [categoryId]
  );
  return mapCategory(result.rows[0]);
}

export async function createCategory(category) {
  try {
    const result = await pool.query(
      `INSERT INTO public.menu_categories
         (parent_category_id, slug, name, display_order, is_active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${categoryColumns}`,
      [category.parentCategoryId, category.slug, category.name, category.displayOrder, category.isActive]
    );
    return mapCategory(result.rows[0]);
  } catch (error) {
    throw translateDatabaseError(error);
  }
}

export async function updateCategory(categoryId, changes) {
  const client = await pool.connect();
  let transactionOpen = false;

  try {
    await client.query("BEGIN");
    transactionOpen = true;

    if (Object.hasOwn(changes, "parentCategoryId")) {
      await client.query("LOCK TABLE public.menu_categories IN SHARE ROW EXCLUSIVE MODE");
    }

    const current = await client.query(
      "SELECT category_id FROM public.menu_categories WHERE category_id = $1",
      [categoryId]
    );
    if (current.rowCount === 0) {
      throw new ApiError(404, "CATEGORY_NOT_FOUND", "Category not found.");
    }

    if (Object.hasOwn(changes, "parentCategoryId") && changes.parentCategoryId !== null) {
      const parent = await client.query(
        "SELECT category_id FROM public.menu_categories WHERE category_id = $1",
        [changes.parentCategoryId]
      );
      if (parent.rowCount === 0) {
        throw new ApiError(422, "INVALID_PARENT_CATEGORY", "The parent category does not exist.");
      }

      if (changes.parentCategoryId === categoryId) {
        throw new ApiError(409, "CATEGORY_PARENT_CONFLICT", "A category cannot be its own parent.");
      }

      const descendants = await client.query(
        `WITH RECURSIVE descendants(category_id) AS (
           SELECT category_id
           FROM public.menu_categories
           WHERE category_id = $1
           UNION
           SELECT child.category_id
           FROM public.menu_categories child
           JOIN descendants parent ON child.parent_category_id = parent.category_id
         )
         SELECT EXISTS (
           SELECT 1 FROM descendants WHERE category_id = $2
         ) AS would_create_cycle`,
        [categoryId, changes.parentCategoryId]
      );
      if (descendants.rows[0].would_create_cycle) {
        throw new ApiError(409, "CATEGORY_PARENT_CONFLICT", "The parent change would create a category cycle.");
      }
    }

    const columns = {
      name: "name",
      slug: "slug",
      parentCategoryId: "parent_category_id",
      displayOrder: "display_order",
      isActive: "is_active"
    };
    const values = [];
    const assignments = Object.entries(changes).map(([field, value]) => {
      values.push(value);
      return `${columns[field]} = $${values.length}`;
    });
    assignments.push("updated_at = now()");
    values.push(categoryId);

    const result = await client.query(
      `UPDATE public.menu_categories
       SET ${assignments.join(", ")}
       WHERE category_id = $${values.length}
       RETURNING ${categoryColumns}`,
      values
    );

    await client.query("COMMIT");
    transactionOpen = false;
    return mapCategory(result.rows[0]);
  } catch (error) {
    if (transactionOpen) {
      await client.query("ROLLBACK");
    }
    throw translateDatabaseError(error);
  } finally {
    client.release();
  }
}

export async function parentCategoryExists(categoryId) {
  const result = await pool.query(
    "SELECT EXISTS (SELECT 1 FROM public.menu_categories WHERE category_id = $1) AS found",
    [categoryId]
  );
  return result.rows[0].found;
}

export { mapCategory };