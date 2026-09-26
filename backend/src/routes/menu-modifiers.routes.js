import { Router } from "express";
import * as modifierController from "../controllers/modifier.controller.js";

const router = Router();

router.get(
  "/:productId/modifier-groups/:groupId/modifiers",
  modifierController.listPublicModifiers
);
router.get(
  "/:productId/modifier-groups/:groupId/modifiers/:modifierId",
  modifierController.getPublicModifier
);

export default router;