// client/src/components/Preview.jsx
import React, { useEffect, useRef } from "react";

export default function Preview({ html, css, js }) {
  const iframeRef = useRef(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width,initial-scale=1" />
          <style>${css || ""}</style>
        </head>
        <body>${html || ""}</body>
      </html>
    `);
    doc.close();

    // Wait for the iframe to fully load
    iframe.onload = () => {
      const scriptConsoleHook = doc.createElement("script");
      scriptConsoleHook.innerHTML = `
        (function() {
          const send = (level, ...args) => {
            try {
              window.parent.postMessage({ type: 'console', level, message: args }, '*');
            } catch(e) {}
          };
          const oldLog = console.log;
          const oldWarn = console.warn;
          const oldError = console.error;
          console.log = (...args) => { send('log', ...args); oldLog(...args); };
          console.warn = (...args) => { send('warn', ...args); oldWarn(...args); };
          console.error = (...args) => { send('error', ...args); oldError(...args); };
          window.onerror = function(msg, src, line, col, err) {
            send('error', msg + ' (' + src + ':' + line + ')');
          };
        })();
      `;
      doc.body.appendChild(scriptConsoleHook);

      // Inject user JS safely
      if (js && js.trim().length > 0) {
        const userScript = doc.createElement("script");
        userScript.type = "text/javascript";
        userScript.innerHTML = `
          try {
            ${js}
          } catch(err) {
            window.parent.postMessage({ type: 'console', level: 'error', message: [err.message] }, '*');
          }
        `;
        doc.body.appendChild(userScript);
      }
    };
  }, [html, css, js]);

  return (
    <iframe
      ref={iframeRef}
      title="Live Preview"
      className="w-full h-96 bg-white rounded border border-gray-700"
    />
  );
}
