import '@storystage/ui/fonts';
import '@storystage/ui/styles.css';
import './shell/shell.css';
import './storyboard/storyboard.css';
import './production/production.css';
import './lesson/lesson.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { exampleProduction } from '@storystage/production';
import { App } from './App.tsx';

const root = document.getElementById('root');
if (!root) throw new Error('StoryStage could not find its page.');

// `?example` opens the example production, unsaved, for trying the Code editor and for the
// end-to-end tests. Otherwise a lesson starts: the name page, or the device's own films (07-ux 9.1).
const start = new URLSearchParams(location.search).has('example') ? exampleProduction() : undefined;

createRoot(root).render(
  <StrictMode>
    <App start={start} />
  </StrictMode>,
);
