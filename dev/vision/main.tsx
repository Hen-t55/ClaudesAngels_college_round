import React from 'react';
import { createRoot } from 'react-dom/client';

const root = createRoot(document.getElementById('root')!);
root.render(
  <div style={{ padding: 20, fontFamily: 'system-ui' }}>
    <h1>🎥 Vision Dev Harness</h1>
    <p>P1: head-tracking development sandbox.</p>
  </div>
);
