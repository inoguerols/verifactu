import { computeHuellaAlta } from './huella.js'
import type { RegistroAlta } from './types.js'

// Verificador de cumplimiento VeriFactu: comprueba una serie de registros de alta
// (campos, formatos y, sobre todo, la integridad de la cadena de huellas).

export type Nivel = 'error' | 'warn'

export interface Incidencia {
  /** Índice del registro en la serie (-1 = global). */
  index: number
  nivel: Nivel
  code: string
  message: string
}

export interface InformeCumplimiento {
  ok: boolean
  total: number
  errores: number
  avisos: number
  incidencias: Incidencia[]
}

const TIPOS_FACTURA = new Set(['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'R1', 'R2', 'R3', 'R4', 'R5'])
// dd-mm-yyyy con día/mes en rango (no valida bisiestos; ver ponytail).
const RE_FECHA = /^(0[1-9]|[12]\d|3[01])-(0[1-9]|1[0-2])-\d{4}$/
const RE_IMPORTE = /^-?\d{1,12}([.]\d{1,2})?$/
const RE_HUELLA = /^[0-9A-F]{64}$/
// ISO 8601 con huso, milisegundos opcionales, rangos válidos.
const RE_ISO_HUSO =
  /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d+)?([+-](0\d|1[0-4]):[0-5]\d|Z)$/
// ponytail: forma básica del NIF emisor (9 alfanum). Dígito de control → fase 2.
const RE_NIF = /^[0-9A-Z]{9}$/i

/**
 * Verifica una serie de registros de alta en el orden de la cadena.
 * `registros[0]` debe ser el primer registro de la serie (Huella anterior vacía).
 */
export function lint(registros: RegistroAlta[]): InformeCumplimiento {
  const incidencias: Incidencia[] = []
  const add = (index: number, nivel: Nivel, code: string, message: string) =>
    incidencias.push({ index, nivel, code, message })

  if (registros.length === 0) {
    add(-1, 'warn', 'serie-vacia', 'No hay registros que verificar')
  }

  let huellaAnterior = ''
  registros.forEach((r, i) => {
    const f = r.IDFactura
    // -- presencia + formato --
    if (!f?.IDEmisorFactura) add(i, 'error', 'falta-nif-emisor', 'Falta IDEmisorFactura')
    else if (!RE_NIF.test(f.IDEmisorFactura))
      add(i, 'error', 'nif-formato', `IDEmisorFactura no parece un NIF válido (9 alfanum): "${f.IDEmisorFactura}"`)
    if (!f?.NumSerieFactura) add(i, 'error', 'falta-numserie', 'Falta NumSerieFactura')
    if (!f?.FechaExpedicionFactura) add(i, 'error', 'falta-fecha', 'Falta FechaExpedicionFactura')
    else if (!RE_FECHA.test(f.FechaExpedicionFactura))
      add(i, 'error', 'fecha-formato', `FechaExpedicionFactura debe ser dd-mm-yyyy válida: "${f.FechaExpedicionFactura}"`)
    if (!TIPOS_FACTURA.has(r.TipoFactura)) add(i, 'error', 'tipo-factura', `TipoFactura inválido: "${r.TipoFactura}"`)
    if (!RE_IMPORTE.test(r.ImporteTotal)) add(i, 'error', 'importe-formato', `ImporteTotal inválido: "${r.ImporteTotal}"`)
    if (!RE_IMPORTE.test(r.CuotaTotal)) add(i, 'error', 'cuota-formato', `CuotaTotal inválido: "${r.CuotaTotal}"`)
    if (!RE_ISO_HUSO.test(r.FechaHoraHusoGenRegistro))
      add(i, 'error', 'fechahora-formato', `FechaHoraHusoGenRegistro debe ser ISO 8601 con huso: "${r.FechaHoraHusoGenRegistro}"`)
    if (!r.SistemaInformatico?.NombreSistemaInformatico)
      add(i, 'error', 'falta-sif', 'Falta SistemaInformatico (declaración del SIF)')
    if (r.TipoHuella !== '01') add(i, 'warn', 'tipo-huella', `TipoHuella esperado '01' (SHA-256): "${r.TipoHuella}"`)

    // -- encadenamiento declarado (contra la huella LEGÍTIMA del registro previo) --
    const enc = r.Encadenamiento
    if (i === 0) {
      if (!('PrimerRegistro' in enc) || enc.PrimerRegistro !== 'S')
        add(i, 'error', 'encadenamiento-primero', 'El primer registro debe declarar Encadenamiento.PrimerRegistro = "S"')
    } else if (!('RegistroAnterior' in enc)) {
      add(i, 'error', 'encadenamiento-anterior', 'Falta Encadenamiento.RegistroAnterior')
    } else if (enc.RegistroAnterior.Huella !== huellaAnterior) {
      add(i, 'error', 'encadenamiento-huella', 'La Huella referida en Encadenamiento.RegistroAnterior no coincide con la del registro previo')
    }

    // -- huella propia: recálculo e integridad --
    let huellaLegitima: string | undefined
    const puedeRecalcular = !!(f?.IDEmisorFactura && f?.NumSerieFactura && f?.FechaExpedicionFactura)
    if (puedeRecalcular) {
      huellaLegitima = computeHuellaAlta({
        IDEmisorFactura: f.IDEmisorFactura,
        NumSerieFactura: f.NumSerieFactura,
        FechaExpedicionFactura: f.FechaExpedicionFactura,
        TipoFactura: r.TipoFactura,
        CuotaTotal: r.CuotaTotal,
        ImporteTotal: r.ImporteTotal,
        huellaAnterior,
        FechaHoraHusoGenRegistro: r.FechaHoraHusoGenRegistro,
      })
    }
    if (!r.Huella) {
      add(i, 'error', 'falta-huella', 'Falta Huella')
    } else if (!RE_HUELLA.test(r.Huella)) {
      add(i, 'error', 'huella-formato', `Huella debe ser SHA-256 hex en mayúsculas (64): "${r.Huella}"`)
    } else if (huellaLegitima && huellaLegitima !== r.Huella) {
      add(i, 'error', 'cadena-rota', 'La Huella no coincide con el recálculo (registro alterado o cadena rota)')
    }

    // Avanzar SIEMPRE con la huella legítima recalculada (no la almacenada, que puede
    // estar adulterada): así los registros siguientes se verifican contra la cadena real.
    huellaAnterior = huellaLegitima ?? r.Huella ?? huellaAnterior
  })

  const errores = incidencias.filter((x) => x.nivel === 'error').length
  const avisos = incidencias.filter((x) => x.nivel === 'warn').length
  return { ok: errores === 0, total: registros.length, errores, avisos, incidencias }
}
