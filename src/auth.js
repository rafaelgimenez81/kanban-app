// src/auth.js
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail} from "firebase/auth";
import { app } from "./firebase";

const auth = getAuth(app);

// Registrar usuário
export const registerUser = (email, password) => {
  return createUserWithEmailAndPassword(auth, email, password);
};

// Login
export const loginUser = (email, password) => {
  return signInWithEmailAndPassword(auth, email, password);
};

// Logout
export const logoutUser = () => {
  return signOut(auth);
};

// Escutar mudanças de autenticação
export const subscribeAuth = (callback) => {
  return onAuthStateChanged(auth, callback);
};
  
// Reset de senha
export const resetPassword = (email) => {
  return sendPasswordResetEmail(auth, email);
};

export { auth };
