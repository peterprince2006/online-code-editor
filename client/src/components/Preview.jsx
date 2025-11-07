// client/src/components/Preview.jsx
import React, { useEffect, useState } from "react";

export default function Preview({ html, css, js }) {
  const [srcDoc, setSrcDoc] = useState("");

  useEffect(() => {
    const captureScript = `
      <script>
        (function() {
          const send = (level, ...args) => {
            parent.postMessage({ type: 'console', level, message: args }, '*');
          };

          const original = {
            log: console.log,
            warn: console.warn,
            error: console.error,
            clear: console.clear
          };

          console.log = (...args) => { send('log', ...args); original.log(...args); };
          console.warn = (...args) => { send('warn', ...args); original.warn(...args); };
          console.error = (...args) => { send('error', ...args); original.error(...args); };
          console.clear = () => { send('clear'); original.clear(); };

          window.onerror = function(msg, src, line, col, err) {
            send('error', msg + ' (' + src + ':' + line + ')');
          };
        })();
      <\/script>
    `;

    const fullHTML = `
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width,initial-scale=1" />
          <style>${css || ""}</style>
        </head>
        <body>
          ${html || ""}
          ${captureScript}
          <script>${js || ""}<\/script>
        </body>
      </html>
    `;

    setSrcDoc(fullHTML);
  }, [html, css, js]);

  return (
    <iframe
      srcDoc={srcDoc}
      title="Live Preview"
      sandbox="allow-scripts"
      className="w-full h-96 bg-white rounded"
    />
  );
}
