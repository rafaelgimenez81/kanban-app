import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBwAg5vyswZzg3fsx9C54mPDp6qkYWQJzQ",
  authDomain: "kanban-programacao.firebaseapp.com",
  projectId: "kanban-programacao",
  storageBucket: "kanban-programacao.firebasestorage.app",
  messagingSenderId: "515635609697",
  appId: "1:515635609697:web:0556e6900d11629b3baa20",
  measurementId: "G-GSEEZ5NSL6",
};

// Inicializa o app
export const app = initializeApp(firebaseConfig);

// Exporta o Firestore
export const db = getFirestore(app);

// (opcional) exporta Analytics somente se suportado
let analytics;
isSupported()
  .then((yes) => {
    if (yes) {
      analytics = getAnalytics(app);
    }
  })
  .catch(() => {
    // sem suporte, não faz nada
  });

export { analytics };
