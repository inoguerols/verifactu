import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { XMLParser } from 'fast-xml-parser'
import { expect, test } from 'vitest'
import { computeHuellaAlta } from '../src/huella.js'
import type { Cabecera, RegistroAlta } from '../src/types.js'
import { xmlRegistroAlta, xmlRegistroAnulacion } from '../src/xml.js'

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
