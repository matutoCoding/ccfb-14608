import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppWithSuspense } from './App';
import { useStore } from './state/store';
import './styles.css';

useStore.getState().hydrated();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppWithSuspense />
  </StrictMode>,
);
