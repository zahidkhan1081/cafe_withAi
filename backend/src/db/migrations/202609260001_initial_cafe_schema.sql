-- Up Migration

CREATE TABLE public.users (
  user_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  password_hash text,
  account_status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_email_normalized_check CHECK (email = lower(btrim(email))),
  CONSTRAINT users_account_status_check CHECK (account_status IN ('active', 'inactive', 'locked')),
  CONSTRAINT users_email_unique UNIQUE (email)
);

CREATE TABLE public.customers (
  customer_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE REFERENCES public.users(user_id) ON DELETE SET NULL,
  first_name text NOT NULL,
  last_name text,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.staff_members (
  staff_member_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES public.users(user_id) ON DELETE RESTRICT,
  employee_number text NOT NULL,
  employment_status text NOT NULL DEFAULT 'active',
  hired_at date,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_employee_number_normalized_check CHECK (employee_number = upper(btrim(employee_number))),
  CONSTRAINT staff_employee_number_unique UNIQUE (employee_number),
  CONSTRAINT staff_employment_status_check CHECK (employment_status IN ('active', 'inactive', 'terminated'))
);

CREATE TABLE public.roles (
  role_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_code text NOT NULL UNIQUE,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.permissions (
  permission_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  permission_code text NOT NULL UNIQUE,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.user_roles (
  user_id uuid NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES public.roles(role_id) ON DELETE CASCADE,
  assigned_by_user_id uuid REFERENCES public.users(user_id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE public.role_permissions (
  role_id uuid NOT NULL REFERENCES public.roles(role_id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES public.permissions(permission_id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE public.menu_categories (
  category_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_category_id uuid REFERENCES public.menu_categories(category_id) ON DELETE RESTRICT,
  slug text NOT NULL,
  name text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT menu_categories_slug_normalized_check CHECK (slug = lower(btrim(slug))),
  CONSTRAINT menu_categories_slug_unique UNIQUE (slug),
  CONSTRAINT menu_categories_display_order_check CHECK (display_order >= 0),
  CONSTRAINT menu_categories_not_own_parent_check CHECK (parent_category_id IS DISTINCT FROM category_id)
);

CREATE TABLE public.products (
  product_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.menu_categories(category_id) ON DELETE RESTRICT,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.product_variants (
  variant_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(product_id) ON DELETE RESTRICT,
  sku text NOT NULL,
  name text NOT NULL,
  unit_price numeric(12, 2) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_variants_sku_normalized_check CHECK (sku = upper(btrim(sku))),
  CONSTRAINT product_variants_sku_unique UNIQUE (sku),
  CONSTRAINT product_variants_product_name_unique UNIQUE (product_id, name),
  CONSTRAINT product_variants_price_check CHECK (unit_price >= 0)
);

CREATE TABLE public.modifier_groups (
  modifier_group_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(product_id) ON DELETE RESTRICT,
  name text NOT NULL,
  min_selections integer NOT NULL DEFAULT 0,
  max_selections integer NOT NULL DEFAULT 1,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  CONSTRAINT modifier_groups_product_name_unique UNIQUE (product_id, name),
  CONSTRAINT modifier_groups_selection_limits_check CHECK (
    min_selections >= 0 AND max_selections >= 1 AND min_selections <= max_selections
  ),
  CONSTRAINT modifier_groups_display_order_check CHECK (display_order >= 0)
);

CREATE TABLE public.inventory_items (
  inventory_item_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text UNIQUE,
  name text NOT NULL,
  unit_of_measure text NOT NULL,
  reorder_threshold numeric(12, 3) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_items_sku_normalized_check CHECK (sku IS NULL OR sku = upper(btrim(sku))),
  CONSTRAINT inventory_items_reorder_threshold_check CHECK (reorder_threshold >= 0)
);

CREATE TABLE public.modifiers (
  modifier_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modifier_group_id uuid NOT NULL REFERENCES public.modifier_groups(modifier_group_id) ON DELETE RESTRICT,
  name text NOT NULL,
  price_adjustment numeric(12, 2) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT modifiers_group_name_unique UNIQUE (modifier_group_id, name),
  CONSTRAINT modifiers_price_adjustment_check CHECK (price_adjustment >= 0)
);

CREATE TABLE public.modifier_inventory_effects (
  modifier_inventory_effect_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modifier_id uuid NOT NULL REFERENCES public.modifiers(modifier_id) ON DELETE RESTRICT,
  inventory_item_id uuid NOT NULL REFERENCES public.inventory_items(inventory_item_id) ON DELETE RESTRICT,
  quantity_delta_per_selection numeric(12, 3) NOT NULL,
  CONSTRAINT modifier_inventory_effects_modifier_item_unique UNIQUE (modifier_id, inventory_item_id),
  CONSTRAINT modifier_inventory_effects_nonzero_check CHECK (quantity_delta_per_selection <> 0)
);

CREATE TABLE public.cafe_tables (
  cafe_table_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_number text NOT NULL UNIQUE,
  seating_capacity integer NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  CONSTRAINT cafe_tables_seating_capacity_check CHECK (seating_capacity > 0)
);

CREATE TABLE public.orders (
  order_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  customer_id uuid REFERENCES public.customers(customer_id) ON DELETE SET NULL,
  created_by_staff_member_id uuid REFERENCES public.staff_members(staff_member_id) ON DELETE SET NULL,
  cafe_table_id uuid REFERENCES public.cafe_tables(cafe_table_id) ON DELETE RESTRICT,
  order_type text NOT NULL,
  status text NOT NULL DEFAULT 'placed',
  contact_name_snapshot text,
  contact_email_snapshot text,
  contact_phone_snapshot text,
  currency_code char(3) NOT NULL,
  subtotal_amount numeric(12, 2) NOT NULL DEFAULT 0,
  tax_amount numeric(12, 2) NOT NULL DEFAULT 0,
  discount_amount numeric(12, 2) NOT NULL DEFAULT 0,
  total_amount numeric(12, 2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orders_type_check CHECK (order_type IN ('dine_in', 'takeaway', 'delivery')),
  CONSTRAINT orders_status_check CHECK (status IN ('placed', 'accepted', 'preparing', 'ready', 'completed', 'cancelled')),
  CONSTRAINT orders_currency_code_check CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT orders_amounts_nonnegative_check CHECK (
    subtotal_amount >= 0 AND tax_amount >= 0 AND discount_amount >= 0 AND total_amount >= 0
  ),
  CONSTRAINT orders_discount_limit_check CHECK (discount_amount <= subtotal_amount + tax_amount),
  CONSTRAINT orders_table_type_check CHECK (order_type = 'dine_in' OR cafe_table_id IS NULL)
);

CREATE TABLE public.order_delivery_details (
  order_id uuid PRIMARY KEY REFERENCES public.orders(order_id) ON DELETE RESTRICT,
  recipient_name_snapshot text,
  recipient_phone_snapshot text,
  address_line1_snapshot text NOT NULL,
  address_line2_snapshot text,
  city_snapshot text NOT NULL,
  region_snapshot text,
  postal_code_snapshot text,
  country_code_snapshot char(2) NOT NULL,
  delivery_instructions text,
  delivery_fee numeric(12, 2) NOT NULL DEFAULT 0,
  CONSTRAINT order_delivery_country_code_check CHECK (country_code_snapshot ~ '^[A-Z]{2}$'),
  CONSTRAINT order_delivery_fee_check CHECK (delivery_fee >= 0)
);

CREATE TABLE public.order_items (
  order_item_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(order_id) ON DELETE RESTRICT,
  variant_id uuid NOT NULL REFERENCES public.product_variants(variant_id) ON DELETE RESTRICT,
  product_name_snapshot text NOT NULL,
  variant_name_snapshot text NOT NULL,
  sku_snapshot text NOT NULL,
  quantity integer NOT NULL,
  unit_price_snapshot numeric(12, 2) NOT NULL,
  line_total_snapshot numeric(12, 2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_items_quantity_check CHECK (quantity > 0),
  CONSTRAINT order_items_prices_check CHECK (unit_price_snapshot >= 0 AND line_total_snapshot >= 0)
);

CREATE TABLE public.order_item_modifiers (
  order_item_modifier_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id uuid NOT NULL REFERENCES public.order_items(order_item_id) ON DELETE RESTRICT,
  modifier_id uuid NOT NULL REFERENCES public.modifiers(modifier_id) ON DELETE RESTRICT,
  modifier_name_snapshot text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  unit_price_adjustment_snapshot numeric(12, 2) NOT NULL,
  CONSTRAINT order_item_modifiers_quantity_check CHECK (quantity > 0),
  CONSTRAINT order_item_modifiers_price_check CHECK (unit_price_adjustment_snapshot >= 0)
);

CREATE TABLE public.order_status_history (
  order_status_history_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(order_id) ON DELETE RESTRICT,
  previous_status text,
  new_status text NOT NULL,
  changed_by_staff_member_id uuid REFERENCES public.staff_members(staff_member_id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  note text,
  CONSTRAINT order_status_history_previous_check CHECK (
    previous_status IS NULL OR previous_status IN ('placed', 'accepted', 'preparing', 'ready', 'completed', 'cancelled')
  ),
  CONSTRAINT order_status_history_new_check CHECK (
    new_status IN ('placed', 'accepted', 'preparing', 'ready', 'completed', 'cancelled')
  ),
  CONSTRAINT order_status_history_change_check CHECK (previous_status IS DISTINCT FROM new_status)
);

CREATE TABLE public.payments (
  payment_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(order_id) ON DELETE RESTRICT,
  provider text NOT NULL,
  payment_method text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  amount numeric(12, 2) NOT NULL,
  currency_code char(3) NOT NULL,
  provider_reference text,
  idempotency_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payments_status_check CHECK (
    status IN ('pending', 'authorized', 'captured', 'failed', 'cancelled', 'partially_refunded', 'refunded')
  ),
  CONSTRAINT payments_amount_check CHECK (amount > 0),
  CONSTRAINT payments_currency_code_check CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT payments_provider_reference_unique UNIQUE (provider, provider_reference)
);

CREATE TABLE public.payment_refunds (
  payment_refund_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.payments(payment_id) ON DELETE RESTRICT,
  provider_reference text,
  status text NOT NULL DEFAULT 'pending',
  amount numeric(12, 2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_refunds_status_check CHECK (status IN ('pending', 'succeeded', 'failed', 'cancelled')),
  CONSTRAINT payment_refunds_amount_check CHECK (amount > 0),
  CONSTRAINT payment_refunds_provider_reference_unique UNIQUE (payment_id, provider_reference)
);

CREATE TABLE public.variant_recipes (
  variant_recipe_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id uuid NOT NULL UNIQUE REFERENCES public.product_variants(variant_id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.recipe_components (
  recipe_component_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_recipe_id uuid NOT NULL REFERENCES public.variant_recipes(variant_recipe_id) ON DELETE RESTRICT,
  inventory_item_id uuid NOT NULL REFERENCES public.inventory_items(inventory_item_id) ON DELETE RESTRICT,
  quantity_per_variant numeric(12, 3) NOT NULL,
  CONSTRAINT recipe_components_recipe_item_unique UNIQUE (variant_recipe_id, inventory_item_id),
  CONSTRAINT recipe_components_quantity_check CHECK (quantity_per_variant > 0)
);

CREATE TABLE public.inventory_movements (
  inventory_movement_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id uuid NOT NULL REFERENCES public.inventory_items(inventory_item_id) ON DELETE RESTRICT,
  movement_type text NOT NULL,
  quantity_delta numeric(12, 3) NOT NULL,
  order_item_id uuid REFERENCES public.order_items(order_item_id) ON DELETE RESTRICT,
  recorded_by_staff_member_id uuid REFERENCES public.staff_members(staff_member_id) ON DELETE SET NULL,
  idempotency_key text UNIQUE,
  note text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_movements_type_check CHECK (
    movement_type IN ('receipt', 'adjustment', 'order_consumption', 'waste', 'return')
  ),
  CONSTRAINT inventory_movements_quantity_sign_check CHECK (
    quantity_delta <> 0 AND
    (movement_type IN ('receipt', 'return') AND quantity_delta > 0 OR
     movement_type IN ('order_consumption', 'waste') AND quantity_delta < 0 OR
     movement_type = 'adjustment')
  ),
  CONSTRAINT inventory_movements_consumption_order_item_check CHECK (
    movement_type <> 'order_consumption' OR order_item_id IS NOT NULL
  )
);

CREATE INDEX menu_categories_parent_idx ON public.menu_categories(parent_category_id);
CREATE INDEX products_category_active_idx ON public.products(category_id, is_active);
CREATE INDEX product_variants_product_active_idx ON public.product_variants(product_id, is_active);
CREATE INDEX modifier_groups_product_active_idx ON public.modifier_groups(product_id, is_active);
CREATE INDEX modifiers_group_active_idx ON public.modifiers(modifier_group_id, is_active);
CREATE INDEX modifier_inventory_effects_inventory_item_idx ON public.modifier_inventory_effects(inventory_item_id);
CREATE INDEX user_roles_role_idx ON public.user_roles(role_id);
CREATE INDEX role_permissions_permission_idx ON public.role_permissions(permission_id);
CREATE INDEX orders_status_created_idx ON public.orders(status, created_at DESC);
CREATE INDEX orders_type_created_idx ON public.orders(order_type, created_at DESC);
CREATE INDEX orders_customer_created_idx ON public.orders(customer_id, created_at DESC);
CREATE INDEX orders_staff_created_idx ON public.orders(created_by_staff_member_id, created_at DESC);
CREATE INDEX orders_cafe_table_idx ON public.orders(cafe_table_id);
CREATE INDEX order_items_order_idx ON public.order_items(order_id);
CREATE INDEX order_items_variant_idx ON public.order_items(variant_id);
CREATE INDEX order_item_modifiers_item_idx ON public.order_item_modifiers(order_item_id);
CREATE INDEX order_item_modifiers_modifier_idx ON public.order_item_modifiers(modifier_id);
CREATE INDEX order_status_history_order_time_idx ON public.order_status_history(order_id, changed_at);
CREATE INDEX order_status_history_staff_idx ON public.order_status_history(changed_by_staff_member_id);
CREATE INDEX payments_order_created_idx ON public.payments(order_id, created_at DESC);
CREATE INDEX payments_status_created_idx ON public.payments(status, created_at DESC);
CREATE INDEX payment_refunds_payment_idx ON public.payment_refunds(payment_id);
CREATE INDEX recipe_components_inventory_item_idx ON public.recipe_components(inventory_item_id);
CREATE INDEX inventory_movements_item_time_idx ON public.inventory_movements(inventory_item_id, occurred_at DESC);
CREATE INDEX inventory_movements_order_item_idx ON public.inventory_movements(order_item_id);
CREATE INDEX inventory_movements_staff_idx ON public.inventory_movements(recorded_by_staff_member_id);

-- Down Migration

DROP TABLE public.inventory_movements;
DROP TABLE public.recipe_components;
DROP TABLE public.variant_recipes;
DROP TABLE public.payment_refunds;
DROP TABLE public.payments;
DROP TABLE public.order_status_history;
DROP TABLE public.order_item_modifiers;
DROP TABLE public.order_items;
DROP TABLE public.order_delivery_details;
DROP TABLE public.orders;
DROP TABLE public.cafe_tables;
DROP TABLE public.modifier_inventory_effects;
DROP TABLE public.modifiers;
DROP TABLE public.inventory_items;
DROP TABLE public.modifier_groups;
DROP TABLE public.product_variants;
DROP TABLE public.products;
DROP TABLE public.menu_categories;
DROP TABLE public.role_permissions;
DROP TABLE public.user_roles;
DROP TABLE public.permissions;
DROP TABLE public.roles;
DROP TABLE public.staff_members;
DROP TABLE public.customers;
DROP TABLE public.users;