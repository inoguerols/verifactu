import { computeHuellaAlta, computeHuellaAnulacion } from './huella.js'
import { validarNif } from './nif.js'
import type { DesgloseItem, Persona, RegistroAlta, RegistroAnulacion } from './types.js'

// Verificador de cumplimiento VeriFactu: comprueba campos, formatos, desglose,
// destinatarios, rectificativas, coherencia de importes y, sobre todo, la
// integridad de la cadena de huellas. Distingue 'error' (la AEAT rechaza) de
// 'warn' (la AEAT acepta con errores / matiz no bloqueante).

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

const TIPOS_FACTURA = new Set(['F1', 'F2', 'F3', 'R1', 'R2', 'R3', 'R4', 'R5'])
const TIPOS_RECTIFICATIVA = new Set(['R1', 'R2', 'R3', 'R4', 'R5'])
const CALIFICACIONES = new Set(['S1', 'S2', 'N1', 'N2'])
const EXENCIONES = new Set(['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8'])
// dd-mm-yyyy con día/mes en rango (no valida bisiestos; ver ponytail).
const RE_FECHA = /^(0[1-9]|[12]\d|3[01])-(0[1-9]|1[0-2])-\d{4}$/
const RE_IMPORTE = /^-?\d{1,12}([.]\d{1,2})?$/
const RE_HUELLA = /^[0-9A-F]{64}$/
// ISO 8601 con huso, milisegundos opcionales, rangos válidos.
const RE_ISO_HUSO =
  /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d+)?([+-](0\d|1[0-4]):[0-5]\d|Z)$/

const num = (s?: string): number => (s == null || s === '' ? Number.NaN : Number(s))
const cerca = (a: number, b: number, tol: number): boolean => Math.abs(a - b) <= tol + 1e-9

type Add = (index: number, nivel: Nivel, code: string, message: string) => void

function nuevoInforme(incidencias: Incidencia[], total: number): InformeCumplimiento {
  const errores = incidencias.filter((x) => x.nivel === 'error').length
  const avisos = incidencias.filter((x) => x.nivel === 'warn').length
  return { ok: errores === 0, total, errores, avisos, incidencias }
}

function checkPersona(p: Persona, i: number, add: Add, etiqueta: string): void {
  if (!p?.NombreRazon) add(i, 'error', 'persona-nombre', `${etiqueta} sin NombreRazon`)
  const tieneNif = !!p?.NIF
  const tieneOtro = !!p?.IDOtro
  if (tieneNif === tieneOtro)
    add(i, 'error', 'persona-id', `${etiqueta} requiere exactamente uno de NIF o IDOtro`)
  else if (tieneNif && !validarNif(p.NIF as string))
    add(i, 'error', 'persona-nif', `${etiqueta} con NIF de dígito de control inválido: "${p.NIF}"`)
}

function checkDestinatarios(r: RegistroAlta, i: number, add: Add): void {
  // F2 simplificada y las marcadas sin identificación de destinatario no lo exigen.
  const exime =
    r.TipoFactura === 'F2' ||
    r.FacturaSinIdentifDestinatarioArt61d === 'S' ||
    r.FacturaSimplificadaArt7273 === 'S'
  const ds = r.Destinatarios
  if (!ds || ds.length === 0) {
    if (!exime)
      add(i, 'error', 'falta-destinatario', `TipoFactura ${r.TipoFactura} requiere Destinatarios`)
    return
  }
  ds.forEach((p) => checkPersona(p, i, add, 'Destinatario'))
}

function checkRectificativa(r: RegistroAlta, i: number, add: Add): void {
  if (!TIPOS_RECTIFICATIVA.has(r.TipoFactura)) return
  if (r.TipoRectificativa !== 'S' && r.TipoRectificativa !== 'I')
    add(i, 'error', 'rect-tipo', `Rectificativa ${r.TipoFactura} requiere TipoRectificativa 'S' o 'I'`)
  if (!r.FacturasRectificadas || r.FacturasRectificadas.length === 0)
    add(i, 'error', 'rect-facturas', 'Rectificativa requiere FacturasRectificadas (≥1)')
  if (r.TipoRectificativa === 'S' && !r.ImporteRectificacion)
    add(i, 'error', 'rect-importe', 'Rectificativa por sustitución requiere ImporteRectificacion')
}

