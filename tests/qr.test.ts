import { expect, test } from 'vitest'
import { qrUrl, qrSvg } from '../src/qr.js'

const P = { nif: '89890001K', numserie: '12345678/G33', fecha: '01-01-2024', importe: '123.45' }

test('URL de cotejo: orden de parámetros y encoding (/ → %2F)', () => {
  expect(qrUrl(P)).toBe(
    'https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR?nif=89890001K&numserie=12345678%2FG33&fecha=01-01-2024&importe=123.45',
  )
})

test('encoding de / y espacio y endpoint de producción (gob.es)', () => {
  const url = qrUrl({ ...P, numserie: '12345678/G 33' })
  expect(url).toContain('numserie=12345678%2FG%2033')
  expect(url).toContain('https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR?')
})

test('entorno de pruebas usa prewww2', () => {
  expect(qrUrl(P, 'pruebas')).toContain('https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?')
})

test('render SVG produce un <svg>', async () => {
  const svg = await qrSvg(P)
  expect(svg).toContain('<svg')
})
