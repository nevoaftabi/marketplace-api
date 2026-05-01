import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

const RegisterForm = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string[]> | null>(null);

  const submitForm = async (e: React.FormEvent) => {
    try {
      e.preventDefault();

      const res = await fetch("/api/register", {
        method: "post",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, email, password }),
      });

      if (!res.ok) {
        if(res.status === 500) {
          setErrors({ general: ['Something went wrong, please try again.']});
          return;
        }
        const json = await res.json();
        setErrors(json);

      } else {
        setUsername("");
        setEmail("");
        setPassword("");

        setErrors({general: ['Account created successfully']});
        navigate('/');
      }
    } catch (error) {
      console.log(error);
    }
  };

  return (
    <form onSubmit={submitForm}>
      <h1>Register</h1>
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
      <label htmlFor="">Email</label>
      <input
        type="email"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
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
          setErrors(null);
          setPassword(e.target.value);
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

      <button type="submit">Submit</button>
    </form>
  );
};

export default RegisterForm;
