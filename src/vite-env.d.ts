/// <reference types="svelte" />
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_QAMUZ_SAAS_URL?: string;
  readonly VITE_STUDIO_STANDALONE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
