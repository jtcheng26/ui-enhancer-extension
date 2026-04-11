import React from 'react';
import ReactDOM from 'react-dom/client';

import '../../../assets/tailwind.css';
import { SidepanelApp } from '../../sidepanel/SidepanelApp';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SidepanelApp />
  </React.StrictMode>,
);
