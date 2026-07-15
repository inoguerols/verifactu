import { expect, test } from 'vitest'
import { consultaXml, enviarSerie, parseRespuesta, trocear } from '../src/soap.js'
import type { Cabecera } from '../src/types.js'

const cabecera: Cabecera = { NombreRazon: 'Empresa SL', NIF: 'B12345678' }

test('consultaXml genera ConsultaFactuSistemaFacturacion con ejercicio y NIF del obligado', () => {
  const xml = consultaXml(cabecera, { ejercicio: '2024', periodo: '01' })
  expect(xml).toContain('ConsultaFactuSistemaFacturacion')
  expect(xml).toContain('<sfc:IDVersion>1.0</sfc:IDVersion>')
  expect(xml).toContain('2024')
  expect(xml).toContain('B12345678')
  expect(xml).toContain('<sfc:Periodo>01</sfc:Periodo>')
})

test('consultaXml usa el namespace SuministroInformacion.xsd (no ConsultaInformacion)', () => {
  const xml = consultaXml(cabecera, { ejercicio: '2024' })
  expect(xml).toContain('SuministroInformacion.xsd')
  expect(xml).not.toContain('ConsultaInformacion.xsd')
})

test('consultaXml NO incluye NIFEmisor en FiltroConsulta', () => {
  const xml = consultaXml(cabecera, { ejercicio: '2024', NIFEmisor: 'B12345678' })
  expect(xml).not.toContain('<sfc:NIFEmisor>')
})

test('consultaXml incluye ClavePaginacion cuando se pasa', () => {
  const xml = consultaXml(cabecera, {
    ejercicio: '2024',
    clavePaginacion: { IDEmisorFactura: 'B12345678', NumSerieFactura: 'F-1', FechaExpedicionFactura: '01-01-2024' },
  })
  expect(xml).toContain('ClavePaginacion')
  expect(xml).toContain('F-1')
})

test('parseRespuesta: consulta con 0 resultados (sin Registro*) conserva EstadoEnvio y CSV', () => {
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<env:Envelope xmlns:env="http://schemas.xmlsoap.org/soap/envelope/"><env:Body>` +
    `<tikR:RespuestaConsultaFactuSistemaFacturacion xmlns:tikR="https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/RespuestaConsultaLR.xsd">` +
    `<tikR:EstadoEnvio>Correcto</tikR:EstadoEnvio>` +
    `<tikR:CSV>ABC123</tikR:CSV>` +
    `</tikR:RespuestaConsultaFactuSistemaFacturacion>` +
    `</env:Body></env:Envelope>`
  const r = parseRespuesta(xml, 200)
  expect(r.estadoEnvio).toBe('Correcto')
  expect(r.csv).toBe('ABC123')
  expect(r.lineas).toEqual([])
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
