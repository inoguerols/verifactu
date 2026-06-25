import { expect, test } from 'vitest'
import { computeHuellaAlta, computeHuellaAnulacion } from '../src/huella.js'
import { lint, lintAnulaciones } from '../src/lint.js'
import type { RegistroAlta, RegistroAnulacion } from '../src/types.js'

const SIF = {
  NombreRazon: 'ACME SL', NIF: 'B12345678',
  NombreSistemaInformatico: 'ACME Facturador', IdSistemaInformatico: '01',
  Version: '1.0', NumeroInstalacion: '001',
}

function alta(num: string, huellaAnterior: string, prev?: RegistroAlta): RegistroAlta {
  const IDFactura = { IDEmisorFactura: '89890001K', NumSerieFactura: num, FechaExpedicionFactura: '02-01-2025' }
  const base = {
    IDVersion: '1.0', IDFactura, NombreRazonEmisor: 'ACME SL', TipoFactura: 'F1' as const,
    DescripcionOperacion: 'Servicios',
    Destinatarios: [{ NombreRazon: 'Cliente SL', NIF: 'B00000000' }],
    Desglose: [{ ClaveRegimen: '01', CalificacionOperacion: 'S1', TipoImpositivo: '21', BaseImponibleOimporteNoSujeto: '100.00', CuotaRepercutida: '21.00' }],
    CuotaTotal: '21.00', ImporteTotal: '121.00',
    SistemaInformatico: SIF, FechaHoraHusoGenRegistro: '2024-01-01T19:20:30+01:00', TipoHuella: '01' as const,
  }
  const Huella = computeHuellaAlta({
    IDEmisorFactura: IDFactura.IDEmisorFactura, NumSerieFactura: num,
    FechaExpedicionFactura: IDFactura.FechaExpedicionFactura, TipoFactura: 'F1',
    CuotaTotal: '21.00', ImporteTotal: '121.00', huellaAnterior,
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

const codigos = (inf: ReturnType<typeof lint>) => inf.incidencias.map((x) => x.code)

test('F1 sin Destinatarios → falta-destinatario; F2 sin Destinatarios → exento', () => {
  const r0 = alta('A/1', '')
  const f1Sin = { ...r0, Destinatarios: undefined }
  expect(codigos(lint([f1Sin]))).toContain('falta-destinatario')
  const f2Sin = { ...r0, TipoFactura: 'F2' as const, Destinatarios: undefined }
  expect(codigos(lint([f2Sin]))).not.toContain('falta-destinatario')
})

test('detalle con Calificación Y Exención a la vez → desglose-calif', () => {
  const r0 = alta('A/1', '')
  const malo = { ...r0, Desglose: [{ CalificacionOperacion: 'S1', OperacionExenta: 'E1', TipoImpositivo: '21', BaseImponibleOimporteNoSujeto: '100.00', CuotaRepercutida: '21.00' }] }
  expect(codigos(lint([malo]))).toContain('desglose-calif')
})

test('rectificativa R1 sin FacturasRectificadas → rect-facturas', () => {
  const r0 = alta('A/1', '')
  const r1 = { ...r0, TipoFactura: 'R1' as const, TipoRectificativa: 'I' as const }
  expect(codigos(lint([r1]))).toContain('rect-facturas')
})

test('NIF emisor con dígito de control inválido → nif-emisor', () => {
  const r0 = alta('A/1', '')
  const malo = { ...r0, IDFactura: { ...r0.IDFactura, IDEmisorFactura: 'B12345678' } }
  expect(codigos(lint([malo]))).toContain('nif-emisor')
})

test('ImporteTotal incoherente con el desglose → warn importe-total (no rompe ok por sí solo)', () => {
  const r0 = alta('A/1', '')
  const malo = { ...r0, ImporteTotal: '999.99' }
  const inf = lint([malo])
  expect(inf.incidencias.some((x) => x.code === 'importe-total' && x.nivel === 'warn')).toBe(true)
})

function anul(numAnulada: string, huellaAnterior: string, prev?: RegistroAnulacion): RegistroAnulacion {
  const IDFactura = { IDEmisorFactura: '89890001K', NumSerieFactura: numAnulada, FechaExpedicionFactura: '01-01-2024' }
  const FechaHoraHusoGenRegistro = '2024-01-02T10:00:00+01:00'
  const Huella = computeHuellaAnulacion({
    IDEmisorFacturaAnulada: '89890001K', NumSerieFacturaAnulada: numAnulada,
    FechaExpedicionFacturaAnulada: '01-01-2024', huellaAnterior, FechaHoraHusoGenRegistro,
  })
  const Encadenamiento = prev
    ? { RegistroAnterior: { ...prev.IDFactura, Huella: prev.Huella! } }
    : { PrimerRegistro: 'S' as const }
  return { IDVersion: '1.0', IDFactura, Encadenamiento, SistemaInformatico: SIF, FechaHoraHusoGenRegistro, TipoHuella: '01', Huella }
}

test('lintAnulaciones: cadena válida sin errores; huella manipulada → cadena-rota', () => {
  const a0 = anul('12345678/G33', '')
  expect(lintAnulaciones([a0]).errores).toBe(0)
  const manip = { ...a0, Huella: 'A'.repeat(64) }
  expect(lintAnulaciones([manip]).incidencias.some((x) => x.code === 'cadena-rota')).toBe(true)
})
