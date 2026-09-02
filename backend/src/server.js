import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { unlockRouter } from "./routes/unlockRouter.js";
import { connectMQTT } from "./services/mqttService.js";
import { initAuditLog } from "./services/auditLog.js";

const app = express();

// Nginx sits in front of this app and sets X-Forwarded-For; without this,
// express-rate-limit throws ERR_ERL_UNEXPECTED_X_FORWARDED_FOR on every
// request instead of rate-limiting by real client IP.
app.set("trust proxy", 1);

app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    methods: ["GET", "POST"],
  })
);
app.use(express.json());

// Health check
app.get("/health", (_req, res) => res.json({ status: "ok", service: "blocklock-litvm-api" }));

app.use("/api", unlockRouter);

// Global error handler
app.use((err, _req, res, _next) => {
  console.error("[ERROR]", err.message);
  res.status(500).json({ error: "Internal server error" });
});

async function start() {
  try {
    await initAuditLog();
    console.log("[DB] Audit log database ready.");

    await connectMQTT();
    console.log("[MQTT] Connected to broker.");

    const port = process.env.PORT || 3001;
    app.listen(port, () => {
      console.log(`[API] BlockLock API running on port ${port}`);
    });
  } catch (err) {
    console.error("[FATAL] Startup failed:", err);
    process.exit(1);
  }
}

start();
