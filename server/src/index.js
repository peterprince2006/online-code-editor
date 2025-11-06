// server/src/index.js
import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import connectDB from "./config/db.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Connect DB
connectDB();

// Routes
import authRoutes from "./routes/auth.js";
import projectRoutes from "./routes/project.js";

app.use("/api/auth", authRoutes);
app.use("/api/projects", projectRoutes);

// Simple test route
app.get("/api/test", (req, res) => res.json({ msg: "Server up" }));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
