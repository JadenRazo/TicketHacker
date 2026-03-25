import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store/auth';

export default function ProtectedRoute() {
  const { accessToken } = useAuthStore();

  if (!accessToken) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
