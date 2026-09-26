import { Router } from "express";
import * as groupController from "../controllers/modifier-group.controller.js";

const router = Router();

router.get("/:productId/modifier-groups", groupController.listPublicGroups);
router.get("/:productId/modifier-groups/:groupId", groupController.getPublicGroup);

export default router;