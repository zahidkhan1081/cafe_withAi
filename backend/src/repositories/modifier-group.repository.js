import pool from "../db/pool.js";
import { ApiError } from "../errors/api-error.js";

const groupSelection = `
  modifier_group_id,
  product_id,
  name,
  min_selections,
  max_selections,
  display_order,
  is_active
`;

const sortColumns = {
  name: "mg.name",
  displayOrder: "mg.display_order"
};

function mapGroup(row) {
  if (!row) return null;
  return {
    id: row.modifier_group_id,
    productId: row.product_id,
    name: row.name,
    minSelections: row.min_selections,
    maxSelections: row.max_selections,
    displayOrder: row.display_order,
    isActive: row.is_active
  };
}

function translateDatabaseError(error) {
  if (error.code === "23505" && error.constraint === "modifier_groups_product_name_unique") {
    return new ApiError(409, "DUPLICATE_MODIFIER_GROUP_NAME", "A modifier group with this name already exists for the product.");
  }
  if (error.code === "23503" && error.constraint === "modifier_groups_product_id_fkey") {
    return new ApiError(404, "PRODUCT_NOT_FOUND", "Product not found.");
  }
  if (error.code === "23514" && error.constraint === "modifier_groups_selection_limits_check") {
    return new ApiError(422, "INVALID_SELECTION_LIMITS", "Selection limits must satisfy 0 <= minSelections <= maxSelections and maxSelections >= 1.");
  }
  if (error.code === "23514" && error.constraint === "modifier_groups_display_order_check") {
    return new ApiError(422, "INVALID_DISPLAY_ORDER", "displayOrder must be a nonnegative integer.");
  }
  return error;
}

export async function listPublicGroups({ productId, limit, cursor }) {
  const values = [productId];
  let cursorCondition = "";
  if (cursor) {
    values.push(cursor.value, cursor.id);
    cursorCondition = `AND (display_order > $2 OR (display_order = $2 AND modifier_group_id > $3))`;
  }
  values.push(limit + 1);
  const result = await pool.query(
    `SELECT ${groupSelection}
     FROM public.modifier_groups
     WHERE product_id = $1 AND is_active = true
       ${cursorCondition}
     ORDER BY display_order ASC, modifier_group_id ASC
     LIMIT $${values.length}`,
    values
  );
  return { rows: result.rows, hasMore: result.rows.length > limit };
}

export async function findPublicGroup(productId, groupId) {
  const result = await pool.query(
    `SELECT ${groupSelection}
     FROM public.modifier_groups
     WHERE product_id = $1 AND modifier_group_id = $2 AND is_active = true`,
    [productId, groupId]
  );
  return mapGroup(result.rows[0]);
}

export async function listAdminGroups({ productId, isActive, search, sort, direction, limit, cursor }) {
  const values = [productId];
  const conditions = ["mg.product_id = $1"];
  const bind = (value) => {
    values.push(value);
    return `$${values.length}`;
  };

  if (isActive !== undefined) {
    conditions.push(`mg.is_active = ${bind(isActive)}`);
  }
  if (search) {
    conditions.push(`mg.name ILIKE ${bind(`%${search}%`)}`);
  }
  if (cursor) {
    const sortColumn = sortColumns[sort];
    const comparison = direction === "asc" ? ">" : "<";
    const sortValue = bind(cursor.value);
    const groupId = bind(cursor.id);
    conditions.push(
      `(${sortColumn} ${comparison} ${sortValue} OR (${sortColumn} = ${sortValue} AND mg.modifier_group_id ${comparison} ${groupId}))`
    );
  }

  const limitParameter = bind(limit + 1);
  const order = direction.toUpperCase();
  const result = await pool.query(
    `SELECT ${groupSelection.split(",").map((column) => `mg.${column.trim()}`).join(", ")}
     FROM public.modifier_groups mg
     WHERE ${conditions.join(" AND ")}
     ORDER BY ${sortColumns[sort]} ${order}, mg.modifier_group_id ${order}
     LIMIT ${limitParameter}`,
    values
  );
  return {
    rows: result.rows,
    hasMore: result.rows.length > limit
  };
}

export async function findAdminGroup(productId, groupId) {
  const result = await pool.query(
    `SELECT ${groupSelection}
     FROM public.modifier_groups
     WHERE product_id = $1 AND modifier_group_id = $2`,
    [productId, groupId]
  );
  return mapGroup(result.rows[0]);
}

export async function createGroup(productId, group) {
  try {
    const result = await pool.query(
      `INSERT INTO public.modifier_groups
         (product_id, name, min_selections, max_selections, display_order, is_active)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${groupSelection}`,
      [productId, group.name, group.minSelections, group.maxSelections, group.displayOrder, group.isActive]
    );
    return mapGroup(result.rows[0]);
  } catch (error) {
    throw translateDatabaseError(error);
  }
}

export async function updateGroup(productId, groupId, changes) {
  const columns = {
    name: "name",
    minSelections: "min_selections",
    maxSelections: "max_selections",
    displayOrder: "display_order",
    isActive: "is_active"
  };
  const values = [];
  const assignments = Object.entries(changes).map(([field, value]) => {
    values.push(value);
    return `${columns[field]} = $${values.length}`;
  });
  values.push(productId, groupId);

  try {
    const result = await pool.query(
      `UPDATE public.modifier_groups
       SET ${assignments.join(", ")}
       WHERE product_id = $${values.length - 1}
         AND modifier_group_id = $${values.length}
       RETURNING ${groupSelection}`,
      values
    );
    return mapGroup(result.rows[0]);
  } catch (error) {
    throw translateDatabaseError(error);
  }
}

export { mapGroup };