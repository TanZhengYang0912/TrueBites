import express from "express";
import cors from "cors";
import "dotenv/config";
import mapRoutes        from "./routes/map.js";
import authRoutes       from "./routes/auth.js";
import vendorRoutes     from "./routes/vendors.js";
import aiRoutes         from "./routes/ai.js";
import engagementRoutes from "./routes/engagement.js";
import adminRoutes      from "./routes/admin.js";
import adminSuggestionRoutes from "./routes/adminSuggestions.js";
import suggestionRoutes from "./routes/suggestions.js";
import { requireRole }  from "./middleware/requireRole.js";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.use("/api", mapRoutes);
app.use("/api", authRoutes);
app.use("/api", vendorRoutes);
app.use("/api", aiRoutes);
app.use("/api", engagementRoutes);
app.use("/api", suggestionRoutes);
// Every admin route requires a verified admin session (skipped only when
// DISABLE_AUTH=true for local testing — see middleware/requireRole.js).
app.use("/api/admin", requireRole("admin"), adminRoutes);
app.use("/api/admin", requireRole("admin"), adminSuggestionRoutes);

app.listen(PORT, () => {
  console.log(`✅  TrueBites backend running on http://localhost:${PORT}`);
  if (!process.env.GOOGLE_API_KEY) {
    console.warn("⚠️  GOOGLE_API_KEY is missing — geocoding and directions will fail.");
  }
});
