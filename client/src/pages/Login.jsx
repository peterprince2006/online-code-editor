// client/src/pages/Login.jsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { saveAuth } from "../utils/auth";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("http://localhost:5000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.msg || "Login failed");
        setLoading(false);
        return;
      }

      // expected response: { msg, token, user }
      saveAuth(data.token, data.user || null);
      navigate("/");
      window.location.reload(); // let Home update auth-sensitive UI
    } catch (err) {
      console.error(err);
      alert("Network error during login");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-md bg-gray-800 p-6 rounded shadow">
        <h2 className="text-xl font-semibold mb-4">Login</h2>

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
          <button disabled={loading} type="submit" className="bg-green-600 px-4 py-2 rounded">
            {loading ? "Logging in..." : "Login"}
          </button>
          <button type="button" onClick={() => navigate("/register")} className="text-sm underline">
            Create account
          </button>
        </div>
      </form>
    </div>
  );
}
