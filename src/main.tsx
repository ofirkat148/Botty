import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import ShareView from './ShareView.tsx';
import './index.css';

const path = window.location.pathname;
const shareMatch = path.match(/^\/share\/([A-Za-z0-9_-]{20,40})$/);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {shareMatch ? <ShareView token={shareMatch[1]} /> : <App />}
  </StrictMode>,
);