/** Valida el desglose y devuelve las sumas para la coherencia de importes. */
function checkDesglose(
  d: DesgloseItem[],
  i: number,
  add: Add,
): { sumaCuota: number; sumaBaseCuota: number } {
  let sumaCuota = 0
  let sumaBaseCuota = 0
  if (!Array.isArray(d) || d.length === 0) {
    add(i, 'error', 'desglose-vacio', 'Desglose vacío: se requiere al menos un detalle')
    return { sumaCuota: Number.NaN, sumaBaseCuota: Number.NaN }
  }
  if (d.length > 12) add(i, 'error', 'desglose-max', 'Desglose admite como máximo 12 detalles')
  for (const det of d) {
    const tieneCal = det.CalificacionOperacion != null
    const tieneEx = det.OperacionExenta != null
    if (tieneCal === tieneEx)
      add(i, 'error', 'desglose-calif', 'Cada detalle requiere exactamente uno de CalificacionOperacion u OperacionExenta')
    if (tieneCal && !CALIFICACIONES.has(det.CalificacionOperacion as string))
      add(i, 'error', 'calif-codigo', `CalificacionOperacion inválida: "${det.CalificacionOperacion}"`)
    if (tieneEx && !EXENCIONES.has(det.OperacionExenta as string))
      add(i, 'error', 'exenta-codigo', `OperacionExenta inválida (E1..E8): "${det.OperacionExenta}"`)

    const base = num(det.BaseImponibleOimporteNoSujeto)
    const cuota = num(det.CuotaRepercutida)
    const recargo = num(det.CuotaRecargoEquivalencia)
    if (det.CalificacionOperacion === 'S1') {
      if (det.TipoImpositivo == null || det.CuotaRepercutida == null) {
        add(i, 'error', 's1-falta', 'Operación S1 requiere TipoImpositivo y CuotaRepercutida')
      } else {
        const tipo = num(det.TipoImpositivo)
        if (
          Number.isFinite(base) &&
          Number.isFinite(tipo) &&
          Number.isFinite(cuota) &&
          !cerca((base * tipo) / 100, cuota, 0.01)
        )
          add(i, 'warn', 'cuota-linea', `CuotaRepercutida (${det.CuotaRepercutida}) no cuadra con Base×Tipo`)
      }
    }
    if (Number.isFinite(base)) sumaBaseCuota += base
    if (Number.isFinite(cuota)) {
      sumaCuota += cuota
      sumaBaseCuota += cuota
    }
    if (Number.isFinite(recargo)) {
      sumaCuota += recargo
      sumaBaseCuota += recargo
    }
  }
  return { sumaCuota, sumaBaseCuota }
}

