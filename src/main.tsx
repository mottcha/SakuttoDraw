import './initAssetPath';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

async function bootstrap() {
  const { App } = await import('./App');
  const rootEl = document.getElementById('root');
  if (rootEl) {
    createRoot(rootEl).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  }
}

void bootstrap();
