// server/src/middleware/socketAuth.js
const jwt = require("jsonwebtoken");

function socketAuth(socket, next) {
  try {
    // token expected to be passed as query param: ?token=Bearer <token>
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) return next(new Error("Authentication error: Token missing"));

    // token can be "Bearer <token>" or raw
    const raw = token.startsWith("Bearer ") ? token.split(" ")[1] : token;
    const decoded = jwt.verify(raw, process.env.JWT_SECRET);
    socket.user = decoded; // attach user payload (e.g., { id: ... })
    return next();
  } catch (err) {
    return next(new Error("Authentication error: Invalid token"));
  }
}

module.exports = socketAuth;