/** Comprobaciones de campo/formato/negocio de un registro de alta (sin cadena). */
function checkCamposAlta(r: RegistroAlta, i: number, add: Add): void {
  const f = r.IDFactura
  if (!f?.IDEmisorFactura) add(i, 'error', 'falta-nif-emisor', 'Falta IDEmisorFactura')
  else if (!validarNif(f.IDEmisorFactura))
    add(i, 'error', 'nif-emisor', `IDEmisorFactura no es un NIF válido (dígito de control): "${f.IDEmisorFactura}"`)
  if (!f?.NumSerieFactura) add(i, 'error', 'falta-numserie', 'Falta NumSerieFactura')
  if (!f?.FechaExpedicionFactura) add(i, 'error', 'falta-fecha', 'Falta FechaExpedicionFactura')
  else if (!RE_FECHA.test(f.FechaExpedicionFactura))
    add(i, 'error', 'fecha-formato', `FechaExpedicionFactura debe ser dd-mm-yyyy válida: "${f.FechaExpedicionFactura}"`)
  if (!TIPOS_FACTURA.has(r.TipoFactura)) add(i, 'error', 'tipo-factura', `TipoFactura inválido: "${r.TipoFactura}"`)
  if (!RE_IMPORTE.test(r.ImporteTotal)) add(i, 'error', 'importe-formato', `ImporteTotal inválido: "${r.ImporteTotal}"`)
  if (!RE_IMPORTE.test(r.CuotaTotal)) add(i, 'error', 'cuota-formato', `CuotaTotal inválido: "${r.CuotaTotal}"`)
  if (!r.DescripcionOperacion) add(i, 'error', 'falta-descripcion', 'Falta DescripcionOperacion')
  if (!RE_ISO_HUSO.test(r.FechaHoraHusoGenRegistro))
    add(i, 'error', 'fechahora-formato', `FechaHoraHusoGenRegistro debe ser ISO 8601 con huso: "${r.FechaHoraHusoGenRegistro}"`)
  if (!r.SistemaInformatico?.NombreSistemaInformatico)
    add(i, 'error', 'falta-sif', 'Falta SistemaInformatico (declaración del SIF)')
  if (r.TipoHuella !== '01') add(i, 'warn', 'tipo-huella', `TipoHuella esperado '01' (SHA-256): "${r.TipoHuella}"`)

  checkRectificativa(r, i, add)
  checkDestinatarios(r, i, add)
  const { sumaCuota, sumaBaseCuota } = checkDesglose(r.Desglose, i, add)
  // ponytail: tolerancia 1 cént. por línea (redondeo); coherencia es 'warn' porque la
  // AEAT la clasifica como "aceptada con errores", no como rechazo.
  const tol = 0.01 * Math.max(1, r.Desglose?.length ?? 1)
  const cuotaTotal = num(r.CuotaTotal)
  const importeTotal = num(r.ImporteTotal)
  if (Number.isFinite(sumaCuota) && Number.isFinite(cuotaTotal) && !cerca(sumaCuota, cuotaTotal, tol))
    add(i, 'warn', 'cuota-total', `CuotaTotal (${r.CuotaTotal}) no cuadra con la suma de cuotas del desglose (${sumaCuota.toFixed(2)})`)
  if (Number.isFinite(sumaBaseCuota) && Number.isFinite(importeTotal) && !cerca(sumaBaseCuota, importeTotal, tol))
    add(i, 'warn', 'importe-total', `ImporteTotal (${r.ImporteTotal}) no cuadra con base+cuota del desglose (${sumaBaseCuota.toFixed(2)})`)
}

/**
 * Verifica una serie de registros de alta en el orden de la cadena.
 * `registros[0]` debe ser el primer registro de la serie (Huella anterior vacía).
 */
