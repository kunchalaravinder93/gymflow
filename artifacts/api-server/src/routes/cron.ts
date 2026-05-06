import { Router, type Request, type Response } from "express";
import { runExpiryCheck } from "../lib/cron";
import { logger } from "../lib/logger";

const router = Router();

router.get("/cron/check-expiry", async (req: Request, res: Response) => {
  // Verify cron secret if provided by Vercel
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    logger.warn("Unauthorized cron attempt");
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    logger.info("Starting manual expiry check via cron endpoint");
    await runExpiryCheck();
    res.json({ success: true, message: "Expiry check completed" });
  } catch (error) {
    logger.error({ error }, "Error running expiry check via cron");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
