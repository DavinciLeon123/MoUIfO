/// <reference types="vite/client" />

/** The bundled model: only the Vite build resolves this id (to dist/model.json). */
declare module 'virtual:uio-model' {
  const model: unknown;
  export default model;
}
