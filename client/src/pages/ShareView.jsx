import React, { useEffect, useState, useRef } from "react";
import Preview from "../components/Preview";

export default function ShareView() {
  const [project, setProject] = useState(null);
  const [error, setError] = useState("");
  const iframeRef = useRef(null);

  const projectName = window.location.pathname.split("/share/")[1];

  useEffect(() => {
    const fetchProject = async () => {
      try {
        const res = await fetch(`http://localhost:5000/api/projects/public/${projectName}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.msg || "Failed to load project");
        setProject(data);
      } catch (err) {
        console.error(err);
        setError("❌ Could not load project.");
      }
    };
    fetchProject();
  }, [projectName]);

  if (error)
    return (
      <div className="min-h-screen flex justify-center items-center text-red-400 text-lg">
        {error}
      </div>
    );

  if (!project)
    return (
      <div className="min-h-screen flex justify-center items-center text-gray-400 text-lg">
        Loading project...
      </div>
    );

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <h1 className="text-2xl font-bold mb-2">Shared Project: {project.name}</h1>
      <p className="text-sm text-gray-400 mb-4">
        Last updated: {new Date(project.updatedAt).toLocaleString()}
      </p>

      <section className="bg-gray-800 p-4 rounded-lg shadow-lg">
        <h2 className="text-xl mb-2 font-semibold">Live Preview</h2>
        <Preview html={project.html} css={project.css} js={project.js} />
      </section>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <h3 className="text-lg font-semibold mb-1 text-green-400">HTML</h3>
          <pre className="bg-gray-800 p-2 rounded overflow-auto h-60 text-sm">{project.html}</pre>
        </div>
        <div>
          <h3 className="text-lg font-semibold mb-1 text-blue-400">CSS</h3>
          <pre className="bg-gray-800 p-2 rounded overflow-auto h-60 text-sm">{project.css}</pre>
        </div>
        <div>
          <h3 className="text-lg font-semibold mb-1 text-yellow-400">JS</h3>
          <pre className="bg-gray-800 p-2 rounded overflow-auto h-60 text-sm">{project.js}</pre>
        </div>
      </div>
    </div>
  );
}
