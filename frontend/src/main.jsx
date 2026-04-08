import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import "./index.css";

/* Apply saved theme before first paint to avoid flash */
const saved = localStorage.getItem("app-theme");
if (saved === "dark" || saved === "light") {
  document.documentElement.setAttribute("data-theme", saved);
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5_000,       // data dianggap fresh selama 5 detik
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);
