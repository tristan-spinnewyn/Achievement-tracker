import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'
import { installApi } from './api'

beforeEach(() => {
  installApi()
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})
