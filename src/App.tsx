import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./lib/auth";
import { PageLoader } from "./components/ui";
import AppLayout from "./components/AppLayout";
import AuthPage from "./pages/AuthPage";
import DashboardPage from "./pages/DashboardPage";
import ActivitiesPage from "./pages/ActivitiesPage";
import HouseholdPage from "./pages/HouseholdPage";
import ExpensesPage from "./pages/ExpensesPage";
import TransactionsPage from "./pages/TransactionsPage";
import BudgetsPage from "./pages/BudgetsPage";
import FinancePage from "./pages/FinancePage";
import MembersPage from "./pages/MembersPage";

export default function App() {
  const { auth, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-full items-center justify-center">
        <PageLoader />
      </div>
    );
  }

  if (!auth) return <AuthPage />;

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="activities" element={<ActivitiesPage />} />
        <Route path="household" element={<HouseholdPage />} />
        <Route path="expenses" element={<ExpensesPage />} />
        <Route path="transactions" element={<TransactionsPage />} />
        <Route path="budgets" element={<BudgetsPage />} />
        <Route path="finance" element={<FinancePage />} />
        <Route path="family" element={<MembersPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
