import React from "react";

export default function ProjectCard({ project }) {
  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
      <h3 className="font-bold text-lg mb-2">{project.title}</h3>
      <p className="text-xs text-gray-400 mb-2">
        Updated: {new Date(project.updatedAt).toLocaleString()}
      </p>
      <pre className="bg-gray-900 p-2 text-xs rounded overflow-x-auto h-24">
        {project.html.slice(0, 100)}...
      </pre>
    </div>
  );
}
