import { tmpdir } from 'os'

/** Stub minimal d'Electron pour les tests Node (store.ts importe `app`). */
let _isPackaged = false

export const setMockPackaged = (val: boolean): void => {
  _isPackaged = val
}

export const app = {
  getPath: (_name?: string) => tmpdir(),
  getAppPath: () => process.cwd(),
  getVersion: () => '1.0.1',
  get isPackaged() {
    return _isPackaged
  },
  set isPackaged(val: boolean) {
    _isPackaged = val
  }
}

export const shell = {
  openPath: async () => ''
}

let mockSaveResult = { canceled: true } as { canceled: boolean; filePath?: string }
let mockOpenResult = { canceled: true, filePaths: [] } as { canceled: boolean; filePaths: string[] }

export const setMockDialog = {
  save: (res: { canceled: boolean; filePath?: string }) => {
    mockSaveResult = res
  },
  open: (res: { canceled: boolean; filePaths: string[] }) => {
    mockOpenResult = res
  }
}

export const dialog = {
  showSaveDialog: async () => mockSaveResult,
  showOpenDialog: async () => mockOpenResult
}

export class BrowserWindow {
  webContents = {
    send: (_channel: string, ..._args: unknown[]) => {}
  }
  isDestroyed = () => false
}

export default { app, shell, dialog, BrowserWindow }
