
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Prevent unhandled Firestore SDK assertions and Firebase Installations/Analytics errors from breaking the UI
const isIgnorableFirebaseError = (err: any) => {
  const str = String(err?.message || err?.reason?.message || err?.code || err || '');
  return (
    str.includes('INTERNAL ASSERTION FAILED') ||
    str.includes('Unexpected state') ||
    str.includes('(ID: ca9)') ||
    str.includes('(ID: b815)') ||
    str.includes('installations/request-failed') ||
    str.includes('installations') ||
    str.includes('Create Installation request failed')
  );
};

window.addEventListener('error', (event) => {
  if (isIgnorableFirebaseError(event.error) || isIgnorableFirebaseError(event.message)) {
    console.warn('[Firebase SDK Error Suppressed]:', event.message || event.error);
    event.preventDefault();
    event.stopImmediatePropagation();
    return true;
  }
}, true);

window.addEventListener('unhandledrejection', (event) => {
  if (isIgnorableFirebaseError(event.reason)) {
    console.warn('[Firebase SDK Rejection Suppressed]:', event.reason);
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}, true);

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
