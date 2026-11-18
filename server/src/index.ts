import dns from "node:dns";
dns.setServers(["8.8.8.8", "1.1.1.1"]);
import "dotenv/config";
import express from "express";
import mongoose from "mongoose";

const app = express();
app.use(express.json());

// Health check: tells us the server and database are working
app.get("/api/health", (_req, res) => {
  const states = ["disconnected", "connected", "connecting", "disconnecting"];
  res.json({
    status: "ok",
    db: states[mongoose.connection.readyState] ?? "unknown",
  });
});

const PORT = Number(process.env.PORT) || 4000;
const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI is missing in .env");

mongoose
  .connect(uri)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB error:", err.message));

app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));