import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import TicketListPage from './pages/TicketListPage';
import TicketDetailPage from './pages/TicketDetailPage';
import PortalLoginPage from './pages/portal/PortalLoginPage';
import PortalVerifyPage from './pages/portal/PortalVerifyPage';
import PortalTicketsPage from './pages/portal/PortalTicketsPage';
import PortalTicketDetailPage from './pages/portal/PortalTicketDetailPage';

const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const ContactsPage = lazy(() => import('./pages/ContactsPage'));
const CannedResponsesPage = lazy(() => import('./pages/CannedResponsesPage'));
const AutomationsPage = lazy(() => import('./pages/AutomationsPage'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));
const KnowledgeBasePage = lazy(() => import('./pages/KnowledgeBasePage'));

function App() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen">Loading...</div>}>
    <Routes>
      {/* Public customer portal – no agent auth required */}
      <Route path="/portal/:tenantSlug" element={<PortalLoginPage />} />
      <Route path="/portal/:tenantSlug/verify" element={<PortalVerifyPage />} />
      <Route path="/portal/:tenantSlug/tickets" element={<PortalTicketsPage />} />
      <Route path="/portal/:tenantSlug/tickets/:ticketId" element={<PortalTicketDetailPage />} />

      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/tickets" replace />} />
          <Route path="/tickets" element={<TicketListPage />} />
          <Route path="/tickets/:id" element={<TicketDetailPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/contacts" element={<ContactsPage />} />
          <Route path="/canned-responses" element={<CannedResponsesPage />} />
          <Route path="/automations" element={<AutomationsPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/knowledge-base" element={<KnowledgeBasePage />} />
          <Route path="*" element={<Navigate to="/tickets" replace />} />
        </Route>
      </Route>
    </Routes>
    </Suspense>
  );
}

export default App;
