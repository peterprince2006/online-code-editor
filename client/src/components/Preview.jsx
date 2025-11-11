// client/src/components/Preview.jsx
import React, { useEffect, useRef } from "react";

export default function Preview({ html = "", css = "", js = "" }) {
  const iframeRef = useRef(null);
  const urlRef = useRef(null);

  useEffect(() => {
    // sanitize user input slightly: ensure strings are present
    const safeHtml = String(html || "");
    const safeCss = String(css || "");
    const safeJs = String(js || "");

    // Build the full HTML document that will run inside the iframe.
    // Use a wrapper for console forwarding and a try/catch around user JS.
    const doc = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'self' 'unsafe-inline' data: blob:;">
    <style>
      /* user CSS */
      ${safeCss}
    </style>
  </head>
  <body>
    <!-- user HTML -->
    ${safeHtml}

    <script>
      // forward console messages to parent
      (function () {
        const levels = ["log","info","warn","error"];
        levels.forEach(l => {
          const orig = console[l];
          console[l] = function(...args){
            try {
              window.parent.postMessage({ type: "console", level: l, message: args }, "*");
            } catch(e) {}
            try { orig.apply(console, args); } catch(e) {}
          };
        });
      })();

      // run user JS safely
      (function(){
        try {
          ${safeJs.replace(/<\/script>/gi, "<\\/script>")}
        } catch (err) {
          try { window.parent.postMessage({ type: "console", level: "error", message: ["Preview runtime error:", String(err)] }, "*"); } catch(e) {}
          // also log locally so developer can inspect inside iframe
          console.error(err);
        }
      })();
    </script>
  </body>
</html>`;

    // create blob URL to avoid srcdoc escaping issues and 404s
    try {
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
      const blob = new Blob([doc], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      if (iframeRef.current) iframeRef.current.src = url;
    } catch (err) {
      // fallback: use srcdoc (with escaped closing tags)
      const escaped = doc.replace(/<\/script>/gi, "<\\/script>");
      if (iframeRef.current) iframeRef.current.srcdoc = escaped;
    }

    return () => {
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    };
  }, [html, css, js]);

  return (
    <iframe
      title="live-preview"
      ref={iframeRef}
      sandbox="allow-scripts allow-same-origin allow-modals"
      style={{ width: "100%", height: 400, border: "none", background: "white" }}
    />
  );
}
