// client/src/pages/Register.jsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { saveAuth } from "../utils/auth";

export default function Register() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("http://localhost:5000/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.msg || "Register failed");
        setLoading(false);
        return;
      }

      // If server returns token+user after register
      if (data.token) {
        saveAuth(data.token, data.user || { username, email });
        navigate("/");
        window.location.reload();
      } else {
        // otherwise forward to login page
        alert("Registration successful — please login.");
        navigate("/login");
      }
    } catch (err) {
      console.error(err);
      alert("Network error during registration");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-md bg-gray-800 p-6 rounded shadow">
        <h2 className="text-xl font-semibold mb-4">Register</h2>

        <label className="block text-sm mb-1">Username</label>
        <input
          className="w-full mb-3 p-2 rounded bg-gray-900 border border-gray-700"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />

        <label className="block text-sm mb-1">Email</label>
        <input
          className="w-full mb-3 p-2 rounded bg-gray-900 border border-gray-700"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          required
        />

        <label className="block text-sm mb-1">Password</label>
        <input
          className="w-full mb-4 p-2 rounded bg-gray-900 border border-gray-700"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          required
        />

        <div className="flex items-center justify-between">
          <button disabled={loading} type="submit" className="bg-blue-600 px-4 py-2 rounded">
            {loading ? "Registering..." : "Register"}
          </button>
          <button type="button" onClick={() => navigate("/login")} className="text-sm underline">
            Already have account?
          </button>
        </div>
      </form>
    </div>
  );
}
