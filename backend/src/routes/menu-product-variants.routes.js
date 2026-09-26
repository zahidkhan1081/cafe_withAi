import { Router } from "express";
import * as variantController from "../controllers/product-variant.controller.js";

const router = Router();

router.get("/:productId/variants", variantController.listPublicVariants);
router.get("/:productId/variants/:variantId", variantController.getPublicVariant);

export default router;