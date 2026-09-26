import { Router } from "express";
import * as categoryController from "../controllers/category.controller.js";

const router = Router();

router.get("/", categoryController.listPublicCategories);
router.get("/:categoryId", categoryController.getPublicCategory);

export default router;