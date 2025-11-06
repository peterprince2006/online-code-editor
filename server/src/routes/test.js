const express = require("express");
const router = express.Router();

router.get("/ping", (req, res) => {
  res.json({ ok: true, msg: "pong from backend server" });
});

module.exports = router;


