import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { ToastProvider } from './contexts/ToastContext';
import PublicLayout from './components/layout/PublicLayout';
import AdminLayout from './components/layout/AdminLayout';

import Home from './pages/Home';
import { About, Services, Vehicles, SchoolTransport, Contact } from './pages/PublicPages';
import { Login, ForgotPassword, ResetPassword } from './pages/Login';

import AdminDashboard from './pages/admin/AdminDashboard';
import AdminInquiries from './pages/admin/AdminInquiries';
import AdminVehicles from './pages/admin/AdminVehicles';
import AdminVehicleDetail from './pages/admin/AdminVehicleDetail';
import AdminDrivers from './pages/admin/AdminDrivers';
import AdminCustomers from './pages/admin/AdminCustomers';
import { AdminSchools, AdminSchoolDetail } from './pages/admin/AdminSchools';
import { AdminStudents, AdminStudentDetail } from './pages/admin/AdminStudents';
import { AdminRoutes } from './pages/admin/AdminRoutes';
import AdminSettings from './pages/admin/AdminSettings';
import AdminUsers from './pages/admin/AdminUsers';

// Frontend guard for UX only. Real protection is Row Level Security in the database.
const RequireAdmin: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { loading, isAdmin, authUserId } = useAuth();
  const { pathname } = useLocation();
  if (loading) return <div className="flex-1 flex items-center justify-center py-32 text-ink-400 font-bold">Loading…</div>;
  if (!authUserId || !isAdmin) return <Navigate to={`/login?next=${encodeURIComponent(pathname)}`} replace />;
  return <>{children}</>;
};

const App: React.FC = () => (
  <AuthProvider>
    <SettingsProvider>
      <ToastProvider>
        <Router>
          <Routes>
            <Route element={<PublicLayout />}>
              <Route path="/" element={<Home />} />
              <Route path="/about" element={<About />} />
              <Route path="/services" element={<Services />} />
              <Route path="/vehicles" element={<Vehicles />} />
              <Route path="/school-transport" element={<SchoolTransport />} />
              <Route path="/contact" element={<Contact />} />
            </Route>

            <Route path="/login" element={<Login />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />

            <Route path="/admin" element={<RequireAdmin><AdminLayout /></RequireAdmin>}>
              <Route index element={<AdminDashboard />} />
              <Route path="vehicles" element={<AdminVehicles />} />
              <Route path="vehicles/:id" element={<AdminVehicleDetail />} />
              <Route path="drivers" element={<AdminDrivers />} />
              <Route path="customers" element={<AdminCustomers />} />
              <Route path="schools" element={<AdminSchools />} />
              <Route path="schools/:id" element={<AdminSchoolDetail />} />
              <Route path="students" element={<AdminStudents />} />
              <Route path="students/:id" element={<AdminStudentDetail />} />
              <Route path="routes" element={<AdminRoutes />} />
              <Route path="inquiries" element={<AdminInquiries />} />
              <Route path="settings" element={<AdminSettings />} />
              <Route path="users" element={<AdminUsers />} />
              <Route path="*" element={<Navigate to="/admin" replace />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Router>
      </ToastProvider>
    </SettingsProvider>
  </AuthProvider>
);

export default App;
