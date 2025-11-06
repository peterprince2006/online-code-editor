// server/src/routes/project.js
import express from "express";
import Project from "../models/Project.js";
import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

// Save or update project
router.post("/save", authMiddleware, async (req, res) => {
  try {
    const { name, html, css, js } = req.body;
    if (!name) return res.status(400).json({ msg: "Project name required" });

    let project = await Project.findOne({ userId: req.user.id, name });

    if (project) {
      project.html = html || "";
      project.css = css || "";
      project.js = js || "";
      project.updatedAt = Date.now();
      await project.save();
    } else {
      project = await Project.create({
        userId: req.user.id,
        name,
        html,
        css,
        js,
      });
    }

    res.json({ msg: "Project saved successfully", project });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

// Load a project
router.get("/:name", authMiddleware, async (req, res) => {
  try {
    const project = await Project.findOne({
      userId: req.user.id,
      name: req.params.name,
    });
    if (!project) return res.status(404).json({ msg: "Project not found" });
    res.json(project);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

// List project names
router.get("/", authMiddleware, async (req, res) => {
  try {
    const projects = await Project.find({ userId: req.user.id }).select("name");
    res.json(projects.map((p) => p.name));
  } catch (err) {
    res.status(500).json({ msg: "Server error" });
  }
});

export default router;
