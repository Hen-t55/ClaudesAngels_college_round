import React from 'react';
import { createRoot } from 'react-dom/client';

const root = createRoot(document.getElementById('root')!);
root.render(
  <div style={{ padding: 20, fontFamily: 'system-ui' }}>
    <h1>🎨 Overlay Dev Harness</h1>
    <p>P4: overlay & UI sandbox.</p>
  </div>
);
