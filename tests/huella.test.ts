import { expect, test } from 'vitest'
import { cadenaAlta, cadenaAnulacion, computeHuellaAlta, encadenarAltas } from '../src/huella.js'

// Vector oficial replicado (AEAT). La cadena exacta produce este SHA-256.
const VECTOR = {
  IDEmisorFactura: '89890001K',
  NumSerieFactura: '12345678/G33',
  FechaExpedicionFactura: '01-01-2024',
  TipoFactura: 'F1',
  CuotaTotal: '12.35',
  ImporteTotal: '123.45',
  huellaAnterior: '',
  FechaHoraHusoGenRegistro: '2024-01-01T19:20:30+01:00',
}
const VECTOR_HASH =
  '3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60'

test('cadena canónica del registro de alta (primer registro: Huella vacía)', () => {
  expect(cadenaAlta(VECTOR)).toBe(
    'IDEmisorFactura=89890001K&NumSerieFactura=12345678/G33&FechaExpedicionFactura=01-01-2024&TipoFactura=F1&CuotaTotal=12.35&ImporteTotal=123.45&Huella=&FechaHoraHusoGenRegistro=2024-01-01T19:20:30+01:00',
  )
})

test('huella reproduce el vector oficial', () => {
  expect(computeHuellaAlta(VECTOR)).toBe(VECTOR_HASH)
})

test('encadenamiento: el primer registro usa Huella vacía y el 2º la del 1º', () => {
  const base = {
    IDEmisorFactura: '89890001K',
    FechaExpedicionFactura: '01-01-2024',
    TipoFactura: 'F1',
    CuotaTotal: '12.35',
    ImporteTotal: '123.45',
    FechaHoraHusoGenRegistro: '2024-01-01T19:20:30+01:00',
  }
  const huellas = encadenarAltas([
    { ...base, NumSerieFactura: '12345678/G33' },
    { ...base, NumSerieFactura: '12345679/G33' },
  ])
  expect(huellas[0]).toBe(VECTOR_HASH)
  // la 2ª huella depende de la 1ª (cadena)
  expect(huellas[1]).not.toBe(huellas[0])
  expect(huellas[1]).toMatch(/^[0-9A-F]{64}$/)
})

test('cadena canónica del registro de anulación (5 campos en orden)', () => {
  expect(
    cadenaAnulacion({
      IDEmisorFacturaAnulada: '89890001K',
      NumSerieFacturaAnulada: '12345678/G33',
      FechaExpedicionFacturaAnulada: '01-01-2024',
      huellaAnterior: '',
      FechaHoraHusoGenRegistro: '2024-01-01T19:20:30+01:00',
    }),
  ).toBe(
    'IDEmisorFacturaAnulada=89890001K&NumSerieFacturaAnulada=12345678/G33&FechaExpedicionFacturaAnulada=01-01-2024&Huella=&FechaHoraHusoGenRegistro=2024-01-01T19:20:30+01:00',
  )
})
