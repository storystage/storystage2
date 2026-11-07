import '@storystage/ui/fonts';
import '@storystage/ui/styles.css';
import './shell/shell.css';
import './storyboard/storyboard.css';
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
