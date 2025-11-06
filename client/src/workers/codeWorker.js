self.onmessage = (e) => {
  const { html = "", css = "", js = "" } = e.data || {};
  const content = `
    <html>
      <head><style>${css}</style></head>
      <body>${html}<script>${js}<\/script></body>
    </html>
  `;
  self.postMessage(content);
};
