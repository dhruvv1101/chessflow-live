import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import ReportPage from './report/ReportPage.jsx';
import './styles.css';

function Route() {
  const [reportRoute, setReportRoute] = useState(() => window.location.hash === '#report');
  useEffect(() => {
    const updateRoute = () => setReportRoute(window.location.hash === '#report');
    window.addEventListener('hashchange', updateRoute);
    return () => window.removeEventListener('hashchange', updateRoute);
  }, []);
  return <><div hidden={reportRoute}><App/></div>{reportRoute && <ReportPage/>}</>;
}

createRoot(document.getElementById('root')).render(<React.StrictMode><Route /></React.StrictMode>);
