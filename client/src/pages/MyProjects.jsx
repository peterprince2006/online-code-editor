import React, { useEffect, useState, useContext } from "react";
import axios from "axios";
import { AuthContext } from "../context/AuthContext";
import ProjectCard from "../components/ProjectCard";

export default function MyProjects() {
  const { user, token } = useContext(AuthContext);
  const [projects, setProjects] = useState([]);

  useEffect(() => {
    if (!user || !token) return;
    axios
      .get(`http://localhost:5000/api/projects/${user.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => setProjects(res.data))
      .catch(() => setProjects([]));
  }, [user, token]);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4">
      <h1 className="text-2xl font-bold mb-4">My Projects</h1>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects.length === 0 && <p>No projects yet.</p>}
        {projects.map((p) => (
          <ProjectCard key={p._id} project={p} />
        ))}
      </div>
    </div>
  );
}
