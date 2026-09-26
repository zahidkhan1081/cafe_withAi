import { Router } from "express";
import * as variantController from "../controllers/product-variant.controller.js";

// Authorization boundary: require catalog:read/catalog:write once authentication is implemented.
const router = Router();

router.get("/:productId/variants", variantController.listAdminVariants);
router.post("/:productId/variants", variantController.createVariant);
router.get("/:productId/variants/:variantId", variantController.getAdminVariant);
router.patch("/:productId/variants/:variantId", variantController.updateVariant);

export default router;