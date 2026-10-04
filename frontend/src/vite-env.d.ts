/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 'true' exposes /design-system in non-development builds (staging). */
  readonly VITE_SHOW_DESIGN_SYSTEM?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Page copy defaults of one key prefix, registered when imported (frontend/siteCopy.ts). */
declare module 'virtual:site-copy/*' {}
