/// <reference types="svelte" />
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_QAMUZ_SAAS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
