import { expect, test } from 'vitest'
import { crearAlta } from '../src/factura.js'
import { lint } from '../src/lint.js'
import type { NuevaAlta } from '../src/factura.js'
import type { SistemaInformatico } from '../src/types.js'

const SIF: SistemaInformatico = {
  NombreRazon: 'Test SA',
  NIF: 'B00000000',
  NombreSistemaInformatico: 'TestSIF',
  IdSistemaInformatico: 'T1',
  Version: '1.0',
  NumeroInstalacion: 'INS001',
  TipoUsoPosibleSoloVerifactu: 'S',
  TipoUsoPosibleMultiOT: 'N',
  IndicadorMultiplesOT: 'N',
}

const BASE: NuevaAlta = {
  IDEmisorFactura: 'B00000000',
  NumSerieFactura: 'F-2024-001',
  NombreRazonEmisor: 'Test SA',
  DescripcionOperacion: 'Servicios de consultoría',
  Destinatarios: [{ NombreRazon: 'Cliente SL', NIF: 'B00000000' }],
  Desglose: [
    {
      CalificacionOperacion: 'S1',
      TipoImpositivo: '21',
      BaseImponibleOimporteNoSujeto: '100',
      CuotaRepercutida: '21',
    },
  ],
  CuotaTotal: '21',
  ImporteTotal: '121',
  SistemaInformatico: SIF,
  FechaExpedicionFactura: '01-01-2024',
  FechaHoraHusoGenRegistro: '2024-01-01T10:00:00Z',
}

test('crearAlta rellena IDVersion y TipoHuella', () => {
  const r = crearAlta(BASE)
  expect(r.IDVersion).toBe('1.0')
  expect(r.TipoHuella).toBe('01')
})

test('crearAlta sella FechaHoraHusoGenRegistro si falta', () => {
  const { FechaHoraHusoGenRegistro: _, ...sinFecha } = BASE
  const r = crearAlta(sinFecha)
  expect(r.FechaHoraHusoGenRegistro).toBeTruthy()
  expect(r.FechaHoraHusoGenRegistro).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
})

test('crearAlta calcula Huella de 64 hex mayúsculas', () => {
  const r = crearAlta(BASE)
  expect(r.Huella).toMatch(/^[0-9A-F]{64}$/)
})

test('crearAlta produce registro que lint acepta con 0 errores (F1 + destinatario + desglose S1 21%)', () => {
  const r = crearAlta(BASE)
  const informe = lint([r])
  expect(informe.errores).toBe(0)
})
