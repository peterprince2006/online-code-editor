// server/src/routes/project.js
import express from "express";
import Project from "../models/Project.js";
import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

// ✅ Save or update project
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
    console.error("Save error:", err);
    res.status(500).json({ msg: "Server error" });
  }
});

// ✅ Load a project
router.get("/:name", authMiddleware, async (req, res) => {
  try {
    const project = await Project.findOne({
      userId: req.user.id,
      name: req.params.name,
    });
    if (!project) return res.status(404).json({ msg: "Project not found" });
    res.json(project);
  } catch (err) {
    console.error("Load error:", err);
    res.status(500).json({ msg: "Server error" });
  }
});

// ✅ List all project names
router.get("/", authMiddleware, async (req, res) => {
  try {
    const projects = await Project.find({ userId: req.user.id }).select("name");
    res.json(projects.map((p) => p.name));
  } catch (err) {
    console.error("List error:", err);
    res.status(500).json({ msg: "Server error" });
  }
});

// ✅ NEW: Delete a project by name
router.delete("/:name", authMiddleware, async (req, res) => {
  try {
    const { name } = req.params;
    const deleted = await Project.findOneAndDelete({ userId: req.user.id, name });
    if (!deleted) return res.status(404).json({ msg: "Project not found" });
    res.json({ msg: `Deleted project "${name}"` });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({ msg: "Server error" });
  }
});

// ✅ NEW: Rename a project
router.post("/rename", authMiddleware, async (req, res) => {
  try {
    const { oldName, newName } = req.body;
    if (!oldName || !newName)
      return res.status(400).json({ msg: "Old and new project names are required" });

    const project = await Project.findOne({ userId: req.user.id, name: oldName });
    if (!project) return res.status(404).json({ msg: "Project not found" });

    // Check if target name already exists
    const existing = await Project.findOne({ userId: req.user.id, name: newName });
    if (existing) return res.status(400).json({ msg: "A project with that name already exists" });

    project.name = newName;
    await project.save();

    res.json({ msg: `Renamed "${oldName}" → "${newName}"`, project });
  } catch (err) {
    console.error("Rename error:", err);
    res.status(500).json({ msg: "Server error" });
  }
});

export default router;
