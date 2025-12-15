// import { StrictMode } from 'react'
// import { createRoot } from 'react-dom/client'
// import './index.css'
// import App from './App.jsx'

// createRoot(document.getElementById('root')).render(
//   <StrictMode>
//     <App />
//   </StrictMode>,
// )
// import { StrictMode } from "react";
// import { createRoot } from "react-dom/client";
// import { BrowserRouter, Routes, Route } from "react-router-dom";
// import "./index.css";

// import App from "./App.jsx";
// import Finalizados from "./Finalizados.jsx";

// createRoot(document.getElementById("root")).render(
//   <StrictMode>
//     <BrowserRouter>
//       <Routes>
//         <Route path="/" element={<App />} />
//         <Route path="/finalizados" element={<Finalizados />} />
//       </Routes>
//     </BrowserRouter>
//   </StrictMode>
// );
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./index.css";

import App from "./App.jsx";
import Finalizados from "./Finalizados.jsx";
import PrivateRoute from "./PrivateRoute.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />

        <Route
          path="/finalizados"
          element={
            <PrivateRoute>
              <Finalizados />
            </PrivateRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  </StrictMode>
);
