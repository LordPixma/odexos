import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./lib/auth";
import { PageLoader } from "./components/ui";
import AppLayout from "./components/AppLayout";
import AuthPage from "./pages/AuthPage";
import OfflineNotice from "./components/OfflineNotice";
import DashboardPage from "./pages/DashboardPage";
import ActivitiesPage from "./pages/ActivitiesPage";
import HouseholdPage from "./pages/HouseholdPage";
import ExpensesPage from "./pages/ExpensesPage";
import TransactionsPage from "./pages/TransactionsPage";
import BudgetsPage from "./pages/BudgetsPage";
import FinancePage from "./pages/FinancePage";
import MembersPage from "./pages/MembersPage";
import ProfilePage from "./pages/ProfilePage";
import ChoresPage from "./pages/ChoresPage";
import CalendarPage from "./pages/CalendarPage";
import MeritsPage from "./pages/MeritsPage";
import AllowancePage from "./pages/AllowancePage";
import ParentCentrePage from "./pages/ParentCentrePage";
import AcceptInvitePage from "./pages/AcceptInvitePage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";

/**
 * Routes a child has no business on. The API refuses them too — this just
 * avoids showing an error page for a door that was never theirs.
 */
function AdultsOnly({ children }: { children: React.ReactNode }) {
  const { auth } = useAuth();
  if (auth?.member.role === "child") return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  const { auth, isLoading, unreachable, retry } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-full items-center justify-center">
        <PageLoader />
      </div>
    );
  }

  // Offline (or the server is down) and not signed in: say so, rather than
  // showing a sign-in form that can't reach anything.
  if (!auth && unreachable) {
    return <OfflineNotice onRetry={retry} />;
  }

  return (
    <Routes>
      {/* These work whether or not there's a session. */}
      <Route path="/invite/:token" element={<AcceptInvitePage />} />
      <Route path="/forgot" element={<ForgotPasswordPage />} />
      <Route path="/reset/:token" element={<ResetPasswordPage />} />
      {auth ? (
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="activities" element={<ActivitiesPage />} />
          <Route path="household" element={<HouseholdPage />} />
          <Route path="chores" element={<ChoresPage />} />
          <Route path="merits" element={<MeritsPage />} />
          <Route path="allowance" element={<AllowancePage />} />
          <Route path="allowance/:childId" element={<AllowancePage />} />
          <Route path="parents" element={<ParentCentrePage />} />
          <Route
            path="expenses"
            element={
              <AdultsOnly>
                <ExpensesPage />
              </AdultsOnly>
            }
          />
          <Route
            path="transactions"
            element={
              <AdultsOnly>
                <TransactionsPage />
              </AdultsOnly>
            }
          />
          <Route
            path="budgets"
            element={
              <AdultsOnly>
                <BudgetsPage />
              </AdultsOnly>
            }
          />
          <Route
            path="finance"
            element={
              <AdultsOnly>
                <FinancePage />
              </AdultsOnly>
            }
          />
          <Route path="family" element={<MembersPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      ) : (
        <Route path="*" element={<AuthPage />} />
      )}
    </Routes>
  );
}
