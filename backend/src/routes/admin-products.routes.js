import { Router } from "express";
import * as productController from "../controllers/product.controller.js";

// Authorization boundary: require catalog:read/catalog:write once authentication is implemented.
const router = Router();

router.get("/", productController.listAdminProducts);
router.post("/", productController.createProduct);
router.get("/:productId", productController.getAdminProduct);
router.patch("/:productId", productController.updateProduct);

export default router;