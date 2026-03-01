/// <reference types="vite/client" />

declare module '*.vue' {
  import { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

interface ImportMetaEnv {
  readonly VITE_GOOGLE_MAPS_KEY: string
  readonly VITE_BACKEND_URL?: string
  // add other env vars here as needed
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
