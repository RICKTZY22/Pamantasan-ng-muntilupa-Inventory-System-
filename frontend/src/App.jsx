import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import AppRoutes from './routes';
import ThemeProvider from './components/ThemeProvider';
import ErrorBoundary from './components/ErrorBoundary';
import './index.css';

const App = () => {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </ThemeProvider>
    </ErrorBoundary>
  );
};

export default App;
