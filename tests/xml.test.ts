import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { XMLParser } from 'fast-xml-parser'
import { expect, test } from 'vitest'
import { computeHuellaAlta } from '../src/huella.js'
import type { Cabecera, RegistroAlta } from '../src/types.js'
import { xmlLote, xmlRegistroAlta, xmlRegistroAnulacion } from '../src/xml.js'

const CABECERA: Cabecera = { NombreRazon: 'Clínica Demo SL', NIF: '89890001K' }

const SISTEMA = {
  NombreRazon: 'Software Demo SL',
  NIF: 'B00000000',
  NombreSistemaInformatico: 'verifactu',
  IdSistemaInformatico: '01',
  Version: '0.1.0',
  NumeroInstalacion: '0001',
  TipoUsoPosibleSoloVerifactu: 'S',
  TipoUsoPosibleMultiOT: 'N',
  IndicadorMultiplesOT: 'N',
} as const

const ALTA: RegistroAlta = {
  IDVersion: '1.0',
  IDFactura: {
    IDEmisorFactura: '89890001K',
    NumSerieFactura: '12345678/G33',
    FechaExpedicionFactura: '01-01-2024',
  },
  NombreRazonEmisor: 'Clínica Demo SL',
  TipoFactura: 'F1',
  DescripcionOperacion: 'Servicio dental & revisión',
  Desglose: [
    {
      ClaveRegimen: '01',
      CalificacionOperacion: 'S1',
      TipoImpositivo: '21',
      BaseImponibleOimporteNoSujeto: '100.00',
      CuotaRepercutida: '21.00',
    },
  ],
  CuotaTotal: '21.00',
  ImporteTotal: '121.00',
  Encadenamiento: { PrimerRegistro: 'S' },
  SistemaInformatico: SISTEMA,
  FechaHoraHusoGenRegistro: '2024-01-01T19:20:30+01:00',
  TipoHuella: '01',
}

ALTA.Huella = computeHuellaAlta({
  IDEmisorFactura: ALTA.IDFactura.IDEmisorFactura,
  NumSerieFactura: ALTA.IDFactura.NumSerieFactura,
  FechaExpedicionFactura: ALTA.IDFactura.FechaExpedicionFactura,
  TipoFactura: ALTA.TipoFactura,
  CuotaTotal: ALTA.CuotaTotal,
  ImporteTotal: ALTA.ImporteTotal,
  huellaAnterior: '',
  FechaHoraHusoGenRegistro: ALTA.FechaHoraHusoGenRegistro,
})

test('XML de alta: estructura y orden (roundtrip parse)', () => {
  const xml = xmlRegistroAlta(ALTA, CABECERA)
  const p = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true })
  const doc = p.parse(xml)
  const reg = doc.RegFactuSistemaFacturacion.RegistroFactura.RegistroAlta
  expect(doc.RegFactuSistemaFacturacion.Cabecera.ObligadoEmision.NIF).toBe('89890001K')
  expect(reg.IDFactura.NumSerieFactura).toBe('12345678/G33')
  expect(reg.TipoFactura).toBe('F1')
  expect(reg.Desglose.DetalleDesglose.BaseImponibleOimporteNoSujeto).toBe(100)
  expect(reg.Encadenamiento.PrimerRegistro).toBe('S')
  expect(reg.SistemaInformatico.IndicadorMultiplesOT).toBe('N')
  expect(String(reg.Huella)).toMatch(/^[0-9A-F]{64}$/)
})

test('XML de alta: escape de & en texto', () => {
  expect(xmlRegistroAlta(ALTA, CABECERA)).toContain('Servicio dental &amp; revisión')
})

