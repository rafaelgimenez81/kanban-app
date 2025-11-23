// src/LoginPage.jsx
import React, { useState } from "react";
import { loginUser, registerUser, resetPassword } from "./auth";

function LoginPage({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [mode, setMode] = useState("login"); 
  // login | register | reset

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");

    try {
      if (mode === "register") {
        await registerUser(email, password);
        onLogin();
      } else if (mode === "login") {
        await loginUser(email, password);
        onLogin();
      } else if (mode === "reset") {
        await resetPassword(email);
        setMessage("Um email de recuperação foi enviado!");
      }
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-6 rounded-xl shadow-md w-80">

        <h2 className="text-xl font-bold mb-4 text-center">
          {mode === "login" && "Login"}
          {mode === "register" && "Criar conta"}
          {mode === "reset" && "Recuperar senha"}
        </h2>

        {error && <p className="text-red-500 text-sm mb-2">{error}</p>}
        {message && <p className="text-green-600 text-sm mb-2">{message}</p>}

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">

          <input
            type="email"
            placeholder="Email"
            className="border p-2 rounded"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          {mode !== "reset" && (
            <input
              type="password"
              placeholder="Senha"
              className="border p-2 rounded"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required={mode !== "reset"}
            />
          )}

          <button
            type="submit"
            className="bg-blue-600 text-white p-2 rounded hover:bg-blue-700"
          >
            {mode === "login" && "Entrar"}
            {mode === "register" && "Cadastrar"}
            {mode === "reset" && "Enviar link de recuperação"}
          </button>
        </form>

        {/* Alternar modos */}
        <div className="text-sm text-blue-600 mt-3 flex flex-col gap-1 items-center">

          {mode !== "login" && (
            <button onClick={() => setMode("login")}>
              Já tem conta? Entrar
            </button>
          )}

          {mode !== "register" && (
            <button onClick={() => setMode("register")}>
              Não tem conta? Cadastre-se
            </button>
          )}

          {mode !== "reset" && (
            <button onClick={() => setMode("reset")}>
              Esqueci minha senha
            </button>
          )}

        </div>

      </div>
    </div>
  );
}

export default LoginPage;
