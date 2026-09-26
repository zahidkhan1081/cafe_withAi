import { Router } from "express";
import * as categoryController from "../controllers/category.controller.js";

// Authorization boundary: require catalog:read/catalog:write once authentication is implemented.
const router = Router();

router.get("/", categoryController.listAdminCategories);
router.post("/", categoryController.createCategory);
router.get("/:categoryId", categoryController.getAdminCategory);
router.patch("/:categoryId", categoryController.updateCategory);

export default router;