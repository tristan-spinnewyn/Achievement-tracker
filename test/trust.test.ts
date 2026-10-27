import { describe, it, expect } from 'vitest'
import { isTrustedSender } from '../src/main/ipc/trust'

const APP = 'file:///C:/Program%20Files/App/resources/app.asar/out/renderer/index.html'
const DEV = 'http://localhost:5173'

describe('isTrustedSender', () => {
  it("accepte la page de l'application (casse et hash/query indifférents)", () => {
    expect(isTrustedSender(APP, APP)).toBe(true)
    expect(isTrustedSender(APP + '#/recurring', APP)).toBe(true)
    expect(isTrustedSender(APP.replace('Program%20Files', 'program files'), APP)).toBe(true)
  })

  it('refuse toute autre page locale ou distante', () => {
    expect(isTrustedSender('file:///C:/Users/me/Downloads/evil.html', APP)).toBe(false)
    expect(isTrustedSender('https://evil.example/', APP)).toBe(false)
    expect(isTrustedSender('about:blank', APP)).toBe(false)
    expect(isTrustedSender('', APP)).toBe(false)
    expect(isTrustedSender(null, APP)).toBe(false)
    expect(isTrustedSender('pas une url', APP)).toBe(false)
  })

  it('accepte le serveur Vite uniquement quand il est fourni (dev)', () => {
    expect(isTrustedSender(DEV + '/', APP, DEV)).toBe(true)
    expect(isTrustedSender(DEV + '/', APP)).toBe(false)
    expect(isTrustedSender('http://localhost:6666/', APP, DEV)).toBe(false)
    expect(isTrustedSender(APP, APP, 'url invalide')).toBe(true)
  })
})
