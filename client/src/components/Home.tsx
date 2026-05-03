import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "../utils/api";
import { useAuth } from "../context/useAuth";
import { jwtDecode } from "jwt-decode";
import { setToken } from "../utils/api";

type Task = {
  id: string;
  title: string;
  description: string;
  pay: number;
  username: string;
  claimed: boolean;
};

function Home() {
  const { accessToken, setAccessToken } = useAuth();
  const navigate = useNavigate();
  const [errors, setErrors] = useState<Record<string, string[]> | null>(null);
  const decoded = accessToken
    ? jwtDecode<{ username: string }>(accessToken!)
    : null;
  const username = decoded?.username ?? null;
  const [apiData, setApiData] = useState<{
    tasks: Task[];
    total: number;
    page: number;
    limit: number;
  }>({
    tasks: [],
    total: 0,
    page: 1,
    limit: 5,
  });

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

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await apiFetch(
          `/api/tasks?page=${apiData.page}&limit=${apiData.limit}`,
        );
        if (!res.ok) {
          setErrors({
            general: ["Couldn't retrieve tasks. Please try again later."],
          });
          return;
        }

        // parses data from the request
        const json = await res.json();
        console.log(json);
        setApiData((prev) => ({ ...prev, ...json }));
      } catch {
        setErrors({
          general: ["Couldn't retrieve tasks. Please try again later."],
        });
      }
    };
    fetchData();
  }, [accessToken, apiData.limit, apiData.page]);

  const handleClaim = async (taskId: string) => {
    if (!accessToken) {
      navigate("/login");
      return;
    }

    try {
      const res = await apiFetch(`/api/auth/tasks/${taskId}/claim`, {
        method: "POST",
      });

      if (!res.ok) {
        setErrors({
          general: ["Couldn't retrieve tasks. Try again later."],
        });
        return;
      }

      const updatedRes = await apiFetch(
        `/api/tasks?page=${apiData.page}&limit=${apiData.limit}`,
      );
      const json = await updatedRes.json();
      setApiData((prev) => ({ ...prev, ...json }));
    } catch {
      setErrors({
        general: ["Couldn't retrieve tasks. Try again later."],
      });
    }
  };

  const handleLogout = () => {
    setToken(null);
    setAccessToken(null);
    localStorage.removeItem("refreshToken");
    navigate("/");
  };

  return (
    <div>
      <div>
        Home{" "}
        {accessToken !== null && (
          <span>
            - Logged in as {username}
            <br />
            <button onClick={handleLogout}>Logout</button>
          </span>
        )}
      </div>
      {accessToken === null && <Link to="/register">Register</Link>}
      <br />
      {accessToken === null && <Link to="/login">Login</Link>}
      {apiData.tasks.length === 0 && <p>No tasks are available</p>}
      {apiData.tasks.map((task: Task) => (
        <div key={task.id}>
          <p>Title: {task.title}</p>
          <p>Description: {task.description}</p>
          <p>Pay: ${task.pay}</p>
          <p>Posted by: {task.username}</p>
          <button disabled={task.claimed} onClick={() => handleClaim(task.id)}>
            {task.claimed ? "Claimed" : "Claim"}
          </button>
          <br />
          <br />
        </div>
      ))}
      {errors &&
        Object.entries(errors).map(([field, messages]) => (
          <div key={field}>
            {field}: {messages.join(", ")}
          </div>
        ))}
    </div>
  );
}

export default Home;
