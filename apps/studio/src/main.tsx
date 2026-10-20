import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';

const root = document.getElementById('root');
if (!root) throw new Error('StoryStage could not find its page.');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
