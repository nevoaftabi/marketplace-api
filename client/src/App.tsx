import { BrowserRouter, Route, Routes } from "react-router-dom";
import RegisterForm from "./components/RegisterForm";
import Home from "./components/Home";
import Login from "./components/Login";
import { AuthProvider } from "./context/AuthProvider";
import TaskDetail from "./components/TaskDetail";

function App() {


  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/register" element={<RegisterForm />} />
          <Route path="/login" element={<Login />} />
          <Route path="/tasks/:id" element={<TaskDetail />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