test('XML de anulación: estructura mínima', () => {
  const xml = xmlRegistroAnulacion(
    {
      IDVersion: '1.0',
      IDFactura: ALTA.IDFactura,
      Encadenamiento: { PrimerRegistro: 'S' },
      SistemaInformatico: SISTEMA,
      FechaHoraHusoGenRegistro: '2024-01-01T19:20:35+01:00',
      TipoHuella: '01',
      Huella: 'A'.repeat(64),
    },
    CABECERA,
  )
  const doc = new XMLParser({ removeNSPrefix: true }).parse(xml)
  expect(doc.RegFactuSistemaFacturacion.RegistroFactura.RegistroAnulacion.IDVersion).toBe(1)
})

// Validación dura contra el XSD oficial. Best-effort: el import de xmldsig se
// resuelve por red; si no hay xmllint o red, se omite (el test no falla).
test('XML de alta valida contra el XSD oficial (xmllint, best-effort)', () => {
  let xmllintOk = true
  try {
    execFileSync('xmllint', ['--version'], { stdio: 'ignore' })
  } catch {
    xmllintOk = false
  }
  if (!xmllintOk) return
  const dir = mkdtempSync(join(tmpdir(), 'vf-'))
  const f = join(dir, 'alta.xml')
  writeFileSync(f, xmlRegistroAlta(ALTA, CABECERA))
  try {
    execFileSync('xmllint', ['--noout', '--schema', 'spec/xsd/SuministroLR.xsd', f], {
      stdio: 'pipe',
    })
  } catch (e) {
    const msg = String((e as { stderr?: Buffer }).stderr ?? e)
    // Fallo de red al traer el esquema xmldsig externo → omitir, no es nuestro XML.
    if (/failed to load|Connection|resolve|fetch|network|xmldsig/i.test(msg)) return
    throw new Error(msg)
  }
})

const ANULACION = {
  IDVersion: '1.0',
  IDFactura: ALTA.IDFactura,
  Encadenamiento: { PrimerRegistro: 'S' } as const,
  SistemaInformatico: SISTEMA,
  FechaHoraHusoGenRegistro: '2024-01-01T19:20:35+01:00',
  TipoHuella: '01' as const,
  Huella: 'A'.repeat(64),
}

test('xmlLote: alta + anulación → 2 RegistroFactura', () => {
  const xml = xmlLote(CABECERA, [{ alta: ALTA }, { anulacion: ANULACION }])
  const doc = new XMLParser({ removeNSPrefix: true }).parse(xml)
  const regs = doc.RegFactuSistemaFacturacion.RegistroFactura
  expect(Array.isArray(regs)).toBe(true)
  expect(regs).toHaveLength(2)
  expect(regs[0].RegistroAlta).toBeDefined()
  expect(regs[1].RegistroAnulacion).toBeDefined()
})

test('xmlLote: 0 y 1001 registros lanzan error', () => {
  expect(() => xmlLote(CABECERA, [])).toThrow()
  const muchos = Array.from({ length: 1001 }, () => ({ alta: ALTA }))
  expect(() => xmlLote(CABECERA, muchos)).toThrow()
})

