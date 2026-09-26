import { Router } from "express";
import * as groupController from "../controllers/modifier-group.controller.js";

// Authorization boundary: require catalog:read/catalog:write once authentication is implemented.
const router = Router();

router.get("/:productId/modifier-groups", groupController.listAdminGroups);
router.post("/:productId/modifier-groups", groupController.createGroup);
router.get("/:productId/modifier-groups/:groupId", groupController.getAdminGroup);
router.patch("/:productId/modifier-groups/:groupId", groupController.updateGroup);

export default router;