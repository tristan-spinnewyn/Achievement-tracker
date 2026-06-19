import { tmpdir } from 'os'

/** Stub minimal d'Electron pour les tests Node (store.ts importe `app`). */
export const app = {
  getPath: () => tmpdir(),
  getAppPath: () => process.cwd(),
  isPackaged: false
}

export default { app }
