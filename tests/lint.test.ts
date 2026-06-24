import { expect, test } from 'vitest'
import { computeHuellaAlta } from '../src/huella.js'
import { lint } from '../src/lint.js'
import type { RegistroAlta } from '../src/types.js'

const SIF = {
  NombreRazon: 'ACME SL', NIF: 'B12345678',
  NombreSistemaInformatico: 'ACME Facturador', IdSistemaInformatico: '01',
  Version: '1.0', NumeroInstalacion: '001',
}

function alta(num: string, huellaAnterior: string, prev?: RegistroAlta): RegistroAlta {
  const IDFactura = { IDEmisorFactura: '89890001K', NumSerieFactura: num, FechaExpedicionFactura: '01-01-2024' }
  const base = {
    IDVersion: '1.0', IDFactura, NombreRazonEmisor: 'ACME SL', TipoFactura: 'F1' as const,
    DescripcionOperacion: 'Servicios', Desglose: [], CuotaTotal: '12.35', ImporteTotal: '123.45',
    SistemaInformatico: SIF, FechaHoraHusoGenRegistro: '2024-01-01T19:20:30+01:00', TipoHuella: '01' as const,
  }
  const Huella = computeHuellaAlta({
    IDEmisorFactura: IDFactura.IDEmisorFactura, NumSerieFactura: num,
    FechaExpedicionFactura: IDFactura.FechaExpedicionFactura, TipoFactura: 'F1',
    CuotaTotal: '12.35', ImporteTotal: '123.45', huellaAnterior,
    FechaHoraHusoGenRegistro: '2024-01-01T19:20:30+01:00',
  })
  const Encadenamiento = prev
    ? { RegistroAnterior: { ...prev.IDFactura, Huella: prev.Huella! } }
    : { PrimerRegistro: 'S' as const }
  return { ...base, Encadenamiento, Huella }
}

test('serie válida encadenada: sin errores', () => {
  const r0 = alta('12345678/G33', '')
  const r1 = alta('12345679/G33', r0.Huella!, r0)
  const informe = lint([r0, r1])
  expect(informe.ok).toBe(true)
  expect(informe.errores).toBe(0)
})

test('factura manipulada (importe cambiado tras calcular huella) → cadena-rota', () => {
  const r0 = alta('12345678/G33', '')
  const manipulada = { ...r0, ImporteTotal: '999.99' }
  const informe = lint([manipulada])
  expect(informe.ok).toBe(false)
  expect(informe.incidencias.some((x) => x.code === 'cadena-rota')).toBe(true)
})

test('campo obligatorio ausente → error', () => {
  const r0 = alta('12345678/G33', '')
  const sinFecha = { ...r0, IDFactura: { ...r0.IDFactura, FechaExpedicionFactura: '' } }
  const informe = lint([sinFecha])
  expect(informe.ok).toBe(false)
  expect(informe.incidencias.some((x) => x.code === 'falta-fecha')).toBe(true)
})

test('segundo registro que no referencia la huella previa → encadenamiento-huella', () => {
  const r0 = alta('12345678/G33', '')
  const r1 = alta('12345679/G33', r0.Huella!, r0)
  const r1Malo = { ...r1, Encadenamiento: { RegistroAnterior: { ...r0.IDFactura, Huella: 'A'.repeat(64) } } }
  const informe = lint([r0, r1Malo])
  expect(informe.incidencias.some((x) => x.code === 'encadenamiento-huella')).toBe(true)
})

test('huella adulterada en un registro no contamina el diagnóstico de los siguientes (fix #1)', () => {
  const r0 = alta('12345678/G33', '')
  const r1 = alta('12345679/G33', r0.Huella!, r0) // r1 legítimo, encadenado al r0 legítimo
  const r0Adulterado = { ...r0, Huella: 'B'.repeat(64) } // formato válido, valor falso
  const informe = lint([r0Adulterado, r1])
  expect(informe.incidencias.filter((x) => x.index === 0 && x.code === 'cadena-rota')).toHaveLength(1)
  // r1 sigue verificándose contra la huella LEGÍTIMA del r0 → sin incidencias
  expect(informe.incidencias.filter((x) => x.index === 1)).toHaveLength(0)
})

test('fecha estructural pero imposible (32-13-2024) → fecha-formato (fix #3)', () => {
  const r0 = alta('12345678/G33', '')
  const malo = { ...r0, IDFactura: { ...r0.IDFactura, FechaExpedicionFactura: '32-13-2024' } }
  const informe = lint([malo])
  expect(informe.incidencias.some((x) => x.code === 'fecha-formato')).toBe(true)
})

test('RegistroAnterior con huella correcta pero identidad equivocada → encadenamiento-identidad (rev2 #2)', () => {
  const r0 = alta('12345678/G33', '')
  const r1 = alta('12345679/G33', r0.Huella!, r0)
  const r1Malo = {
    ...r1,
    Encadenamiento: { RegistroAnterior: { IDEmisorFactura: '89890001K', NumSerieFactura: 'OTRA/SERIE', FechaExpedicionFactura: '01-01-2024', Huella: r0.Huella! } },
  }
  const informe = lint([r0, r1Malo])
  expect(informe.incidencias.some((x) => x.code === 'encadenamiento-identidad')).toBe(true)
})

test('JSON sin Encadenamiento no rompe el linter (rev2 #3)', () => {
  const r0 = alta('12345678/G33', '')
  const sinEnc = { ...r0 } as Record<string, unknown>
  delete sinEnc.Encadenamiento
  expect(() => lint([sinEnc as unknown as RegistroAlta])).not.toThrow()
  const informe = lint([sinEnc as unknown as RegistroAlta])
  expect(informe.incidencias.some((x) => x.code === 'falta-encadenamiento')).toBe(true)
})

test('registro intermedio sin campos no ancla la cadena en su huella almacenada (rev2 #1)', () => {
  const r0Sin = {
    ...alta('12345678/G33', ''),
    IDFactura: { IDEmisorFactura: '89890001K', NumSerieFactura: '', FechaExpedicionFactura: '01-01-2024' },
    Huella: 'D'.repeat(64),
  }
  const r1 = alta('12345679/G33', '')
  const r1Ok = {
    ...r1,
    Encadenamiento: { RegistroAnterior: { IDEmisorFactura: '89890001K', NumSerieFactura: '', FechaExpedicionFactura: '01-01-2024', Huella: '' } },
  }
  const informe = lint([r0Sin, r1Ok])
  // r1 NO debe verse arrastrado por la huella 'D...' almacenada en r0
  expect(
    informe.incidencias.filter((x) => x.index === 1 && (x.code === 'cadena-rota' || x.code === 'encadenamiento-huella')),
  ).toHaveLength(0)
})
