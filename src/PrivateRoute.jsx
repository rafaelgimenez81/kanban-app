import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { subscribeAuth } from "./auth";

function PrivateRoute({ children }) {
  const [user, setUser] = useState(undefined); // undefined = carregando

  useEffect(() => {
    const unsub = subscribeAuth((currentUser) => {
      setUser(currentUser);
    });
    return () => unsub();
  }, []);

  // Enquanto valida autenticação
  if (user === undefined) {
    return (
      <div className="p-6 text-center text-gray-600">
        Verificando acesso...
      </div>
    );
  }

  // Não logado → bloqueia
  if (!user) {
    return <Navigate to="/" replace />;
  }

  // Logado → libera
  return children;
}

export default PrivateRoute;