export function lint(registros: RegistroAlta[]): InformeCumplimiento {
  const incidencias: Incidencia[] = []
  const add: Add = (index, nivel, code, message) => incidencias.push({ index, nivel, code, message })

  if (registros.length === 0) add(-1, 'warn', 'serie-vacia', 'No hay registros que verificar')

  let huellaAnterior = ''
  registros.forEach((r, i) => {
    checkCamposAlta(r, i, add)

    // -- encadenamiento declarado (contra la huella LEGÍTIMA del registro previo) --
    const f = r.IDFactura
    const enc = r.Encadenamiento
    if (!enc || typeof enc !== 'object') {
      add(i, 'error', 'falta-encadenamiento', 'Falta Encadenamiento')
    } else if (i === 0) {
      if (!('PrimerRegistro' in enc) || enc.PrimerRegistro !== 'S')
        add(i, 'error', 'encadenamiento-primero', 'El primer registro debe declarar Encadenamiento.PrimerRegistro = "S"')
    } else if (!('RegistroAnterior' in enc)) {
      add(i, 'error', 'encadenamiento-anterior', 'Falta Encadenamiento.RegistroAnterior')
    } else {
      const ant = enc.RegistroAnterior
      const prev = registros[i - 1]
      if (ant.Huella !== huellaAnterior)
        add(i, 'error', 'encadenamiento-huella', 'La Huella referida en Encadenamiento.RegistroAnterior no coincide con la del registro previo')
      if (
        prev &&
        (ant.IDEmisorFactura !== prev.IDFactura?.IDEmisorFactura ||
          ant.NumSerieFactura !== prev.IDFactura?.NumSerieFactura ||
          ant.FechaExpedicionFactura !== prev.IDFactura?.FechaExpedicionFactura)
      )
        add(i, 'error', 'encadenamiento-identidad', 'RegistroAnterior no identifica correctamente la factura previa')
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

    // Avanzar SOLO con la huella legítima recalculada (nunca la almacenada).
    if (huellaLegitima) huellaAnterior = huellaLegitima
  })

  return nuevoInforme(incidencias, registros.length)
}

/**
 * Verifica una serie de registros de ANULACIÓN encadenados. La huella de cada
 * anulación se recalcula a partir de la factura anulada (IDFactura) y la huella
 * anterior, con la cadena canónica de anulación.
 */
export function lintAnulaciones(registros: RegistroAnulacion[]): InformeCumplimiento {
  const incidencias: Incidencia[] = []
  const add: Add = (index, nivel, code, message) => incidencias.push({ index, nivel, code, message })

  if (registros.length === 0) add(-1, 'warn', 'serie-vacia', 'No hay registros que verificar')

  let huellaAnterior = ''
  registros.forEach((r, i) => {
    const f = r.IDFactura
    if (!f?.IDEmisorFactura) add(i, 'error', 'falta-nif-emisor', 'Falta IDEmisorFactura (anulada)')
    else if (!validarNif(f.IDEmisorFactura))
      add(i, 'error', 'nif-emisor', `IDEmisorFactura no es un NIF válido: "${f.IDEmisorFactura}"`)
    if (!f?.NumSerieFactura) add(i, 'error', 'falta-numserie', 'Falta NumSerieFactura (anulada)')
    if (!f?.FechaExpedicionFactura) add(i, 'error', 'falta-fecha', 'Falta FechaExpedicionFactura (anulada)')
    else if (!RE_FECHA.test(f.FechaExpedicionFactura))
      add(i, 'error', 'fecha-formato', `FechaExpedicionFactura debe ser dd-mm-yyyy: "${f.FechaExpedicionFactura}"`)
    if (!RE_ISO_HUSO.test(r.FechaHoraHusoGenRegistro))
      add(i, 'error', 'fechahora-formato', `FechaHoraHusoGenRegistro debe ser ISO 8601 con huso: "${r.FechaHoraHusoGenRegistro}"`)
    if (!r.SistemaInformatico?.NombreSistemaInformatico)
      add(i, 'error', 'falta-sif', 'Falta SistemaInformatico (declaración del SIF)')

    const enc = r.Encadenamiento
    if (!enc || typeof enc !== 'object') {
      add(i, 'error', 'falta-encadenamiento', 'Falta Encadenamiento')
    } else if (i === 0) {
      if (!('PrimerRegistro' in enc) || enc.PrimerRegistro !== 'S')
        add(i, 'error', 'encadenamiento-primero', 'El primer registro debe declarar PrimerRegistro = "S"')
    } else if (!('RegistroAnterior' in enc)) {
      add(i, 'error', 'encadenamiento-anterior', 'Falta Encadenamiento.RegistroAnterior')
    } else if (enc.RegistroAnterior.Huella !== huellaAnterior) {
      add(i, 'error', 'encadenamiento-huella', 'La Huella de RegistroAnterior no coincide con la del registro previo')
    }

    let huellaLegitima: string | undefined
    if (f?.IDEmisorFactura && f?.NumSerieFactura && f?.FechaExpedicionFactura) {
      huellaLegitima = computeHuellaAnulacion({
        IDEmisorFacturaAnulada: f.IDEmisorFactura,
        NumSerieFacturaAnulada: f.NumSerieFactura,
        FechaExpedicionFacturaAnulada: f.FechaExpedicionFactura,
        huellaAnterior,
        FechaHoraHusoGenRegistro: r.FechaHoraHusoGenRegistro,
      })
    }
    if (!r.Huella) add(i, 'error', 'falta-huella', 'Falta Huella')
    else if (!RE_HUELLA.test(r.Huella)) add(i, 'error', 'huella-formato', `Huella debe ser SHA-256 hex (64): "${r.Huella}"`)
    else if (huellaLegitima && huellaLegitima !== r.Huella)
      add(i, 'error', 'cadena-rota', 'La Huella no coincide con el recálculo (registro alterado o cadena rota)')

    if (huellaLegitima) huellaAnterior = huellaLegitima
  })

  return nuevoInforme(incidencias, registros.length)
}
