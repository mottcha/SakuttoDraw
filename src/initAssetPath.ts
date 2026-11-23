if (typeof window !== 'undefined') {
  const base = import.meta.env.BASE_URL || './';
  window.EXCALIDRAW_ASSET_PATH = new URL(base, window.location.href).toString();
}

export {};
