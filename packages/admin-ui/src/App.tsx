import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout.js";
import { Services } from "./pages/Services.js";
import { Payments } from "./pages/Payments.js";
import { Agents } from "./pages/Agents.js";

export function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Services />} />
          <Route path="/payments" element={<Payments />} />
          <Route path="/agents" element={<Agents />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
