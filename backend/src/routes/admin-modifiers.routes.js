import { Router } from "express";
import * as modifierController from "../controllers/modifier.controller.js";

// Authorization boundary: require catalog:read/catalog:write once authentication is implemented.
const router = Router();

router.get(
  "/:productId/modifier-groups/:groupId/modifiers",
  modifierController.listAdminModifiers
);
router.post(
  "/:productId/modifier-groups/:groupId/modifiers",
  modifierController.createModifier
);
router.get(
  "/:productId/modifier-groups/:groupId/modifiers/:modifierId",
  modifierController.getAdminModifier
);
router.patch(
  "/:productId/modifier-groups/:groupId/modifiers/:modifierId",
  modifierController.updateModifier
);

export default router;