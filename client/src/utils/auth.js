// client/src/utils/auth.js
export function saveAuth(token, user = null) {
    if (token) localStorage.setItem("token", token);
    if (user) localStorage.setItem("user", JSON.stringify(user));
  }
  
  export function clearAuth() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
  }
  
  export function getToken() {
    return localStorage.getItem("token");
  }
  
  export function getUser() {
    const u = localStorage.getItem("user");
    try {
      return u ? JSON.parse(u) : null;
    } catch {
      return null;
    }
  }
  
  export function isLoggedIn() {
    return !!getToken();
  }
  