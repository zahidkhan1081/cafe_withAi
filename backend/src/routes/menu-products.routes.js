import { Router } from "express";
import * as productController from "../controllers/product.controller.js";

const router = Router();

router.get("/", productController.listPublicProducts);
router.get("/:productId", productController.getPublicProduct);

export default router;