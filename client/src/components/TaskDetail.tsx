import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { apiFetch } from "../utils/api";
import { Chat } from "./Chat";

export type Task = {
  id: string;
  title: string;
  description: string;
  pay: number;
  username: string;
  userId: string;
};

const TaskDetail = () => {
  const { id } = useParams<{ id: string }>();
  const [task, setTask] = useState<Task | null>(null);

  useEffect(() => {
    apiFetch(`/api/tasks/${id}`)
      .then((res) => res.json())
      .then(setTask);
  }, [id]);

  if(!task) return <div>Loading...</div>

  return (
    <div>
      <h1>{task.title}</h1>
      <p>{task.description}</p>
      <p>Pay: ${task.pay}</p>
      <Chat taskId={task.id} recipientId={task.userId} />
    </div>
  )
};

export default TaskDetail;
