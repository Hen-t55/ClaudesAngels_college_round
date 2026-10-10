import React from 'react';
import { createRoot } from 'react-dom/client';

const root = createRoot(document.getElementById('root')!);
root.render(
  <div style={{ padding: 20, fontFamily: 'system-ui' }}>
    <h1>⚙️ Engine Dev Harness</h1>
    <p>P2: resolver & action engine sandbox.</p>
  </div>
);
