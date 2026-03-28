import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout.js";
import { Services } from "./pages/Services.js";
import Providers from "./pages/Providers.js";
import { Chains } from "./pages/Chains.js";
import { Tokens } from "./pages/Tokens.js";
import { Requests } from "./pages/Requests.js";
import { Payments } from "./pages/Payments.js";
import { Agents } from "./pages/Agents.js";
import { PaymentTest } from "./pages/PaymentTest.js";
import Stats from "./pages/Stats.js";

export function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Services />} />
          <Route path="/providers" element={<Providers />} />
          <Route path="/chains" element={<Chains />} />
          <Route path="/tokens" element={<Tokens />} />
          <Route path="/requests" element={<Requests />} />
          <Route path="/payments" element={<Payments />} />
          <Route path="/agents" element={<Agents />} />
          <Route path="/test" element={<PaymentTest />} />
          <Route path="/stats" element={<Stats />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