test('XML de alta: rectificativa + Destinatarios en orden y valida (xmllint best-effort)', () => {
  const rect: RegistroAlta = {
    ...ALTA,
    TipoFactura: 'R1',
    TipoRectificativa: 'I',
    FacturasRectificadas: [
      { IDEmisorFactura: '89890001K', NumSerieFactura: 'A-1', FechaExpedicionFactura: '01-12-2023' },
    ],
    ImporteRectificacion: { BaseRectificada: '100.00', CuotaRectificada: '21.00' },
    Destinatarios: [
      { NombreRazon: 'Cliente SL', NIF: '12345678Z' },
      { NombreRazon: 'Foreign Inc', IDOtro: { CodigoPais: 'FR', IDType: '04', ID: 'X123' } },
    ],
  }
  const xml = xmlRegistroAlta(rect, CABECERA)
  // Orden: TipoFactura antes de TipoRectificativa antes de FacturasRectificadas antes de
  // ImporteRectificacion antes de DescripcionOperacion antes de Destinatarios antes de Desglose.
  expect(xml.indexOf('TipoRectificativa')).toBeGreaterThan(xml.indexOf('<sf:TipoFactura>'))
  expect(xml.indexOf('FacturasRectificadas')).toBeGreaterThan(xml.indexOf('TipoRectificativa'))
  expect(xml.indexOf('ImporteRectificacion')).toBeGreaterThan(xml.indexOf('FacturasRectificadas'))
  expect(xml.indexOf('<sf:DescripcionOperacion>')).toBeGreaterThan(xml.indexOf('ImporteRectificacion'))
  expect(xml.indexOf('<sf:Destinatarios>')).toBeGreaterThan(xml.indexOf('<sf:DescripcionOperacion>'))
  expect(xml.indexOf('<sf:Desglose>')).toBeGreaterThan(xml.indexOf('<sf:Destinatarios>'))
  const doc = new XMLParser({ removeNSPrefix: true }).parse(xml)
  const reg = doc.RegFactuSistemaFacturacion.RegistroFactura.RegistroAlta
  expect(reg.Destinatarios.IDDestinatario[1].IDOtro.CodigoPais).toBe('FR')
  expect(reg.FacturasRectificadas.IDFacturaRectificada.NumSerieFactura).toBe('A-1')

  let xmllintOk = true
  try {
    execFileSync('xmllint', ['--version'], { stdio: 'ignore' })
  } catch {
    xmllintOk = false
  }
  if (!xmllintOk) return
  const dir = mkdtempSync(join(tmpdir(), 'vf-'))
  const f = join(dir, 'rect.xml')
  writeFileSync(f, xml)
  try {
    execFileSync('xmllint', ['--noout', '--schema', 'spec/xsd/SuministroLR.xsd', f], { stdio: 'pipe' })
  } catch (e) {
    const msg = String((e as { stderr?: Buffer }).stderr ?? e)
    if (/failed to load|Connection|resolve|fetch|network|xmldsig/i.test(msg)) return
    throw new Error(msg)
  }
})

test('XML de anulación: IDFactura usa los nombres "Anulada" y valida contra el XSD', () => {
  const xml = xmlRegistroAnulacion(
    {
      IDVersion: '1.0',
      IDFactura: { IDEmisorFactura: '89890001K', NumSerieFactura: 'A/050', FechaExpedicionFactura: '01-06-2026' },
      Encadenamiento: { PrimerRegistro: 'S' },
      SistemaInformatico: SISTEMA,
      FechaHoraHusoGenRegistro: '2026-06-10T13:00:00+02:00',
      TipoHuella: '01',
      Huella: 'A'.repeat(64),
    },
    CABECERA,
  )
  // El registro de anulación NO usa IDEmisorFactura sino IDEmisorFacturaAnulada.
  expect(xml).toContain('<sf:IDEmisorFacturaAnulada>89890001K</sf:IDEmisorFacturaAnulada>')
  expect(xml).toContain('<sf:NumSerieFacturaAnulada>A/050</sf:NumSerieFacturaAnulada>')
  expect(xml).not.toContain('<sf:IDEmisorFactura>')

  let xmllintOk = true
  try {
    execFileSync('xmllint', ['--version'], { stdio: 'ignore' })
  } catch {
    xmllintOk = false
  }
  if (!xmllintOk) return
  const dir = mkdtempSync(join(tmpdir(), 'vf-'))
  const f = join(dir, 'anul.xml')
  writeFileSync(f, xml)
  try {
    execFileSync('xmllint', ['--noout', '--schema', 'spec/xsd/SuministroLR.xsd', f], { stdio: 'pipe' })
  } catch (e) {
    const msg = String((e as { stderr?: Buffer }).stderr ?? e)
    if (/failed to load|Connection|resolve|fetch|network|xmldsig/i.test(msg)) return
    throw new Error(msg)
  }
})
