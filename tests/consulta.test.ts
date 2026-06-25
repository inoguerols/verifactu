import { expect, test } from 'vitest'
import { consultaXml, enviarSerie, trocear } from '../src/soap.js'
import type { Cabecera } from '../src/types.js'

const cabecera: Cabecera = { NombreRazon: 'Empresa SL', NIF: 'B12345678' }

test('consultaXml genera ConsultaFactuSistemaFacturacion con ejercicio y NIF del obligado', () => {
  const xml = consultaXml(cabecera, { ejercicio: '2024', periodo: '01' })
  expect(xml).toContain('ConsultaFactuSistemaFacturacion')
  expect(xml).toContain('2024')
  expect(xml).toContain('B12345678')
  expect(xml).toContain('<sfc:Periodo>01</sfc:Periodo>')
})

test('consultaXml incluye ClavePaginacion cuando se pasa', () => {
  const xml = consultaXml(cabecera, {
    ejercicio: '2024',
    clavePaginacion: { IDEmisorFactura: 'B12345678', NumSerieFactura: 'F-1', FechaExpedicionFactura: '01-01-2024' },
  })
  expect(xml).toContain('ClavePaginacion')
  expect(xml).toContain('F-1')
})

test('trocear parte 2500 elementos en lotes de [1000, 1000, 500]', () => {
  const xs = Array.from({ length: 2500 }, (_, i) => i)
  const lotes = trocear(xs)
  expect(lotes.map((l) => l.length)).toEqual([1000, 1000, 500])
  // sin pérdida ni solapamiento
  expect(lotes.flat()).toEqual(xs)
})

test('enviarSerie está exportada (chunking probado vía trocear sin red)', () => {
  expect(typeof enviarSerie).toBe('function')
})
