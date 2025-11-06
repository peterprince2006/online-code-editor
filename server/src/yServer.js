// server/src/yServer.js
import { WebSocketServer } from "ws";
import http from "http";
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

// Fix for Node 22 (allows requiring CommonJS module internals)
const require = createRequire(import.meta.url);

// 🔥 Manually resolve full path to utils.js (bypasses subpath export error)
const utilsPath = path.resolve(
  "node_modules/y-websocket/bin/utils.js"
);
const { setupWSConnection } = require(utilsPath);

const PORT = process.env.Y_PORT || 1234;
const server = http.createServer();
const wss = new WebSocketServer({ server });

wss.on("connection", (conn, req) => {
  const room = req.url.slice(1).split("?")[0] || "default-room";
  console.log(`🔗 New Yjs client connected → Room: ${room}`);
  setupWSConnection(conn, req, { docName: room });
});

server.listen(PORT, () => {
  console.log(`🧠 Yjs WebSocket Server running on ws://localhost:${PORT}`);
});
