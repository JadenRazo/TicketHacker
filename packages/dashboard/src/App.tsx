import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import TicketListPage from './pages/TicketListPage';
import TicketDetailPage from './pages/TicketDetailPage';
import SettingsPage from './pages/SettingsPage';
import ContactsPage from './pages/ContactsPage';
import CannedResponsesPage from './pages/CannedResponsesPage';
import AutomationsPage from './pages/AutomationsPage';

function App() {
  return (
    <Routes>
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
          <Route path="*" element={<Navigate to="/tickets" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}

export default App;
