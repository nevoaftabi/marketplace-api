import { useEffect, useState } from "react";
import { AuthContext } from "./AuthContext";
import { setToken } from "../utils/api";

// This is a component that wraps your app.
// It holds the actual useState for the token and passes the value into the context.
// Any component inside it can read and update the token
export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  useEffect(() => {
    const refreshToken = localStorage.getItem("refreshToken");
    if (!refreshToken) return;

    fetch("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then(({ accessToken }) => {
        setAccessToken(accessToken);
        setToken(accessToken);
      })
      .catch(() => {
        localStorage.removeItem("refreshToken");
      });
  }, []);
  return (
    <AuthContext.Provider value={{ accessToken, setAccessToken }}>
      {children}
    </AuthContext.Provider>
  );
};
