import { Router } from "express";
import pool from "../db/pool.js";

const router = Router();

router.get("/", async (_request, response) => {
  try {
    await pool.query("SELECT 1");
    response.status(200).json({
      status: "ok",
      database: "connected"
    });
  } catch {
    response.status(503).json({
      status: "error",
      database: "unavailable"
    });
  }
});

export default router;