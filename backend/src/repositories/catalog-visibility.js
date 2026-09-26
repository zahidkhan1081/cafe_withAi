export function publicCategoryCondition(alias) {
  return `${alias}.is_active = true
    AND NOT EXISTS (
      WITH RECURSIVE ancestor_ids(category_id) AS (
        SELECT ${alias}.parent_category_id
        WHERE ${alias}.parent_category_id IS NOT NULL
        UNION
        SELECT parent.parent_category_id
        FROM public.menu_categories parent
        JOIN ancestor_ids child ON parent.category_id = child.category_id
        WHERE parent.parent_category_id IS NOT NULL
      )
      SELECT 1
      FROM ancestor_ids ancestor_id
      JOIN public.menu_categories ancestor ON ancestor.category_id = ancestor_id.category_id
      WHERE ancestor.is_active = false
    )`;
}