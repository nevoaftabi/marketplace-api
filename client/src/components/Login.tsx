import { useState } from "react";
import { useAuth } from "../context/useAuth";
import { useNavigate } from "react-router-dom";

const Login = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string[]> | null>(null);
  const { setAccessToken } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    try {
      e.preventDefault();

      const res = await fetch("/api/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      });

      if (res.status === 500) {
        setErrors({
          general: ["Something went wrong. Please try again later."],
        });
        return;
      }

      const json = await res.json();

      if (!res.ok) {
        setErrors(json.message ?? "Invalid credentials");
        return;
      }

      setAccessToken(json.accessToken);
      localStorage.setItem("refreshToken", json.refreshToken);
      navigate("/");
    } catch {
      setErrors({
        general: ["Something went wrong. Please try again later."],
      });
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <h1>Login</h1>
      <label htmlFor="">Username</label>
      <input
        type="text"
        value={username}
        onChange={(e) => {
          setUsername(e.target.value);
          setErrors(null);
        }}
      />
      <br />
      <br />
      <label htmlFor="">Password</label>
      <input
        type="password"
        value={password}
        onChange={(e) => {
          setPassword(e.target.value);
          setErrors(null);
        }}
      />

      <br />
      <br />
      {errors &&
        Object.entries(errors).map(([field, messages]) => (
          <div key={field}>
            {field}: {messages.join(", ")}
          </div>
        ))}
      <br />
      <button type="submit">Submit</button>
    </form>
  );
};

export default Login;
