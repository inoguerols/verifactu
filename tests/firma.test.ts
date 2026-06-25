import 'reflect-metadata'
import { expect, test } from 'vitest'
import { Crypto } from '@peculiar/webcrypto'
import * as x509 from '@peculiar/x509'
import { firmarRegistro, verificarFirma } from '../src/firma.js'

const ALG = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' } as const

function pem(der: ArrayBuffer, label: string): string {
  const b64 = Buffer.from(der).toString('base64').replace(/(.{64})/g, '$1\n')
  return `-----BEGIN ${label}-----\n${b64}\n-----END ${label}-----`
}

// Genera un par RSA + certificado autofirmado en tiempo de test (determinista, sin red).
async function credencialTest(): Promise<{ cert: string; key: string }> {
  const crypto = new Crypto()
  x509.cryptoProvider.set(crypto)
  const keys = await crypto.subtle.generateKey(
    { ...ALG, modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) },
    true,
    ['sign', 'verify'],
  )
  const cert = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: '01',
    name: 'CN=VeriFactu Test',
    notBefore: new Date('2020-01-01'),
    notAfter: new Date('2035-01-01'),
    keys,
    signingAlgorithm: ALG,
  })
  const pkcs8 = await crypto.subtle.exportKey('pkcs8', keys.privateKey)
  return { cert: cert.toString('pem'), key: pem(pkcs8, 'PRIVATE KEY') }
}

const REG = '<RegFactuSistemaFacturacion><RegistroAlta><x>hola</x></RegistroAlta></RegFactuSistemaFacturacion>'

test('firmarRegistro inserta una firma XAdES enveloped con cert y SigningTime', async () => {
  const cred = await credencialTest()
  const out = await firmarRegistro(REG, cred)
  expect(out).toContain('Signature')
  expect(out).toMatch(/SigningTime/)
  expect(out).toMatch(/SigningCertificate/)
  expect(out).toMatch(/X509Certificate/)
  // digest SHA-256 + RSA-SHA256
  expect(out).toMatch(/xmlenc#sha256|2001\/04\/xmlenc#sha256/)
  expect(out).toMatch(/rsa-sha256/)
})

test('verificarFirma valida la firma recién generada (roundtrip)', async () => {
  const cred = await credencialTest()
  const out = await firmarRegistro(REG, cred)
  expect(await verificarFirma(out)).toBe(true)
})

test('verificarFirma devuelve false si no hay firma', async () => {
  expect(await verificarFirma(REG)).toBe(false)
})
