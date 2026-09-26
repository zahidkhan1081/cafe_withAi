import express from "express";
import { errorHandler } from "./middleware/error-handler.js";
import adminMenuCategoriesRouter from "./routes/admin-menu-categories.routes.js";
import adminProductsRouter from "./routes/admin-products.routes.js";
import adminProductVariantsRouter from "./routes/admin-product-variants.routes.js";
import adminModifierGroupsRouter from "./routes/admin-modifier-groups.routes.js";
import adminModifiersRouter from "./routes/admin-modifiers.routes.js";
import databaseHealthRouter from "./routes/database-health.routes.js";
import healthRouter from "./routes/health.routes.js";
import menuCategoriesRouter from "./routes/menu-categories.routes.js";
import menuProductsRouter from "./routes/menu-products.routes.js";
import menuProductVariantsRouter from "./routes/menu-product-variants.routes.js";
import menuModifierGroupsRouter from "./routes/menu-modifier-groups.routes.js";
import menuModifiersRouter from "./routes/menu-modifiers.routes.js";

const app = express();

app.use(express.json({ limit: "100kb" }));
app.use("/api", healthRouter);
app.use("/api/health/database", databaseHealthRouter);
app.use("/api/menu/categories", menuCategoriesRouter);
app.use("/api/admin/menu-categories", adminMenuCategoriesRouter);
app.use("/api/menu/products", menuProductsRouter);
app.use("/api/admin/products", adminProductsRouter);
app.use("/api/menu/products", menuProductVariantsRouter);
app.use("/api/admin/products", adminProductVariantsRouter);
app.use("/api/menu/products", menuModifierGroupsRouter);
app.use("/api/admin/products", adminModifierGroupsRouter);
app.use("/api/menu/products", menuModifiersRouter);
app.use("/api/admin/products", adminModifiersRouter);
app.use(errorHandler);

export default app;