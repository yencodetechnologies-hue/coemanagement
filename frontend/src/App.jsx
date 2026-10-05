// import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
// import Login from './pages/login';
// import Dashboard from './pages/dashboard'
// import './App.css';

// Simple placeholder home page — replace with your real landing page later
function Home() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <h1>Home Page</h1>
    </div>
  );
}

// export default function App() {
//   return (
//     <BrowserRouter>
//       <Routes>
//         <Route path="/" element={<Home />} />
//         <Route path="/login" element={<Login />} />
//         <Route path="/dashboard" element={<Dashboard />} />

//         {/* Fallback: unknown routes go back to home */}
//         {/* <Route path="*" element={<Navigate to="/" replace />} /> */}
//       </Routes>
//     </BrowserRouter>
//   );
// }


// src/App.jsx
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import DashboardLayout from './layouts/DashboardLayout';
import ProtectedRoute, { PublicOnlyRoute } from './components/ProtectedRoute';
import { NAV_GROUPS } from './components/Sidebar';
import Institutions from './pages/Institutions';
import SettingsRoute from './pages/Settingsroute';
import SectionPage from './pages/Sectionpage';
import CoeStaff from './pages/CoeStaff';
import Login from './pages/login';
import Dashboard from './pages/dashboard'
import Students from './pages/Students';
import Courses from './pages/Courses'
import CurriculumMaster from './pages/CurriculumMaster';
import './App.css';
import AttendanceInternalMarks from './pages/Attendanceinternalmarks';
import StudentNonminalRoll from './pages/StudentNominalRoll';
import TheoryTimeTable from './pages/TheoryTimeTable'
import ApplicationHallTicket from './pages/ApplicationHallTicket';
import BarcodeMapping from './pages/Barcodemapping';
import Rebundle from './pages/rebundle';
import ExternalMarkEntry from './pages/markEntry';
import ResultProcessing from './pages/Resultprocessing';
import SemesterGradeStatement from './pages/Semestergradesystem';
import ConsolidatedGradeStatement from './pages/Consolidatedgradestatement';
import ProvisionalCertificate from './pages/Provisionalcertificate';
import Reports from './pages/Reports';
import AuditLog from './pages/Auditlog';
import RolesPermissions from './pages/Rolespermissions';

// Screens that are built. Every other menu item shows the placeholder SectionPage.
const PAGES = {
  '/institute': <Institutions />,
 '/coe-staff': <CoeStaff />,
  '/settings': <SettingsRoute />,
  '/students': <Students />,
  '/course': <Courses />,
  '/curriculum-master': <CurriculumMaster />,
   '/attendance-internal-marks': <AttendanceInternalMarks/>,
  '/student-nominal-roll': <StudentNonminalRoll/>,
  '/theory-time-table': <TheoryTimeTable />,
  '/application-hall-ticket': <ApplicationHallTicket />,
  '/bar-code-mapping':<BarcodeMapping />,
  '/re-bundle' : <Rebundle />,
  '/mark-entry' : <ExternalMarkEntry />,
  '/result-processing' : <ResultProcessing />,
  '/semester-grade-statement' : <SemesterGradeStatement />,
  '/consolidated-grade-statement' : <ConsolidatedGradeStatement />,
  '/provisional-certificate' : <ProvisionalCertificate />,
  '/reports' : <Reports/>,
  '/audit-log' : <AuditLog />,
  '/roles-permissions' : <RolesPermissions />
};

const items = NAV_GROUPS.flatMap((g) => g.items);

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* <Route path="/login" element={<Login />} />   ← keep your existing login route here */}
        <Route path="/" element={<Home />} />
               <Route path="/login" element={<PublicOnlyRoute><Login /></PublicOnlyRoute>} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />

        <Route element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          {items.map((i) => (
            <Route key={i.path} path={i.path} element={PAGES[i.path] || <SectionPage name={i.name} />} />
          ))}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}