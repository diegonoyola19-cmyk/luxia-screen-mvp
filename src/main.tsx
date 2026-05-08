import React from 'react';
import ReactDOM from 'react-dom/client';
import { Toaster } from 'sonner';
import { ErrorBoundary } from './ErrorBoundary';
import { App } from './app/App';
import './styles/global.css';
import './styles/production.css';
import './styles/inventory.css';
import './styles/rules.css';
import './styles/orders.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Toaster position="top-right" richColors />
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
