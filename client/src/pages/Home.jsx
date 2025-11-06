// client/src/pages/Home.jsx
import React, { useCallback, useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { yCollab } from "y-codemirror.next";
import { basicSetup } from "codemirror";
import { EditorView } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { javascript } from "@codemirror/lang-javascript";
import { html as htmlLang } from "@codemirror/lang-html";
import { css as cssLang } from "@codemirror/lang-css";
// themes
import { oneDark } from "@codemirror/theme-one-dark";
import { dracula } from "@uiw/codemirror-theme-dracula";
import { githubLight } from "@uiw/codemirror-theme-github";

// Preview component (you will paste/replace your Preview.jsx later)
// This component expects props: html, css, js
import Preview from "../components/Preview";

/**
 * Home.jsx — Main online code editor
 *
 * Features implemented:
 * - Local editors (CodeMirror): HTML / CSS / JS
 * - Yjs CRDT session start/stop using y-websocket
 * - Save / Load / Delete / Rename projects using /api routes
 * - Project list fetch + project manager modal
 * - Auto-save (interval)
 * - Lint scheduling hook (worker-based, optional)
 * - Console panel receiving postMessage from the iframe
 * - Theme selection
 *
 * Notes:
 * - This file is defensive: checks token presence and `viewsRef` before dispatches.
 * - Preview.jsx should post `postMessage({ type: 'console', level, message })` from the iframe (the version you later paste does that).
 */

// small debounce helper
function debounce(fn, wait = 300) {
  let t = null;
  return (...args) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

export default function Home() {
  // ---------- UI & state ----------
  const [projectId, setProjectId] = useState("");
  const [connected, setConnected] = useState(false);
  const [themeName, setThemeName] = useState("oneDark");
  const [enableJSHint, setEnableJSHint] = useState(false);

  // live code shown in preview (kept as React state)
  const [htmlCode, setHtmlCode] = useState("");
  const [cssCode, setCssCode] = useState("");
  const [jsCode, setJsCode] = useState("");

  // lint results (worker replies) - structure: { html: [], css: [], js: [] }
  const [lintResults, setLintResults] = useState({ html: [], css: [], js: [] });

  // projects list + manager modal
  const [projectsList, setProjectsList] = useState([]);
  const [isManagerOpen, setIsManagerOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [loadingProjects, setLoadingProjects] = useState(false);

  // console logs
  const [consoleLogs, setConsoleLogs] = useState([]);
  const consoleEndRef = useRef(null);

  // ---------- Theme object ----------
  const getTheme = useCallback(() => {
    if (themeName === "dracula") return dracula;
    if (themeName === "github") return githubLight;
    return oneDark;
  }, [themeName]);

  // ---------- refs for DOM / editor instances / Yjs ----------
  const editorDivs = useRef({ html: null, css: null, js: null });
  const viewsRef = useRef({ html: null, css: null, js: null });

  // Yjs references
  const ydocRef = useRef(null);
  const providerRef = useRef(null);
  const ytextRefs = useRef({ html: null, css: null, js: null });

  // worker refs (optional)
  const previewWorkerRef = useRef(null);
  const lintWorkerRef = useRef(null);

  // ---------- Initialize workers (optional; fails silently if unavailable) ----------
  useEffect(() => {
    // preview worker (optional) — used for heavy preview processing if you have it
    try {
      const w = new Worker(new URL("../workers/codeWorker.js", import.meta.url));
      w.onmessage = (ev) => {
        // not storing worker's html result; we use our React states for preview
        // This is a placeholder if you want to use worker output
      };
      previewWorkerRef.current = w;
    } catch (err) {
      previewWorkerRef.current = null;
      // Not fatal — preview will still use React state
    }

    // lint worker (optional)
    try {
      const lw = new Worker(new URL("../workers/lintWorker.js", import.meta.url));
      lw.onmessage = (ev) => {
        const d = ev.data;
        if (d?.type === "results" && d.payload) {
          setLintResults(d.payload);
        }
      };
      lintWorkerRef.current = lw;
    } catch (err) {
      lintWorkerRef.current = null;
    }

    return () => {
      previewWorkerRef.current?.terminate();
      lintWorkerRef.current?.terminate();
    };
  }, []);

  // ---------- Debounced posting to lint worker ----------
  const postLintDebounced = useRef(
    debounce((h, c, j, options) => {
      if (!lintWorkerRef.current) return;
      try {
        lintWorkerRef.current.postMessage({ type: "lint", payload: { html: h, css: c, js: j, options } });
      } catch (e) {
        // ignore
      }
    }, 350)
  ).current;

  // ---------- Preview helper ----------
  const sendPreview = (h, c, j) => {
    // update states used by Preview iframe
    setHtmlCode(h);
    setCssCode(c);
    setJsCode(j);

    // send to preview worker if present (optional)
    try {
      previewWorkerRef.current?.postMessage({ html: h, css: c, js: j });
    } catch (e) {}

    // schedule lint
    postLintDebounced(h, c, j, { jshint: enableJSHint });
  };

  // ---------- CodeMirror editor creation ----------
  const createLocalEditor = (slot, language, initial = "") => {
    // destroy old view
    if (viewsRef.current[slot]) {
      try { viewsRef.current[slot].destroy(); } catch (e) {}
      viewsRef.current[slot] = null;
    }

    const state = EditorState.create({
      doc: initial,
      extensions: [basicSetup, language, EditorView.lineWrapping, getTheme(), EditorView.editable.of(true)],
    });

    const view = new EditorView({
      state,
      parent: editorDivs.current[slot],
    });

    // override dispatch to react to changes and update preview
    view.dispatch = ((orig) => (tr) => {
      orig(tr);
      try {
        const h = viewsRef.current.html?.state.doc.toString() || "";
        const c = viewsRef.current.css?.state.doc.toString() || "";
        const j = viewsRef.current.js?.state.doc.toString() || "";
        sendPreview(h, c, j);
      } catch (err) {
        // swallow
      }
    })(view.dispatch);

    viewsRef.current[slot] = view;
    return view;
  };

  const createYjsEditor = (slot, ytext, language, provider, ydoc) => {
    if (viewsRef.current[slot]) {
      try { viewsRef.current[slot].destroy(); } catch (e) {}
      viewsRef.current[slot] = null;
    }
    if (!ytext || !provider) return null;
    const awareness = provider.awareness;
    const undoManager = new Y.UndoManager(ytext);

    const state = EditorState.create({
      doc: ytext.toString(),
      extensions: [
        basicSetup,
        language,
        yCollab(ytext, awareness, { undoManager }),
        EditorView.lineWrapping,
        getTheme(),
        EditorView.editable.of(true),
      ],
    });

    const view = new EditorView({
      state,
      parent: editorDivs.current[slot],
    });

    // update preview from Y doc
    const updateFromY = () => {
      try {
        const h = ydoc.getText("html").toString();
        const c = ydoc.getText("css").toString();
        const j = ydoc.getText("js").toString();
        sendPreview(h, c, j);
      } catch (err) {}
    };

    ytext.observeDeep(updateFromY);
    updateFromY();

    viewsRef.current[slot] = view;
    return view;
  };

  // ---------- Ensure local editors exist (on mount and on theme change) ----------
  const ensureLocalEditors = useCallback(() => {
    const prevHtml = viewsRef.current.html ? viewsRef.current.html.state.doc.toString() : "<h1>Hello World</h1>";
    const prevCss = viewsRef.current.css ? viewsRef.current.css.state.doc.toString() : "h1 { color: teal; }";
    const prevJs = viewsRef.current.js ? viewsRef.current.js.state.doc.toString() : "console.log('hello');";

    // destroy existing to ensure theme re-applies cleanly
    Object.values(viewsRef.current).forEach((v) => {
      try { v?.destroy(); } catch (e) {}
    });
    viewsRef.current = { html: null, css: null, js: null };

    createLocalEditor("html", htmlLang(), prevHtml);
    createLocalEditor("css", cssLang(), prevCss);
    createLocalEditor("js", javascript(), prevJs);

    // initial preview
    sendPreview(prevHtml, prevCss, prevJs);
  }, [getTheme]);

  useEffect(() => {
    ensureLocalEditors();
  }, []); // mount

  useEffect(() => {
    // re-create editors when theme changes. If Yjs is active, re-create Yjs editors instead.
    if (providerRef.current && ydocRef.current) {
      const ydoc = ydocRef.current;
      const provider = providerRef.current;
      const { html: yhtml, css: ycss, js: yjs } = ytextRefs.current;
      Object.values(viewsRef.current).forEach((v) => {
        try { v?.destroy(); } catch (e) {}
      });
      viewsRef.current = { html: null, css: null, js: null };
      createYjsEditor("html", yhtml, htmlLang(), provider, ydoc);
      createYjsEditor("css", ycss, cssLang(), provider, ydoc);
      createYjsEditor("js", yjs, javascript(), provider, ydoc);
    } else {
      // local editors
      const curHtml = viewsRef.current.html?.state.doc.toString() || "";
      const curCss = viewsRef.current.css?.state.doc.toString() || "";
      const curJs = viewsRef.current.js?.state.doc.toString() || "";
      Object.values(viewsRef.current).forEach((v) => {
        try { v?.destroy(); } catch (e) {}
      });
      viewsRef.current = { html: null, css: null, js: null };
      createLocalEditor("html", htmlLang(), curHtml);
      createLocalEditor("css", cssLang(), curCss);
      createLocalEditor("js", javascript(), curJs);
      sendPreview(curHtml, curCss, curJs);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [themeName]);

  // ---------- Yjs start/stop ----------
  const startYjs = async (room) => {
    if (!room) return alert("Enter a project/room ID");
    try {
      // cleanup previous
      try { providerRef.current?.destroy(); } catch (e) {}
      try { ydocRef.current?.destroy(); } catch (e) {}
    } catch (e) {}

    const ydoc = new Y.Doc();
    const provider = new WebsocketProvider("ws://localhost:1234", room, ydoc);

    ydocRef.current = ydoc;
    providerRef.current = provider;

    // texts
    const yhtml = ydoc.getText("html");
    const ycss = ydoc.getText("css");
    const yjs = ydoc.getText("js");
    ytextRefs.current = { html: yhtml, css: ycss, js: yjs };

    provider.on("status", (ev) => {
      setConnected(ev.status === "connected");
      if (ev.status === "connected") {
        // destroy any existing local views
        Object.values(viewsRef.current).forEach((v) => {
          try { v?.destroy(); } catch (e) {}
        });
        viewsRef.current = { html: null, css: null, js: null };

        // create Yjs editors
        createYjsEditor("html", yhtml, htmlLang(), provider, ydoc);
        createYjsEditor("css", ycss, cssLang(), provider, ydoc);
        createYjsEditor("js", yjs, javascript(), provider, ydoc);
      }
    });

    // if doc is empty, populate starter content
    if (yhtml.length === 0 && ycss.length === 0 && yjs.length === 0) {
      ydoc.transact(() => {
        yhtml.insert(0, "<h1>Hello from Yjs</h1>");
        ycss.insert(0, "h1 { color: teal; }");
        yjs.insert(0, "console.log('Yjs ready');");
      });
    }
  };

  const stopYjs = () => {
    try { providerRef.current?.destroy(); } catch (e) {}
    try { ydocRef.current?.destroy(); } catch (e) {}
    providerRef.current = null;
    ydocRef.current = null;
    ytextRefs.current = { html: null, css: null, js: null };
    setConnected(false);

    // recreate local editors with last content
    const lastHtml = viewsRef.current.html?.state.doc.toString() || htmlCode || "<h1>Hello World</h1>";
    const lastCss = viewsRef.current.css?.state.doc.toString() || cssCode || "h1 { color: teal; }";
    const lastJs = viewsRef.current.js?.state.doc.toString() || jsCode || "console.log('hello');";
    Object.values(viewsRef.current).forEach((v) => { try { v?.destroy(); } catch (e) {} });
    viewsRef.current = { html: null, css: null, js: null };
    createLocalEditor("html", htmlLang(), lastHtml);
    createLocalEditor("css", cssLang(), lastCss);
    createLocalEditor("js", javascript(), lastJs);
    sendPreview(lastHtml, lastCss, lastJs);
  };

  // ---------- Projects API helpers ----------
  async function fetchProjects() {
    const token = localStorage.getItem("token");
    setLoadingProjects(true);
    try {
      if (!token) {
        setProjectsList([]);
        setLoadingProjects(false);
        return;
      }
      const res = await fetch("http://localhost:5000/api/projects", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setProjectsList([]);
        setLoadingProjects(false);
        return;
      }
      const data = await res.json();
      if (Array.isArray(data)) setProjectsList(data);
    } catch (err) {
      console.error("fetchProjects error:", err);
      setProjectsList([]);
    } finally {
      setLoadingProjects(false);
    }
  }

  useEffect(() => {
    fetchProjects();
  }, []);

  // Save a project
  async function handleSave() {
    const token = localStorage.getItem("token");
    if (!token) return alert("Please log in first!");
    const name = projectId || prompt("Enter a project name:");
    if (!name) return;
    try {
      const res = await fetch("http://localhost:5000/api/projects/save", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name, html: htmlCode, css: cssCode, js: jsCode }),
      });
      const data = await res.json();
      if (res.ok) {
        await fetchProjects();
        setProjectId(name);
        alert("✅ Project saved successfully!");
        // update last-saved snapshot to avoid immediate auto-save
        window._lastSaved = { html: htmlCode, css: cssCode, js: jsCode };
      } else {
        alert("❌ Save failed: " + (data.msg || res.status));
      }
    } catch (err) {
      console.error("Save failed:", err);
      alert("❌ Save failed (network or server error).");
    }
  }

  // Load a project by name (or current projectId)
  async function handleLoad(nameParam) {
    const token = localStorage.getItem("token");
    if (!token) return alert("Please log in first!");
    const name = nameParam || projectId || prompt("Enter project name to load:");
    if (!name) return;
    try {
      const res = await fetch(`http://localhost:5000/api/projects/${encodeURIComponent(name)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 404) return alert("Project not found.");
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        return alert("Load failed: " + (d.msg || res.status));
      }
      const data = await res.json();

      // update states and editors
      const newHtml = data.html || "";
      const newCss = data.css || "";
      const newJs = data.js || "";

      setHtmlCode(newHtml);
      setCssCode(newCss);
      setJsCode(newJs);

      // patch views
      ["html", "css", "js"].forEach((slot) => {
        const view = viewsRef.current?.[slot];
        if (view) {
          const newContent = slot === "html" ? newHtml : slot === "css" ? newCss : newJs;
          try {
            view.dispatch({
              changes: {
                from: 0,
                to: view.state.doc.length,
                insert: newContent,
              },
            });
          } catch (err) {
            // if the view is bound to Yjs, let Yjs handle it (in CRDT session)
          }
        }
      });

      setProjectId(name);
      // schedule lint after load
      postLintDebounced(newHtml, newCss, newJs, { jshint: enableJSHint });
      alert("✅ Project loaded successfully!");
    } catch (err) {
      console.error("handleLoad error:", err);
      alert("❌ Load failed (see console).");
    }
  }

  // Delete project
  async function handleDelete(name) {
    if (!confirm(`Delete project "${name}"? This cannot be undone.`)) return;
    const token = localStorage.getItem("token");
    if (!token) return alert("Please log in first!");
    try {
      const res = await fetch(`http://localhost:5000/api/projects/${encodeURIComponent(name)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        alert(`🗑️ Deleted "${name}"`);
        await fetchProjects();
        if (projectId === name) setProjectId("");
      } else {
        const d = await res.json().catch(() => ({}));
        alert("Delete failed: " + (d.msg || res.status));
      }
    } catch (err) {
      console.error("Delete failed:", err);
      alert("Delete failed (see console).");
    }
  }

  // Rename project
  async function handleRename(oldName, newName) {
    if (!newName || newName.trim() === "") return alert("Enter a new name.");
    if (!confirm(`Rename "${oldName}" → "${newName}"?`)) return;
    const token = localStorage.getItem("token");
    if (!token) return alert("Please log in first!");
    try {
      const res = await fetch("http://localhost:5000/api/projects/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ oldName, newName }),
      });
      const d = await res.json();
      if (res.ok) {
        alert(`Renamed "${oldName}" → "${newName}"`);
        await fetchProjects();
        setRenameTarget(null);
        setRenameValue("");
        if (projectId === oldName) setProjectId(newName);
      } else {
        alert("Rename failed: " + (d.msg || res.status));
      }
    } catch (err) {
      console.error("Rename failed:", err);
      alert("Rename failed (see console).");
    }
  }

  // ---------- Auto-save (smart) ----------
  useEffect(() => {
    const interval = setInterval(async () => {
      const token = localStorage.getItem("token");
      if (!token || !projectId) return;
      window._lastSaved = window._lastSaved || { html: "", css: "", js: "" };
      const last = window._lastSaved;
      const current = { html: htmlCode, css: cssCode, js: jsCode };

      if (current.html === last.html && current.css === last.css && current.js === last.js) {
        return; // nothing changed
      }

      try {
        const res = await fetch("http://localhost:5000/api/projects/save", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ name: projectId, ...current }),
        });
        if (res.ok) {
          window._lastSaved = current;
          console.log(`[Auto-Save] ${projectId} @ ${new Date().toLocaleTimeString()}`);
        }
      } catch (err) {
        console.warn("Auto-save failed:", err);
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [projectId, htmlCode, cssCode, jsCode]);

  // ---------- Console listener: receive postMessage from preview iframe ----------
  useEffect(() => {
    const handler = (event) => {
      // Only accept messages from our own preview iframe OR from any origin if type matches
      const data = event.data;
      if (!data || data.type !== "console") return;

      // data: { type: 'console', level: 'log'|'error'|'warn', message: [args...] }
      const message = Array.isArray(data.message) ? data.message.map((m) => (typeof m === "object" ? JSON.stringify(m) : String(m))).join(" ") : String(data.message);
      const level = data.level || "log";
      const entry = { level, message, time: new Date().toLocaleTimeString() };
      setConsoleLogs((prev) => [...prev, entry]);
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  useEffect(() => {
    // auto scroll console to bottom
    if (consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [consoleLogs]);

  // ---------- small UI helpers ----------
  const clearConsole = () => setConsoleLogs([]);

  // ---------- Render ----------
  return (
    <div className="min-h-screen bg-gray-900 text-white p-4">
      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-center mb-4 gap-3">
        <div>
          <h1 className="text-2xl font-bold">Online Code Editor</h1>
          <p className="text-sm text-gray-400">
            Connection:{" "}
            <span className={connected ? "text-green-400" : "text-red-400"}>
              {connected ? "connected" : "disconnected"}
            </span>
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <select value={themeName} onChange={(e) => setThemeName(e.target.value)} className="bg-gray-800 text-white border border-gray-700 rounded px-2 py-1 text-sm">
            <option value="oneDark">One Dark</option>
            <option value="dracula">Dracula</option>
            <option value="github">GitHub Light</option>
          </select>

          <input placeholder="Project/room ID" value={projectId} onChange={(e) => setProjectId(e.target.value)} className="bg-gray-800 border border-gray-700 p-1 rounded text-sm" />

          {!connected ? (
            <button onClick={() => startYjs(projectId)} className="bg-green-600 hover:bg-green-700 px-3 py-1 rounded text-sm">Start CRDT</button>
          ) : (
            <button onClick={stopYjs} className="bg-red-600 hover:bg-red-700 px-3 py-1 rounded text-sm">Stop CRDT</button>
          )}

          <button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded text-sm">Save</button>

          <select
            value={projectId || ""}
            onChange={async (e) => {
              const n = e.target.value;
              if (!n) {
                setProjectId("");
                return;
              }
              setProjectId(n);
              await handleLoad(n);
            }}
            className="bg-gray-800 text-white border border-gray-700 rounded px-2 py-1 text-sm"
          >
            <option value="">Select Project</option>
            {projectsList.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          <button onClick={fetchProjects} className="bg-gray-800 border border-gray-700 px-2 py-1 rounded text-sm">Refresh</button>

          <button onClick={() => { fetchProjects(); setIsManagerOpen(true); }} className="bg-gray-800 border border-gray-700 px-2 py-1 rounded text-sm">Manage</button>

          <button onClick={() => handleLoad()} className="bg-yellow-500 hover:bg-yellow-600 px-3 py-1 rounded text-sm text-black">Load</button>

          <button
            onClick={() => {
              if (!projectId) return alert("Enter project name first");
              const share = `${window.location.origin}/share/${encodeURIComponent(projectId)}`;
              navigator.clipboard.writeText(share);
              alert(`Share link copied: ${share}`);
            }}
            className="bg-purple-600 hover:bg-purple-700 px-3 py-1 rounded text-sm"
          >
            Share
          </button>

          <label className="flex items-center gap-2 text-sm ml-2">
            <input type="checkbox" checked={enableJSHint} onChange={(e) => setEnableJSHint(e.target.checked)} />
            <span className="text-gray-300">JSHint</span>
          </label>
        </div>
      </header>

      {/* Editors grid with lint panels under each editor */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {["html", "css", "js"].map((lang) => {
          const results = lintResults[lang] || [];
          return (
            <div key={lang} className="flex flex-col border border-gray-700 rounded-lg overflow-hidden">
              <div className="bg-gray-800 p-2 text-sm font-semibold uppercase text-center">{lang.toUpperCase()}</div>

              <div ref={(el) => (editorDivs.current[lang] = el)} className="h-[300px] bg-gray-900 text-white overflow-y-auto rounded-b-lg"></div>

              <div className="bg-gray-950/30 p-2 border-t border-gray-800">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-xs text-gray-300">{results.length} issue(s)</div>
                  <div className="text-xs text-gray-400">Severity: error / warning</div>
                </div>
                <div className="max-h-28 overflow-auto">
                  {results.length === 0 ? (
                    <div className="text-xs text-gray-500">No issues</div>
                  ) : (
                    results.map((r, i) => (
                      <div key={i} className="text-xs p-1 mb-1 rounded bg-gray-900/40 flex items-start justify-between gap-2">
                        <div>
                          <div className={r.severity === "error" ? "text-red-300" : "text-yellow-300"}>{r.message}</div>
                          <div className="text-gray-400 text-[11px]">line: {r.line ?? "-"} col: {r.column ?? "-"}</div>
                        </div>
                        <div className="flex flex-col items-end">
                          <button onClick={() => navigator.clipboard.writeText(`${r.message} (line:${r.line} col:${r.column})`)} className="text-xs text-gray-400">Copy</button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Preview */}
      <section className="bg-gray-800 p-4 rounded-lg shadow-lg">
        <h2 className="text-xl mb-2 font-semibold">Live Preview</h2>
        <div className="border border-gray-700 rounded overflow-hidden">
          <Preview html={htmlCode} css={cssCode} js={jsCode} />
        </div>
      </section>

      {/* Console Panel */}
      <section className="bg-gray-800 p-4 rounded-lg shadow-lg mt-4">
        <h2 className="text-xl mb-2 font-semibold">Console</h2>
        <div className="bg-black text-white p-2 rounded h-48 overflow-y-auto text-sm font-mono">
          {consoleLogs.length === 0 ? (
            <div className="text-gray-400">No logs yet.</div>
          ) : (
            consoleLogs.map((log, idx) => (
              <div key={idx} className={log.level === "error" ? "text-red-400" : log.level === "warn" ? "text-yellow-400" : "text-green-400"}>
                [{log.time}] {log.message}
              </div>
            ))
          )}
          <div ref={consoleEndRef} />
        </div>

        {consoleLogs.length > 0 && (
          <div className="mt-2 flex gap-2">
            <button onClick={() => setConsoleLogs([])} className="bg-red-600 hover:bg-red-700 px-3 py-1 rounded text-sm">Clear Console</button>
            <button onClick={() => navigator.clipboard.writeText(consoleLogs.map((l) => `[${l.time}] ${l.level}: ${l.message}`).join("\n"))} className="bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded text-sm">Copy Logs</button>
          </div>
        )}
      </section>

      {/* Project Manager Modal */}
      {isManagerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-3xl bg-gray-900 border border-gray-700 rounded-lg shadow-lg overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-gray-800">
              <h3 className="text-lg font-semibold">Project Manager</h3>
              <div className="flex items-center gap-2">
                <button onClick={() => fetchProjects()} className="bg-gray-800 border border-gray-700 p-2 rounded text-sm">Refresh</button>
                <button onClick={() => { setIsManagerOpen(false); setRenameTarget(null); setRenameValue(""); }} className="p-2 rounded bg-gray-800 border border-gray-700 text-sm">Close</button>
              </div>
            </div>

            <div className="p-4 max-h-[60vh] overflow-y-auto">
              {projectsList.length === 0 ? (
                <p className="text-sm text-gray-400">No saved projects.</p>
              ) : (
                projectsList.map((p) => (
                  <div key={p} className="flex items-center justify-between gap-2 p-2 border-b border-gray-800">
                    <div className="flex items-center gap-3">
                      <div className="text-sm font-medium">{p}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => { handleLoad(p); setIsManagerOpen(false); }} className="bg-green-600 hover:bg-green-700 px-2 py-1 rounded text-sm">Load</button>
                      <button onClick={() => { setRenameTarget(p); setRenameValue(p); }} className="bg-yellow-500 hover:bg-yellow-600 px-2 py-1 rounded text-sm text-black">Rename</button>
                      <button onClick={() => handleDelete(p)} className="bg-red-600 hover:bg-red-700 px-2 py-1 rounded text-sm">Delete</button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {renameTarget && (
              <div className="p-4 border-t border-gray-800 bg-gray-950/40">
                <div className="flex items-center gap-2">
                  <input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} className="flex-1 bg-gray-800 border border-gray-700 p-2 rounded text-sm" />
                  <button onClick={() => handleRename(renameTarget, renameValue)} className="bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded text-sm">Save</button>
                  <button onClick={() => { setRenameTarget(null); setRenameValue(""); }} className="bg-gray-800 border border-gray-700 px-3 py-1 rounded text-sm">Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
