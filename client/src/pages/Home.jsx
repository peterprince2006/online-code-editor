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

import Preview from "../components/Preview";
import toast from "react-hot-toast";
import JSZip from "jszip";
import { saveAs } from "file-saver";


/* Home.jsx: main editor page
   - Local editors (CodeMirror) for HTML/CSS/JS
   - Yjs CRDT integration via y-websocket
   - Save / Load / Delete / Rename projects via API
   - Project Manager modal
   - Auto-save
   - Console panel (receives postMessage from iframe)
*/

function debounce(fn, wait = 300) {
  let t = null;
  return (...args) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

export default function Home() {
  // ---------- UI state ----------
  const [projectId, setProjectId] = useState("");
  const [connected, setConnected] = useState(false);
  const [themeName, setThemeName] = useState("oneDark");
  const [enableJSHint, setEnableJSHint] = useState(false);

  // code shown in preview iframe (kept in state)
  const [htmlCode, setHtmlCode] = useState("");
  const [cssCode, setCssCode] = useState("");
  const [jsCode, setJsCode] = useState("");

  // lint results (worker)
  const [lintResults, setLintResults] = useState({ html: [], css: [], js: [] });

  // projects + manager state
  const [projectsList, setProjectsList] = useState([]);
  const [isManagerOpen, setIsManagerOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // console state
  const [consoleLogs, setConsoleLogs] = useState([]);
  const [scrollLock, setScrollLock] = useState(false);

  // filtered/sorted list
  const filteredProjects = [...projectsList]
    .filter((p) => p.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => a.localeCompare(b));

  // refs
  const editorDivs = useRef({ html: null, css: null, js: null });
  const viewsRef = useRef({ html: null, css: null, js: null });

  const ydocRef = useRef(null);
  const providerRef = useRef(null);
  const ytextRefs = useRef({ html: null, css: null, js: null });

  const previewWorkerRef = useRef(null);
  const lintWorkerRef = useRef(null);

  const consoleContainerRef = useRef(null);

  // ---------- theme getter ----------
  const getTheme = useCallback(() => {
    if (themeName === "dracula") return dracula;
    if (themeName === "github") return githubLight;
    return oneDark;
  }, [themeName]);

  // ---------- initialize workers (optional) ----------
  useEffect(() => {
    // preview worker (optional)
    try {
      const w = new Worker(new URL("../workers/codeWorker.js", import.meta.url));
      w.onmessage = () => {}; // placeholder
      previewWorkerRef.current = w;
    } catch (e) {
      previewWorkerRef.current = null;
    }

    // lint worker (optional)
    try {
      const lw = new Worker(new URL("../workers/lintWorker.js", import.meta.url));
      lw.onmessage = (ev) => {
        const d = ev.data;
        if (d?.type === "results") setLintResults(d.payload || { html: [], css: [], js: [] });
      };
      lintWorkerRef.current = lw;
    } catch (e) {
      lintWorkerRef.current = null;
    }

    return () => {
      previewWorkerRef.current?.terminate?.();
      lintWorkerRef.current?.terminate?.();
    };
  }, []);

  const postLintDebounced = useRef(
    debounce((h, c, j, options) => {
      try {
        lintWorkerRef.current?.postMessage({ type: "lint", payload: { html: h, css: c, js: j, options } });
      } catch (e) {}
    }, 350)
  ).current;

  // ---------- send preview (updates iframe + schedule lint) ----------
  const sendPreview = (h, c, j) => {
    setHtmlCode(h);
    setCssCode(c);
    setJsCode(j);
    try {
      previewWorkerRef.current?.postMessage({ html: h, css: c, js: j });
    } catch (e) {}
    postLintDebounced(h, c, j, { jshint: enableJSHint });
  };

  // ---------- CodeMirror local editor creation ----------
  const createLocalEditor = (slot, language, initial = "") => {
    if (viewsRef.current[slot]) {
      try { viewsRef.current[slot].destroy(); } catch (e) {}
      viewsRef.current[slot] = null;
    }

    const state = EditorState.create({
      doc: initial,
      extensions: [basicSetup, language, EditorView.lineWrapping, getTheme(), EditorView.editable.of(true)],
    });

    const view = new EditorView({ state, parent: editorDivs.current[slot] });

    // react to changes & update preview
    view.dispatch = ((origDispatch) => (tr) => {
      origDispatch(tr);
      const h = viewsRef.current.html?.state.doc.toString() || "";
      const c = viewsRef.current.css?.state.doc.toString() || "";
      const j = viewsRef.current.js?.state.doc.toString() || "";
      sendPreview(h, c, j);
    })(view.dispatch);

    viewsRef.current[slot] = view;
    return view;
  };

  // ---------- CodeMirror Yjs editor creation ----------
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
      extensions: [basicSetup, language, yCollab(ytext, awareness, { undoManager }), EditorView.lineWrapping, getTheme(), EditorView.editable.of(true)],
    });

    const view = new EditorView({ state, parent: editorDivs.current[slot] });

    const updateFromY = () => {
      try {
        const h = ydoc.getText("html").toString();
        const c = ydoc.getText("css").toString();
        const j = ydoc.getText("js").toString();
        sendPreview(h, c, j);
      } catch (e) {}
    };

    ytext.observeDeep(updateFromY);
    updateFromY();

    viewsRef.current[slot] = view;
    return view;
  };

  // ---------- ensure local editors (mount + theme changes fallback) ----------
  const ensureLocalEditors = useCallback(() => {
    const prevHtml = viewsRef.current.html ? viewsRef.current.html.state.doc.toString() : "<h1>Hello World</h1>";
    const prevCss = viewsRef.current.css ? viewsRef.current.css.state.doc.toString() : "h1 { color: teal; }";
    const prevJs = viewsRef.current.js ? viewsRef.current.js.state.doc.toString() : "console.log('hello');";

    // destroy previous views cleanly
    Object.values(viewsRef.current).forEach((v) => { try { v?.destroy?.(); } catch (e) {} });
    viewsRef.current = { html: null, css: null, js: null };

    createLocalEditor("html", htmlLang(), prevHtml);
    createLocalEditor("css", cssLang(), prevCss);
    createLocalEditor("js", javascript(), prevJs);

    sendPreview(prevHtml, prevCss, prevJs);
  }, [getTheme]);

  useEffect(() => {
    ensureLocalEditors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // when theme toggles, re-create editors (Yjs-aware)
  useEffect(() => {
    if (providerRef.current && ydocRef.current) {
      const ydoc = ydocRef.current;
      const provider = providerRef.current;
      const { html: yhtml, css: ycss, js: yjs } = ytextRefs.current;
      Object.values(viewsRef.current).forEach((v) => { try { v?.destroy?.(); } catch (e) {} });
      viewsRef.current = { html: null, css: null, js: null };
      createYjsEditor("html", yhtml, htmlLang(), provider, ydoc);
      createYjsEditor("css", ycss, cssLang(), provider, ydoc);
      createYjsEditor("js", yjs, javascript(), provider, ydoc);
    } else {
      ensureLocalEditors();
    }
  }, [themeName, ensureLocalEditors]);

  // ---------- Yjs start / stop ----------
  const startYjs = async (room) => {
    if (!room) return alert("Enter a project/room ID");

    try {
      // cleanup previous
      try { providerRef.current?.destroy?.(); ydocRef.current?.destroy?.(); } catch (e) {}

      const ydoc = new Y.Doc();
      // NOTE: match the port your server actually uses (we use 1234 in this client)
      const provider = new WebsocketProvider("ws://localhost:1234", room, ydoc);

      ydocRef.current = ydoc;
      providerRef.current = provider;

      const yhtml = ydoc.getText("html");
      const ycss = ydoc.getText("css");
      const yjs = ydoc.getText("js");
      ytextRefs.current = { html: yhtml, css: ycss, js: yjs };

      provider.on("status", (ev) => {
        setConnected(ev.status === "connected");
        if (ev.status === "connected") {
          Object.values(viewsRef.current).forEach((v) => { try { v?.destroy?.(); } catch (e) {} });
          createYjsEditor("html", yhtml, htmlLang(), provider, ydoc);
          createYjsEditor("css", ycss, cssLang(), provider, ydoc);
          createYjsEditor("js", yjs, javascript(), provider, ydoc);
        }
      });

      provider.on("connection-close", () => {
        setConnected(false);
        setTimeout(() => provider.connect(), 2000);
      });
      provider.on("connection-error", () => setConnected(false));

      if (!yhtml.toString() && !ycss.toString() && !yjs.toString()) {
        ydoc.transact(() => {
          yhtml.insert(0, "<h1>Hello from Yjs</h1>");
          ycss.insert(0, "h1 { color: teal; }");
          yjs.insert(0, "console.log('Yjs ready');");
        });
      }

      toast.success("CRDT session started");
    } catch (err) {
      console.error("startYjs error:", err);
      toast.error("Failed to start CRDT session");
    }
  };

  const stopYjs = () => {
    try {
      providerRef.current?.destroy?.();
      ydocRef.current?.destroy?.();
      providerRef.current = null;
      ydocRef.current = null;
      setConnected(false);
      ensureLocalEditors();
      toast.success("CRDT session stopped");
    } catch (err) {
      console.error("stopYjs:", err);
      toast.error("Failed to stop CRDT session");
    }
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
      } else {
        const data = await res.json();
        if (Array.isArray(data)) setProjectsList(data);
      }
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

  // ---------- Save / Save As ----------
  async function handleSave(isSaveAs = false) {
    const token = localStorage.getItem("token");
    if (!token) return toast.error("Please log in first!");

    let name = projectId?.trim();

    if (isSaveAs) {
      name = prompt("Enter a new project name:") || "";
    }

    if (!name) return toast.error("Project name required");

    try {
      const res = await fetch("http://localhost:5000/api/projects/save", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name, html: htmlCode, css: cssCode, js: jsCode }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        await fetchProjects();
        setProjectId(name);
        window._lastSaved = { html: htmlCode, css: cssCode, js: jsCode };
        toast.success(`Saved "${name}"`);
      } else {
        toast.error("Save failed: " + (d.msg || res.status));
      }
    } catch (err) {
      console.error("handleSave error:", err);
      toast.error("Save failed (network)");
    }
  }

  // ---------- Load ----------
  async function handleLoad(nameParam) {
    const token = localStorage.getItem("token");
    if (!token) return toast.error("Please log in first!");

    const name = nameParam || projectId || prompt("Enter project name to load:");
    if (!name) return;

    try {
      const res = await fetch(`http://localhost:5000/api/projects/${encodeURIComponent(name)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 404) return toast.error("Project not found.");
      if (!res.ok) return toast.error("Load failed.");
      const data = await res.json();
      const newHtml = data.html || "";
      const newCss = data.css || "";
      const newJs = data.js || "";

      setHtmlCode(newHtml);
      setCssCode(newCss);
      setJsCode(newJs);

      ["html", "css", "js"].forEach((slot) => {
        const view = viewsRef.current?.[slot];
        if (view) {
          try {
            view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: slot === "html" ? newHtml : slot === "css" ? newCss : newJs } });
          } catch (e) {
            // if in Yjs session, Yjs will handle update
          }
        }
      });

      setProjectId(name);
      postLintDebounced(newHtml, newCss, newJs, { jshint: enableJSHint });
      sendPreview(newHtml, newCss, newJs);
      toast.success(`Loaded "${name}"`);
    } catch (err) {
      console.error("handleLoad error:", err);
      toast.error("Load failed");
    }
  }

  // ---------- Delete ----------
  async function handleDelete(name) {
    if (!confirm(`Delete project "${name}"?`)) return;
    const token = localStorage.getItem("token");
    if (!token) return toast.error("Please log in first!");
    try {
      const res = await fetch(`http://localhost:5000/api/projects/${encodeURIComponent(name)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        toast.success(`Deleted "${name}"`);
        await fetchProjects();
        if (projectId === name) setProjectId("");
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error("Delete failed: " + (d.msg || res.status));
      }
    } catch (err) {
      console.error("handleDelete error:", err);
      toast.error("Delete failed (network)");
    }
  }

  // ---------- Rename ----------
  async function handleRename(oldName, newName) {
    if (!newName || newName.trim() === "") return toast.error("Enter new name");
    if (!confirm(`Rename "${oldName}" → "${newName}"?`)) return;
    const token = localStorage.getItem("token");
    if (!token) return toast.error("Please log in first!");
    try {
      const res = await fetch("http://localhost:5000/api/projects/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ oldName, newName }),
      });
      if (res.ok) {
        toast.success("Renamed");
        await fetchProjects();
        setRenameTarget(null);
        setRenameValue("");
        if (projectId === oldName) setProjectId(newName);
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error("Rename failed: " + (d.msg || res.status));
      }
    } catch (err) {
      console.error("handleRename error:", err);
      toast.error("Rename failed (network)");
    }
  }

  // ---------- Auto-save ----------
  useEffect(() => {
    const interval = setInterval(async () => {
      const token = localStorage.getItem("token");
      if (!token || !projectId) return;
      const current = { html: htmlCode, css: cssCode, js: jsCode };
      window._lastSaved = window._lastSaved || { html: "", css: "", js: "" };
      const last = window._lastSaved;
      if (current.html === last.html && current.css === last.css && current.js === last.js) return;
      try {
        await fetch("http://localhost:5000/api/projects/save", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ name: projectId, ...current }),
        });
        window._lastSaved = current;
        console.log(`[Auto-Save] ${projectId}`);
      } catch (err) {
        console.warn("Auto-save failed:", err);
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [projectId, htmlCode, cssCode, jsCode]);

  // ---------- Console message listener ----------
  useEffect(() => {
    const handler = (event) => {
      const { data } = event;
      if (!data || data.type !== "console") return;

      // handle console.clear()
      if (data.level === "clear") {
        setConsoleLogs([]);
        return;
      }

      const message = Array.isArray(data.message)
        ? data.message.map((m) => (typeof m === "object" ? JSON.stringify(m) : String(m))).join(" ")
        : String(data.message);

      const entry = { level: data.level || "log", message, time: new Date().toLocaleTimeString() };
      setConsoleLogs((prev) => [...prev, entry]);
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // auto-scroll console unless locked
  useEffect(() => {
    if (!scrollLock && consoleContainerRef.current) {
      consoleContainerRef.current.scrollTop = consoleContainerRef.current.scrollHeight;
    }
  }, [consoleLogs, scrollLock]);

  const clearConsole = () => setConsoleLogs([]);

  // ---------- Export Project (ZIP or JSON) ----------
async function handleExport(type = "zip") {
  if (!projectId) return alert("Enter a project name before exporting!");

  const data = {
    name: projectId,
    html: htmlCode,
    css: cssCode,
    js: jsCode,
    exportedAt: new Date().toISOString(),
  };

  if (type === "json") {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    saveAs(blob, `${projectId}.json`);
  } else {
    const zip = new JSZip();
    zip.file("index.html", htmlCode);
    zip.file("style.css", cssCode);
    zip.file("script.js", jsCode);
    zip.file("metadata.json", JSON.stringify(data, null, 2));

    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, `${projectId}.zip`);
  }

  alert(`✅ Exported project "${projectId}" successfully`);
}

// ---------- Import Project (ZIP or JSON) ----------
async function handleImport(event) {
  const file = event.target.files[0];
  if (!file) return;

  const ext = file.name.split(".").pop().toLowerCase();

  try {
    if (ext === "json") {
      const text = await file.text();
      const data = JSON.parse(text);
      setHtmlCode(data.html || "");
      setCssCode(data.css || "");
      setJsCode(data.js || "");
      setProjectId(data.name || "");
      sendPreview(data.html || "", data.css || "", data.js || "");
      alert(`✅ Imported project "${data.name || file.name}"`);
    } else if (ext === "zip") {
      const zip = await JSZip.loadAsync(file);
      const html = await zip.file("index.html")?.async("string") || "";
      const css = await zip.file("style.css")?.async("string") || "";
      const js = await zip.file("script.js")?.async("string") || "";
      const meta = await zip.file("metadata.json")?.async("string");
      const name = meta ? JSON.parse(meta).name : file.name.replace(".zip", "");

      setHtmlCode(html);
      setCssCode(css);
      setJsCode(js);
      setProjectId(name);
      sendPreview(html, css, js);
      alert(`✅ Imported project "${name}"`);
    } else {
      alert("❌ Unsupported file type. Please upload a .zip or .json file.");
    }
  } catch (err) {
    console.error("Import error:", err);
    alert("❌ Failed to import file. Check console for details.");
  } finally {
    event.target.value = ""; // reset file input
  }
}


  // ---------- Render ----------
  return (
    <div className="min-h-screen bg-gray-900 text-white p-4">
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

          <button onClick={() => handleSave(false)} className="bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded text-sm">Save</button>
          <button onClick={() => handleSave(true)} className="bg-indigo-600 hover:bg-indigo-700 px-3 py-1 rounded text-sm">Save As</button>

          <select
            onChange={async (e) => {
              const n = e.target.value;
              if (!n) return setProjectId("");
              setProjectId(n);
              await handleLoad(n);
            }}
            className="bg-gray-800 text-white border border-gray-700 rounded px-2 py-1 text-sm"
            value={projectId || ""}
          >
            <option value="">Select Project</option>
            {projectsList.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>

          <button onClick={async () => { setLoadingProjects(true); await fetchProjects(); setLoadingProjects(false); }} title="Refresh" className="bg-gray-800 border border-gray-700 px-2 py-1 rounded text-sm">
            {loadingProjects ? <span className="animate-spin border-2 border-t-transparent border-gray-400 rounded-full w-4 h-4" /> : "🔄"}
          </button>

          <button onClick={() => { fetchProjects(); setIsManagerOpen(true); }} className="bg-gray-800 border border-gray-700 px-2 py-1 rounded text-sm">Manage</button>
          <button onClick={() => handleLoad()} className="bg-yellow-500 hover:bg-yellow-600 px-3 py-1 rounded text-sm text-black">Load</button>

          <button onClick={() => { if (!projectId) return toast.error("Enter project name first"); const share = `${window.location.origin}/share/${encodeURIComponent(projectId)}`; navigator.clipboard.writeText(share); toast.success("Share link copied"); }} className="bg-purple-600 hover:bg-purple-700 px-3 py-1 rounded text-sm">Share</button>
          {/* Export & Import Buttons */}
<button
  onClick={() => handleExport("zip")}
  className="bg-teal-600 hover:bg-teal-700 px-3 py-1 rounded text-sm"
>
  Export ZIP
</button>

<button
  onClick={() => handleExport("json")}
  className="bg-sky-600 hover:bg-sky-700 px-3 py-1 rounded text-sm"
>
  Export JSON
</button>

<label className="bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded text-sm cursor-pointer">
  Import
  <input
    type="file"
    accept=".zip,.json"
    onChange={handleImport}
    style={{ display: "none" }}
  />
</label>


          <label className="flex items-center gap-2 text-sm ml-2">
            <input type="checkbox" checked={enableJSHint} onChange={(e) => setEnableJSHint(e.target.checked)} />
            <span className="text-gray-300">JSHint</span>
          </label>
        </div>
      </header>


      {/* Editors */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {["html","css","js"].map((lang) => {
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
                  {results.length === 0 ? <div className="text-xs text-gray-500">No issues</div> :
                    results.map((r,i) => (
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
                  }
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

      {/* Console */}
      <section className="bg-gray-800 p-4 rounded-lg shadow-lg mt-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xl font-semibold">Console</h2>
          <div className="flex items-center gap-2 text-sm">
            <button onClick={clearConsole} className="bg-red-600 hover:bg-red-700 px-3 py-1 rounded text-sm">Clear</button>
            <button onClick={() => setScrollLock((s) => !s)} className={`px-3 py-1 rounded text-sm ${scrollLock ? "bg-yellow-500 text-black" : "bg-gray-700 hover:bg-gray-600"}`}>
              {scrollLock ? "Scroll Locked" : "Scroll Auto"}
            </button>
          </div>
        </div>

        <div ref={consoleContainerRef} className="bg-black text-white p-2 rounded h-56 overflow-y-auto text-sm font-mono">
          {consoleLogs.length === 0 ? <div className="text-gray-400">No logs yet.</div> :
            consoleLogs.map((log, idx) => (
              <div key={idx} className={ log.level === "error" ? "text-red-400" : log.level === "warn" ? "text-yellow-400" : "text-green-400" }>
                [{log.time}] {log.message}
              </div>
            ))
          }
        </div>
      </section>

      {/* Project Manager */}
      {isManagerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-3xl bg-gray-900 border border-gray-700 rounded-lg shadow-lg overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-gray-800">
              <h3 className="text-lg font-semibold">Project Manager</h3>
              <div className="flex items-center gap-2">
                <button onClick={async () => { setLoadingProjects(true); await fetchProjects(); setLoadingProjects(false); }} title="Refresh" className="bg-gray-800 border border-gray-700 px-3 py-1 rounded flex items-center gap-2">
                  {loadingProjects ? <span className="animate-spin border-2 border-t-transparent border-gray-400 rounded-full w-4 h-4" /> : "🔄"}
                </button>

                <button onClick={async () => {
                  const newName = prompt("Enter new project name:");
                  if (!newName) return;
                  const token = localStorage.getItem("token");
                  if (!token) return toast.error("Please log in first!");
                  try {
                    const res = await fetch("http://localhost:5000/api/projects/save", {
                      method: "POST",
                      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                      body: JSON.stringify({ name: newName, html: "<h1>New Project</h1>", css: "h1 { color: purple; }", js: "console.log('New project');" }),
                    });
                    if (res.ok) { toast.success(`Created "${newName}"`); await fetchProjects(); } else toast.error("Create failed");
                  } catch (err) { console.error(err); toast.error("Network error"); }
                }} className="bg-green-600 hover:bg-green-700 px-3 py-1 rounded text-sm flex items-center gap-1">➕ New</button>

                <button onClick={() => { setIsManagerOpen(false); setRenameTarget(null); setRenameValue(""); }} className="p-2 rounded bg-gray-800 border border-gray-700">✖</button>
              </div>
            </div>

            <div className="p-4 max-h-[60vh] overflow-y-auto">
              <input type="text" placeholder="Search projects..." className="w-full mb-3 bg-gray-800 border border-gray-700 rounded p-2 text-sm" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />

              {loadingProjects ? <p className="text-sm text-gray-400">Refreshing projects...</p> :
                filteredProjects.length === 0 ? <p className="text-sm text-gray-400">No projects found.</p> :
                filteredProjects.map((p) => (
                  <div key={p} className="flex items-center justify-between gap-2 p-2 border-b border-gray-800 hover:bg-gray-800/50 transition">
                    <div className="text-sm font-medium">{p}</div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => { handleLoad(p); setIsManagerOpen(false); }} className="bg-green-600 hover:bg-green-700 px-2 py-1 rounded text-sm">Load</button>
                      <button onClick={() => { setRenameTarget(p); setRenameValue(p); }} className="bg-yellow-500 hover:bg-yellow-600 px-2 py-1 rounded text-sm text-black">Rename</button>
                      <button onClick={() => handleDelete(p)} className="bg-red-600 hover:bg-red-700 px-2 py-1 rounded text-sm">Delete</button>
                    </div>
                  </div>
                ))
              }
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
