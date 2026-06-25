import { expect, test } from 'vitest'
import { unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FicheroStore, MemoriaStore, SerieManager } from '../src/serie.js'
import { lint } from '../src/lint.js'
import type { SistemaInformatico } from '../src/types.js'
import type { NuevaAlta } from '../src/factura.js'

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

function base(num: string): Omit<NuevaAlta, 'Encadenamiento'> {
  return {
    IDEmisorFactura: 'B00000000',
    NumSerieFactura: num,
    NombreRazonEmisor: 'Test SA',
    DescripcionOperacion: 'Servicio',
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
}

test('MemoriaStore: el 2º registro encadena con la Huella del 1º', async () => {
  const mgr = new SerieManager({ serie: 'TEST', store: new MemoriaStore() })
  const r0 = await mgr.anadirAlta(base('F-001'))
  const r1 = await mgr.anadirAlta(base('F-002'))

  expect('RegistroAnterior' in r1.Encadenamiento).toBe(true)
  if ('RegistroAnterior' in r1.Encadenamiento) {
    expect(r1.Encadenamiento.RegistroAnterior.Huella).toBe(r0.Huella)
  }
})

test('MemoriaStore: lint([r0, r1]) da 0 errores', async () => {
  const mgr = new SerieManager({ serie: 'TEST2', store: new MemoriaStore() })
  const r0 = await mgr.anadirAlta(base('F-003'))
  const r1 = await mgr.anadirAlta(base('F-004'))
  const informe = lint([r0, r1])
  expect(informe.errores).toBe(0)
})

test('FicheroStore: persiste el eslabón entre dos instancias de SerieManager', async () => {
  const tmpFile = join(tmpdir(), `verifactu-serie-${Date.now()}.json`)
  try {
    const m1 = new SerieManager({ serie: 'FS', store: new FicheroStore(tmpFile) })
    const r0 = await m1.anadirAlta(base('F-010'))

    // segunda instancia apuntando al mismo fichero
    const m2 = new SerieManager({ serie: 'FS', store: new FicheroStore(tmpFile) })
    const r1 = await m2.anadirAlta(base('F-011'))

    expect('RegistroAnterior' in r1.Encadenamiento).toBe(true)
    if ('RegistroAnterior' in r1.Encadenamiento) {
      expect(r1.Encadenamiento.RegistroAnterior.Huella).toBe(r0.Huella)
    }
  } finally {
    try { unlinkSync(tmpFile) } catch { /* noop */ }
  }
})
