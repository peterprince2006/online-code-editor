// server/src/socket/collaboration.js
const Project = require("../models/Project");

// keep per-project timers and buffers
const saveTimers = new Map();   // projectId -> timeoutId
const latestBuffers = new Map(); // projectId -> { html, css, js }

function scheduleSave(projectId, delay = 5000) {
  // clear existing timer
  if (saveTimers.has(projectId)) {
    clearTimeout(saveTimers.get(projectId));
  }

  const timeoutId = setTimeout(async () => {
    try {
      const buf = latestBuffers.get(projectId);
      if (!buf) return;

      // find an existing project for this id and update, otherwise skip
      const project = await Project.findById(projectId);
      if (project) {
        project.html = buf.html || "";
        project.css = buf.css || "";
        project.js = buf.js || "";
        await project.save();
        console.log(`Auto-saved project ${projectId} @ ${new Date().toISOString()}`);
      } else {
        // optional: create a new project if you want autosave even before explicit save
        // await Project.create({ title: 'autosave', userId: ..., ...});
        console.log(`Auto-save: project ${projectId} not found, skipped`);
      }
    } catch (err) {
      console.error("Auto-save failed:", err);
    } finally {
      saveTimers.delete(projectId);
      latestBuffers.delete(projectId);
    }
  }, delay);

  saveTimers.set(projectId, timeoutId);
}

function collaborationHandler(io, socket) {
  socket.on("join-room", ({ projectId }) => {
    if (!projectId) return;
    socket.join(projectId);
    socket.emit("joined", { projectId });
    socket.to(projectId).emit("request-sync", { requesterId: socket.id });
  });

  socket.on("leave-room", ({ projectId }) => {
    if (!projectId) return;
    socket.leave(projectId);
  });

  // When clients send full content snapshots
  socket.on("code-change", ({ projectId, html, css, js }) => {
    if (!projectId) return;

    // broadcast to the room (except sender)
    socket.to(projectId).emit("remote-code-change", {
      from: socket.id,
      html,
      css,
      js,
      timestamp: Date.now(),
    });

    // update in-memory buffer and schedule an autosave
    latestBuffers.set(projectId, { html, css, js });
    scheduleSave(projectId, 5000); // 5s debounce before saving to DB
  });

  socket.on("sync-code", ({ projectId, html, css, js }) => {
    if (!projectId) return;
    io.in(projectId).emit("remote-code-sync", { html, css, js });
  });

  socket.on("disconnect", () => {
    // Optionally flush pending timers for sockets that were editing
    // but keep autosave timers running; they will persist buffers as scheduled.
  });
}

module.exports = collaborationHandler;
