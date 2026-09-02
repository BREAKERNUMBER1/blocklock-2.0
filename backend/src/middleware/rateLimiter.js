import rateLimit from "express-rate-limit";

// 50 attempts per IP per minute — relaxed for testing
export const unlockLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 50,
  handler: (_req, res) => {
    res.status(429).json({
      error: "Too many requests. Please wait a minute before trying again.",
    });
  },
  standardHeaders: true,
  legacyHeaders: false,
});
