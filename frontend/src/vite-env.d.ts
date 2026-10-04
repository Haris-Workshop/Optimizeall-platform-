/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 'true' exposes /design-system in non-development builds (staging). */
  readonly VITE_SHOW_DESIGN_SYSTEM?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module 'virtual:site-copy-defaults' {
  const defaults: Record<string, string>;
  export default defaults;
}
