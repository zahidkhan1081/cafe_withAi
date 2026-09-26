import { Router } from "express";

const router = Router();

router.get("/health", (_request, response) => {
  response.status(200).json({
    status: "ok",
    message: "API is running"
  });
});

export default router;