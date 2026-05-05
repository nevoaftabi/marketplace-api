import { useEffect, useState } from "react";
import { apiFetch } from "../utils/api";
import { useWebSocket } from "../hooks/useWebSocket";
import { useAuth } from "../context/useAuth";
import { Navigate } from "react-router-dom";
import { jwtDecode } from "jwt-decode";

type Message = {
  id: string;
  sender: { username: string };
  recipient: { username: string };
  content: string;
  createdAt: string;
};

type Props = {
  taskId: string;
  recipientId: string;
};

// eslint-disable-next-line react-refresh/only-export-components
export const Chat = ({ taskId, recipientId }: Props) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const { accessToken } = useAuth();

  const decoded = accessToken
    ? jwtDecode<{ username: string }>(accessToken)
    : null;
  const myUsername = decoded?.username;

  const { send } = useWebSocket((msg) => {
    if (msg.type === "message" && msg.taskId === taskId) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          content: msg.content as string,
          createdAt: new Date().toISOString(),
          sender: { username: (msg.senderUsername as string) ?? "" },
          recipient: { username: "" },
        },
      ]);
    }
  });

  useEffect(() => {
    apiFetch(`/api/auth/tasks/${taskId}/messages`)
      .then((res) => res.json())
      .then(setMessages);
  }, [taskId]);

  const handleSend = () => {
    if (!input.trim()) return;

    send({ type: "message", taskId, recipientId, content: input });
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        senderId: "me",
        recipient: { username: "" },
        sender: { username: "You" },
        content: input,
        createdAt: new Date().toISOString(),
      },
    ]);
    setInput("");
  };

  if (!accessToken) {
    if (!localStorage.getItem("refreshToken")) {
      return <Navigate to="/login" replace />;
    }
    return <div>Loading...</div>;
  }

  return (
    <div>
      <div
        style={{
          height: 300,
          overflowY: "auto",
          border: "1px solid #ccc",
          padding: 8,
        }}
      >
        {messages.map((m) => (
          <div key={m.id}>
            <strong>
              {m.sender.username === myUsername ? "You" : m.sender.username}:
            </strong>{" "}
            {m.content}
          </div>
        ))}
      </div>
      <input value={input} onChange={(e) => setInput(e.target.value)} />
      <button onClick={handleSend}>Send</button>
    </div>
  );
};
