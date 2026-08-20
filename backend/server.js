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
import { startOutputsSweeper, reconcileAfterRestart } from "./lib/ai/jobStore.js";
import { OUTPUTS_DIR } from "./lib/ai/downloader.js";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.use("/api", mapRoutes);
app.use("/api", authRoutes);
app.use("/api", vendorRoutes);
app.use("/api", engagementRoutes);
app.use("/api", suggestionRoutes);
// Every admin route requires a verified admin session (skipped only when
// DISABLE_AUTH=true for local testing — see middleware/requireRole.js).
app.use("/api/admin", requireRole("admin"), adminRoutes);
app.use("/api/admin", requireRole("admin"), adminSuggestionRoutes);
// AI processing (video download, transcription, summarization, frame
// extraction) — admin-only. Previously a separate unauthenticated Python
// service the browser could reach directly; folding it in here closes that
// gap as part of the same move.
app.use("/api/ai", requireRole("admin"), aiRoutes);
// Extracted frame/audio/transcript artifacts — same public exposure as the
// old Python service's StaticFiles mount (job dirs hold nothing secret,
// and <img> previews in the admin panel need to fetch these unauthenticated).
app.use("/outputs", express.static(OUTPUTS_DIR));

app.listen(PORT, async () => {
  console.log(`✅  TrueBites backend running on http://localhost:${PORT}`);
  if (!process.env.GOOGLE_API_KEY) {
    console.warn("⚠️  GOOGLE_API_KEY is missing — geocoding and directions will fail.");
  }
  if (!process.env.GROQ_API_KEY) {
    console.warn("⚠️  GROQ_API_KEY is missing — AI transcription/summarization will fail.");
  }
  await reconcileAfterRestart();
  startOutputsSweeper();
});
