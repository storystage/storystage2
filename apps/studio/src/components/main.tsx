import '@storystage/ui/fonts';
import '@storystage/ui/styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ComponentSheet } from './ComponentSheet.tsx';

const root = document.getElementById('root');
if (!root) throw new Error('StoryStage could not find its page.');
document.body.style.margin = '0';
createRoot(root).render(
  <StrictMode>
    <ComponentSheet />
  </StrictMode>,
);
