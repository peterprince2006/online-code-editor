/* eslint-disable no-restricted-globals */
self.onmessage = async (event) => {
  const { type, payload } = event.data || {};
  if (type !== "lint") return;

  const { html = "", css = "", js = "", options = {} } = payload;
  const results = { html: [], css: [], js: [] };

  try {
    // ---------- HTML Lint (regex-based) ----------
    const htmlErrors = [];
    if (!html.includes("<") || !html.includes(">")) {
      htmlErrors.push({
        message: "HTML seems empty or invalid (no tags found)",
        severity: "warning",
        line: 1,
        column: 1,
      });
    }

    const tagPattern = /<([a-zA-Z]+)(\s[^>]*)?>/g;
    const closingTagPattern = /<\/([a-zA-Z]+)>/g;
    const openTags = [...html.matchAll(tagPattern)].map(m => m[1]);
    const closedTags = [...html.matchAll(closingTagPattern)].map(m => m[1]);
    const unclosed = openTags.filter(tag => !closedTags.includes(tag));

    if (unclosed.length > 0) {
      htmlErrors.push({
        message: `Unclosed tag(s): ${unclosed.join(", ")}`,
        severity: "error",
        line: 1,
        column: 1,
      });
    }

    results.html = htmlErrors;

    // ---------- CSS Lint ----------
    const cssErrors = [];
    if (css.includes(";;")) {
      cssErrors.push({
        message: "Double semicolon found",
        severity: "warning",
        line: css.split(";;")[0].split("\n").length,
        column: 1,
      });
    }
    results.css = cssErrors;

    // ---------- JS Lint ----------
    if (options.jshint) {
      try {
        importScripts("https://cdnjs.cloudflare.com/ajax/libs/jshint/2.13.6/jshint.min.js");
        JSHINT(js);
        results.js = JSHINT.errors.map((e) => ({
          message: e?.reason || "Unknown JS issue",
          severity: "error",
          line: e?.line || 0,
          column: e?.character || 0,
        }));
      } catch (e) {
        results.js = [{ message: "JSHint failed to run", severity: "error", line: 0, column: 0 }];
      }
    }
  } catch (err) {
    console.error("Lint worker error:", err);
  }

  self.postMessage({ type: "results", payload: results });
};
