// client/src/components/Navbar.jsx
import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { getUser, isLoggedIn, clearAuth } from "../utils/auth";

export default function Navbar() {
  const navigate = useNavigate();
  const logged = isLoggedIn();
  const user = getUser();

  function handleLogout() {
    clearAuth();
    // navigate to home and reload to update pages requiring auth
    navigate("/");
    window.location.reload();
  }

  return (
    <nav className="bg-gray-800 text-white">
      <div className="max-w-[1200px] mx-auto px-4 py-2 flex items-center justify-between">
        <div className="text-lg font-semibold">
          <Link to="/" className="hover:opacity-90">Online Code Editor</Link>
        </div>

        <div className="flex items-center gap-4">
          <Link to="/" className="text-sm hover:underline">Home</Link>

          {!logged ? (
            <>
              <Link to="/login" className="text-sm hover:underline">Login</Link>
              <Link to="/register" className="text-sm hover:underline">Register</Link>
            </>
          ) : (
            <>
              <div className="text-sm text-gray-200">Hi, <span className="font-medium">{user?.username || user?.name || "User"}</span></div>
              <button onClick={handleLogout} className="bg-red-600 text-white text-sm px-3 py-1 rounded">Logout</button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
