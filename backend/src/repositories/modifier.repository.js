import pool from "../db/pool.js";
import { ApiError } from "../errors/api-error.js";

const modifierSelection = `
  modifier_id,
  modifier_group_id,
  name,
  price_adjustment::text AS price_adjustment,
  is_active
`;

function mapModifier(row) {
  if (!row) return null;
  return {
    id: row.modifier_id,
    modifierGroupId: row.modifier_group_id,
    name: row.name,
    priceAdjustment: row.price_adjustment,
    isActive: row.is_active
  };
}

function translateDatabaseError(error) {
  if (error.code === "23505" && error.constraint === "modifiers_group_name_unique") {
    return new ApiError(409, "DUPLICATE_MODIFIER_NAME", "A modifier with this name already exists in the group.");
  }
  if (error.code === "23503" && error.constraint === "modifiers_modifier_group_id_fkey") {
    return new ApiError(404, "MODIFIER_GROUP_NOT_FOUND", "Modifier group not found.");
  }
  if (error.code === "23514" && error.constraint === "modifiers_price_adjustment_check") {
    return new ApiError(422, "INVALID_PRICE_ADJUSTMENT", "priceAdjustment must be zero or greater under the current database constraint.");
  }
  if (error.code === "22003") {
    return new ApiError(422, "INVALID_PRICE_ADJUSTMENT", "priceAdjustment exceeds the supported range.");
  }
  return error;
}

export async function listPublicModifiers({ groupId, limit, cursor }) {
  const values = [groupId];
  let cursorCondition = "";
  if (cursor) {
    values.push(cursor.value, cursor.id);
    cursorCondition = "AND (name > $2 OR (name = $2 AND modifier_id > $3))";
  }
  values.push(limit + 1);
  const result = await pool.query(
    `SELECT ${modifierSelection}
     FROM public.modifiers
     WHERE modifier_group_id = $1 AND is_active = true
       ${cursorCondition}
     ORDER BY name ASC, modifier_id ASC
     LIMIT $${values.length}`,
    values
  );
  return { rows: result.rows, hasMore: result.rows.length > limit };
}

export async function findPublicModifier(groupId, modifierId) {
  const result = await pool.query(
    `SELECT ${modifierSelection}
     FROM public.modifiers
     WHERE modifier_group_id = $1 AND modifier_id = $2 AND is_active = true`,
    [groupId, modifierId]
  );
  return mapModifier(result.rows[0]);
}

export async function listAdminModifiers({ groupId, isActive, search, direction, limit, cursor }) {
  const values = [groupId];
  const conditions = ["modifier_group_id = $1"];
  const bind = (value) => {
    values.push(value);
    return `$${values.length}`;
  };

  if (isActive !== undefined) {
    conditions.push(`is_active = ${bind(isActive)}`);
  }
  if (search) {
    conditions.push(`name ILIKE ${bind(`%${search}%`)}`);
  }
  if (cursor) {
    const comparison = direction === "asc" ? ">" : "<";
    const name = bind(cursor.value);
    const modifierId = bind(cursor.id);
    conditions.push(`(name ${comparison} ${name} OR (name = ${name} AND modifier_id ${comparison} ${modifierId}))`);
  }

  const limitParameter = bind(limit + 1);
  const order = direction.toUpperCase();
  const result = await pool.query(
    `SELECT ${modifierSelection}
     FROM public.modifiers
     WHERE ${conditions.join(" AND ")}
     ORDER BY name ${order}, modifier_id ${order}
     LIMIT ${limitParameter}`,
    values
  );
  return {
    rows: result.rows,
    hasMore: result.rows.length > limit
  };
}

export async function findAdminModifier(groupId, modifierId) {
  const result = await pool.query(
    `SELECT ${modifierSelection}
     FROM public.modifiers
     WHERE modifier_group_id = $1 AND modifier_id = $2`,
    [groupId, modifierId]
  );
  return mapModifier(result.rows[0]);
}

export async function createModifier(groupId, modifier) {
  try {
    const result = await pool.query(
      `INSERT INTO public.modifiers (modifier_group_id, name, price_adjustment, is_active)
       VALUES ($1, $2, $3, $4)
       RETURNING ${modifierSelection}`,
      [groupId, modifier.name, modifier.priceAdjustment, modifier.isActive]
    );
    return mapModifier(result.rows[0]);
  } catch (error) {
    throw translateDatabaseError(error);
  }
}

export async function updateModifier(groupId, modifierId, changes) {
  const columns = {
    name: "name",
    priceAdjustment: "price_adjustment",
    isActive: "is_active"
  };
  const values = [];
  const assignments = Object.entries(changes).map(([field, value]) => {
    values.push(value);
    return `${columns[field]} = $${values.length}`;
  });
  values.push(groupId, modifierId);

  try {
    const result = await pool.query(
      `UPDATE public.modifiers
       SET ${assignments.join(", ")}
       WHERE modifier_group_id = $${values.length - 1}
         AND modifier_id = $${values.length}
       RETURNING ${modifierSelection}`,
      values
    );
    return mapModifier(result.rows[0]);
  } catch (error) {
    throw translateDatabaseError(error);
  }
}

export { mapModifier };