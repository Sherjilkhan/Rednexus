import { Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { homeFor, useAuth } from './auth.jsx';
import Logo from './components/Logo.jsx';
import NotificationBell from './components/NotificationBell.jsx';
import { Loading } from './components/ui.jsx';

import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import RegisterDonor from './pages/RegisterDonor.jsx';
import RegisterInstitution from './pages/RegisterInstitution.jsx';
import CampRegister from './pages/CampRegister.jsx';
import Camps from './pages/Camps.jsx';

import DonorHome from './pages/donor/DonorHome.jsx';
import DonorRequests from './pages/donor/DonorRequests.jsx';
import DonorHistory from './pages/donor/DonorHistory.jsx';
import DonorPreferences from './pages/donor/DonorPreferences.jsx';
import DonorProfile from './pages/donor/DonorProfile.jsx';

import BankOverview from './pages/bank/BankOverview.jsx';
import BankUsage from './pages/bank/BankUsage.jsx';
import BankThresholds from './pages/bank/BankThresholds.jsx';
import BankRequests from './pages/bank/BankRequests.jsx';
import BankRequestDetail from './pages/bank/BankRequestDetail.jsx';
import BankDonors from './pages/bank/BankDonors.jsx';
import BankCamps from './pages/bank/BankCamps.jsx';
import BankAudit from './pages/bank/BankAudit.jsx';
import BankProfile from './pages/bank/BankProfile.jsx';

import AdminHome from './pages/admin/AdminHome.jsx';
import AdminInstitutions from './pages/admin/AdminInstitutions.jsx';
import AdminAudit from './pages/admin/AdminAudit.jsx';

const NAV = {
  DONOR: [
    ['/donor', 'My donation status'],
    ['/donor/requests', 'Requests for me'],
    ['/donor/history', 'My donations'],
    ['/camps', 'Camps'],
    ['/donor/preferences', 'Preferences'],
    ['/donor/profile', 'My profile'],
  ],
  BLOOD_BANK_STAFF: [
    ['/bank', 'Stock & thresholds'],
    ['/bank/usage', 'Report usage'],
    ['/bank/thresholds', 'Confirm thresholds'],
    ['/bank/requests', 'Alerts & requests'],
    ['/bank/donors', 'Donor pool'],
    ['/bank/camps', 'Camps'],
    ['/bank/audit', 'Audit trail'],
    ['/bank/profile', 'My profile'],
  ],
  PLATFORM_ADMIN: [
    ['/admin', 'Platform stats'],
    ['/admin/institutions', 'Blood bank approvals'],
    ['/admin/audit', 'Audit trail'],
  ],
};

function AppBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const links = user ? NAV[user.role] || [] : [];
  return (
    <header className="appbar">
      <div className="wrap appbar-inner">
        <NavLink to={user ? homeFor(user) : '/'} className="brand" style={{ textDecoration: 'none' }}>
          <Logo />
        </NavLink>
        <nav className="nav">
          {links.map(([to, label]) => (
            <NavLink key={to} to={to} end={to === '/donor' || to === '/bank' || to === '/admin'}>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="spacer" />
        {user ? (
          <div className="row" style={{ gap: 12 }}>
            {user.role === 'DONOR' && <NotificationBell />}
            <div className="who">
              <strong>{user.name}</strong>
              <div className="muted">
                {user.role === 'BLOOD_BANK_STAFF' ? user.institution_name : user.role.replace('_', ' ').toLowerCase()}
              </div>
            </div>
            <button
              className="btn-ghost btn-sm"
              onClick={() => {
                logout();
                navigate('/');
              }}
            >
              Sign out
            </button>
          </div>
        ) : (
          <div className="row">
            <NavLink to="/register" className="btn btn-ghost btn-lg">Register as donor</NavLink>
            <NavLink to="/login" className="btn btn-primary btn-lg">Sign in</NavLink>
          </div>
        )}
      </div>
    </header>
  );
}

function Guard({ role, children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="wrap section"><Loading rows={4} /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to={homeFor(user)} replace />;
  // F2: an unverified blood bank cannot act at all. The API enforces this with 403s;
  // the UI states it once, plainly, instead of letting every page fail with an error.
  if (role === 'BLOOD_BANK_STAFF' && !user.institution_verified) {
    return (
      <div className="wrap section">
        <div className="card">
          <span className="eyebrow">Awaiting platform verification</span>
          <h1 style={{ margin: '10px 0 8px' }}>{user.institution_name} is not verified yet</h1>
          <p className="small">
            Its current status is <strong>{user.institution_status}</strong>. Until a platform admin verifies this blood
            bank, its staff cannot report usage, confirm thresholds, see the donor pool, or contact a single donor.
          </p>
          <div className="note note-amber" style={{ marginTop: 16 }}>
            This is enforced on the server, not just hidden in the interface — and it is never bypassed, including in this
            demo. Sign in as <code>staff@citybank.in</code> to see a verified bank, or as{' '}
            <code>admin@raktasetu.in</code> to approve this one.
          </div>
        </div>
      </div>
    );
  }
  return children;
}

export default function App() {
  const { user } = useAuth();
  return (
    <>
      <AppBar />
      <main>
        <Routes>
          <Route path="/" element={user ? <Navigate to={homeFor(user)} replace /> : <Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<RegisterDonor />} />
          <Route path="/register-institution" element={<RegisterInstitution />} />
          <Route path="/camps" element={<Camps />} />
          <Route path="/camp-register" element={<CampRegister />} />

          <Route path="/donor" element={<Guard role="DONOR"><DonorHome /></Guard>} />
          <Route path="/donor/requests" element={<Guard role="DONOR"><DonorRequests /></Guard>} />
          <Route path="/donor/history" element={<Guard role="DONOR"><DonorHistory /></Guard>} />
          <Route path="/donor/preferences" element={<Guard role="DONOR"><DonorPreferences /></Guard>} />
          <Route path="/donor/profile" element={<Guard role="DONOR"><DonorProfile /></Guard>} />

          <Route path="/bank" element={<Guard role="BLOOD_BANK_STAFF"><BankOverview /></Guard>} />
          <Route path="/bank/usage" element={<Guard role="BLOOD_BANK_STAFF"><BankUsage /></Guard>} />
          <Route path="/bank/thresholds" element={<Guard role="BLOOD_BANK_STAFF"><BankThresholds /></Guard>} />
          <Route path="/bank/requests" element={<Guard role="BLOOD_BANK_STAFF"><BankRequests /></Guard>} />
          <Route path="/bank/requests/:id" element={<Guard role="BLOOD_BANK_STAFF"><BankRequestDetail /></Guard>} />
          <Route path="/bank/donors" element={<Guard role="BLOOD_BANK_STAFF"><BankDonors /></Guard>} />
          <Route path="/bank/camps" element={<Guard role="BLOOD_BANK_STAFF"><BankCamps /></Guard>} />
          <Route path="/bank/audit" element={<Guard role="BLOOD_BANK_STAFF"><BankAudit /></Guard>} />
          <Route path="/bank/profile" element={<Guard role="BLOOD_BANK_STAFF"><BankProfile /></Guard>} />

          <Route path="/admin" element={<Guard role="PLATFORM_ADMIN"><AdminHome /></Guard>} />
          <Route path="/admin/institutions" element={<Guard role="PLATFORM_ADMIN"><AdminInstitutions /></Guard>} />
          <Route path="/admin/audit" element={<Guard role="PLATFORM_ADMIN"><AdminAudit /></Guard>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  );
}