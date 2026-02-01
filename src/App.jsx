import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import ExpenseReportForm from "./ExpenseReportForm";
import Login from "./Login";

export default function App() {
  return (
    <Router>
      <div>
        <Routes>
          <Route path="/" element={<ExpenseReportForm />} />
          <Route path="/login" element={<Login />} />
        </Routes>
      </div>
    </Router>
  );
}