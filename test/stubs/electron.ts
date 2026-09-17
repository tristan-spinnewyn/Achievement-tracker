import { tmpdir } from 'os'

/** Stub minimal d'Electron pour les tests Node (store.ts importe `app`). */
export const app = {
  getPath: (_name?: string) => tmpdir(),
  getAppPath: () => process.cwd(),
  isPackaged: false
}

export const shell = {
  openPath: async () => ''
}

export const dialog = {
  showSaveDialog: async () => ({ canceled: true }),
  showOpenDialog: async () => ({ canceled: true, filePaths: [] })
}

export default { app, shell, dialog }
