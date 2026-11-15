import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { ToastProvider } from './contexts/ToastContext';
import ErrorBoundary from './components/ErrorBoundary';
import PublicLayout from './components/layout/PublicLayout';

import Home from './pages/Home';
import NotFound from './pages/NotFound';
import { About, Services, Vehicles, SchoolTransport, Contact } from './pages/PublicPages';
import { Login, ForgotPassword, ResetPassword } from './pages/Login';

// The whole admin area (charts, PDF/Excel libraries, forms) is loaded only when a signed-in admin opens it,
// so public visitors download a much smaller site.
const AdminLayout = lazy(() => import('./components/layout/AdminLayout'));
const page = <T extends string>(loader: () => Promise<Record<T, React.ComponentType>>, name: T) => lazy(() => loader().then(m => ({ default: m[name] })));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminInquiries = lazy(() => import('./pages/admin/AdminInquiries'));
const AdminVehicles = lazy(() => import('./pages/admin/AdminVehicles'));
const AdminVehicleDetail = lazy(() => import('./pages/admin/AdminVehicleDetail'));
const AdminDrivers = lazy(() => import('./pages/admin/AdminDrivers'));
const AdminCustomers = lazy(() => import('./pages/admin/AdminCustomers'));
const AdminSchools = page(() => import('./pages/admin/AdminSchools'), 'AdminSchools');
const AdminSchoolDetail = page(() => import('./pages/admin/AdminSchools'), 'AdminSchoolDetail');
const AdminStudents = page(() => import('./pages/admin/AdminStudents'), 'AdminStudents');
const AdminStudentDetail = page(() => import('./pages/admin/AdminStudents'), 'AdminStudentDetail');
const AdminRoutes = page(() => import('./pages/admin/AdminRoutes'), 'AdminRoutes');
const AdminBilling = lazy(() => import('./pages/admin/AdminBilling'));
const AdminBookings = lazy(() => import('./pages/admin/AdminBookings'));
const AdminCalendar = lazy(() => import('./pages/admin/AdminCalendar'));
const AdminPayments = lazy(() => import('./pages/admin/AdminPayments'));
const AdminIncome = lazy(() => import('./pages/admin/AdminIncome'));
const AdminExpenses = lazy(() => import('./pages/admin/AdminExpenses'));
const AdminFuel = lazy(() => import('./pages/admin/AdminFuel'));
const AdminMaintenance = lazy(() => import('./pages/admin/AdminMaintenance'));
const AdminDocuments = lazy(() => import('./pages/admin/AdminDocuments'));
const AdminReports = lazy(() => import('./pages/admin/AdminReports'));
const AdminNotifications = lazy(() => import('./pages/admin/AdminNotifications'));
const AdminAudit = lazy(() => import('./pages/admin/AdminAudit'));
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings'));
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers'));

const Loading: React.FC = () => <div className="flex-1 flex items-center justify-center py-32 text-ink-400 font-bold" role="status">Loading…</div>;

// Frontend guard for UX only. Real protection is Row Level Security in the database.
const RequireAdmin: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { loading, isAdmin, authUserId } = useAuth();
  const { pathname } = useLocation();
  if (loading) return <Loading />;
  if (!authUserId || !isAdmin) return <Navigate to={`/login?next=${encodeURIComponent(pathname)}`} replace />;
  return <>{children}</>;
};

const App: React.FC = () => (
  <ErrorBoundary>
    <AuthProvider>
      <SettingsProvider>
        <ToastProvider>
          <Router>
            <Suspense fallback={<Loading />}>
              <Routes>
                <Route element={<PublicLayout />}>
                  <Route path="/" element={<Home />} />
                  <Route path="/about" element={<About />} />
                  <Route path="/services" element={<Services />} />
                  <Route path="/vehicles" element={<Vehicles />} />
                  <Route path="/school-transport" element={<SchoolTransport />} />
                  <Route path="/contact" element={<Contact />} />
                  <Route path="*" element={<NotFound />} />
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
                  <Route path="billing" element={<AdminBilling />} />
                  <Route path="bookings" element={<AdminBookings />} />
                  <Route path="calendar" element={<AdminCalendar />} />
                  <Route path="payments" element={<AdminPayments />} />
                  <Route path="income" element={<AdminIncome />} />
                  <Route path="expenses" element={<AdminExpenses />} />
                  <Route path="fuel" element={<AdminFuel />} />
                  <Route path="maintenance" element={<AdminMaintenance />} />
                  <Route path="documents" element={<AdminDocuments />} />
                  <Route path="reports" element={<AdminReports />} />
                  <Route path="notifications" element={<AdminNotifications />} />
                  <Route path="audit" element={<AdminAudit />} />
                  <Route path="inquiries" element={<AdminInquiries />} />
                  <Route path="settings" element={<AdminSettings />} />
                  <Route path="users" element={<AdminUsers />} />
                  <Route path="*" element={<Navigate to="/admin" replace />} />
                </Route>
              </Routes>
            </Suspense>
          </Router>
        </ToastProvider>
      </SettingsProvider>
    </AuthProvider>
  </ErrorBoundary>
);

export default App;
