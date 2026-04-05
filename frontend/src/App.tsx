import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AuthCallbackPage } from './pages/AuthCallbackPage';
import { AttemptPage } from './pages/AttemptPage';
import { BlueprintPage } from './pages/BlueprintPage';
import { DashboardPage } from './pages/DashboardPage';
import { ImportPage } from './pages/ImportPage';
import { LoginPage } from './pages/LoginPage';
import { QuestionBankPage } from './pages/QuestionBankPage';
import { ResultsPage } from './pages/ResultsPage';
import { ReviewPage } from './pages/ReviewPage';
import { TestsPage } from './pages/TestsPage';

function PrivateApp() {
  return (
    <AppLayout>
      <Routes>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/blueprints" element={<BlueprintPage />} />
        <Route path="/import" element={<ImportPage />} />
        <Route path="/question-bank" element={<QuestionBankPage />} />
        <Route path="/tests" element={<TestsPage />} />
        <Route path="/results" element={<ResultsPage />} />
        <Route path="/attempts/:id" element={<AttemptPage />} />
        <Route path="/review/:id" element={<ReviewPage />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AppLayout>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <PrivateApp />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

