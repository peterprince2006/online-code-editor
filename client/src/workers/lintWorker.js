// client/src/workers/lintWorker.js
importScripts("https://cdn.jsdelivr.net/npm/jshint@2.13.4/dist/jshint.min.js");
importScripts("https://cdn.jsdelivr.net/npm/csslint@1.0.5/dist/csslint.js");

self.onmessage = (e) => {
  const { type, payload } = e.data;
  if (type !== "lint") return;

  const { html, css, js, options } = payload;
  const results = { html: [], css: [], js: [] };

  try {
    // JS Lint
    if (options?.jshint && js?.trim()) {
      JSHINT(js);
      results.js = JSHINT.errors
        .filter(Boolean)
        .map((e) => ({
          line: e.line,
          column: e.character,
          message: e.reason,
          severity: "error",
        }));
    }

    // CSS Lint
    if (css?.trim()) {
      const cssResults = CSSLint.verify(css);
      results.css = cssResults.messages.map((m) => ({
        line: m.line,
        column: m.col,
        message: m.message,
        severity: m.type,
      }));
    }
  } catch (err) {
    console.error("Lint worker error:", err);
  }

  self.postMessage({ type: "results", payload: results });
};
