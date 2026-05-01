import React from "react";
import { Link } from "react-router-dom";

function Home() {
  return (
    <div>
      <div>Home</div>
      <Link to="/register">Register</Link>
      <br />
      <Link to="/login">Login</Link>
    </div>
  );
}

export default Home;