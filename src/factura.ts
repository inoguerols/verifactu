import { computeHuellaAlta } from './huella.js'
import type {
  DesgloseItem,
  Encadenamiento,
  IDFactura,
  ImporteRectificacion,
  Persona,
  RegistroAlta,
  SistemaInformatico,
  TipoFactura,
} from './types.js'

// Helper de alto nivel: construye un RegistroAlta relleno y sellado.
// El llamante solo aporta los campos de negocio; los técnicos (IDVersion,
// TipoHuella, fechas, Encadenamiento, Huella) los fija crearAlta.

/** Campos de negocio de un alta. Los técnicos los rellena crearAlta. */
export interface NuevaAlta {
  // --- obligatorios ---
  IDEmisorFactura: string
  NumSerieFactura: string
  NombreRazonEmisor: string
  DescripcionOperacion: string
  Desglose: DesgloseItem[]
  CuotaTotal: string
  ImporteTotal: string
  SistemaInformatico: SistemaInformatico
  // --- opcionales con defecto ---
  /** Por defecto: hoy en dd-mm-yyyy. */
  FechaExpedicionFactura?: string
  /** Por defecto: 'F1'. */
  TipoFactura?: TipoFactura
  Destinatarios?: Persona[]
  /** ISO 8601 con huso. Por defecto: new Date().toISOString(). */
  FechaHoraHusoGenRegistro?: string
  /** Por defecto: { PrimerRegistro: 'S' }. */
  Encadenamiento?: Encadenamiento
  // --- rectificativa ---
  TipoRectificativa?: 'S' | 'I'
  FacturasRectificadas?: IDFactura[]
  FacturasSustituidas?: IDFactura[]
  ImporteRectificacion?: ImporteRectificacion
  // --- misc opcionales ---
  RefExterna?: string
  FechaOperacion?: string
  FacturaSimplificadaArt7273?: 'S' | 'N'
  FacturaSinIdentifDestinatarioArt61d?: 'S' | 'N'
}

/** Devuelve la fecha de hoy en formato dd-mm-yyyy. */
export function hoyDdMmYyyy(): string {
  const d = new Date()
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}-${mm}-${d.getFullYear()}`
}

/**
 * Construye un RegistroAlta completo a partir de los campos de negocio.
 * Rellena IDVersion, TipoHuella, FechaExpedicionFactura, FechaHoraHusoGenRegistro,
 * IDFactura, Encadenamiento y calcula la Huella SHA-256.
 */
export function crearAlta(n: NuevaAlta): RegistroAlta {
  const fechaExp = n.FechaExpedicionFactura ?? hoyDdMmYyyy()
  const fechaHora = n.FechaHoraHusoGenRegistro ?? new Date().toISOString()
  const tipo = n.TipoFactura ?? 'F1'
  const encadenamiento: Encadenamiento = n.Encadenamiento ?? { PrimerRegistro: 'S' }
  const huellaAnterior =
    'PrimerRegistro' in encadenamiento ? '' : encadenamiento.RegistroAnterior.Huella

  const idFactura: IDFactura = {
    IDEmisorFactura: n.IDEmisorFactura,
    NumSerieFactura: n.NumSerieFactura,
    FechaExpedicionFactura: fechaExp,
  }

  const huella = computeHuellaAlta({
    IDEmisorFactura: n.IDEmisorFactura,
    NumSerieFactura: n.NumSerieFactura,
    FechaExpedicionFactura: fechaExp,
    TipoFactura: tipo,
    CuotaTotal: n.CuotaTotal,
    ImporteTotal: n.ImporteTotal,
    huellaAnterior,
    FechaHoraHusoGenRegistro: fechaHora,
  })

  const registro: RegistroAlta = {
    IDVersion: '1.0',
    IDFactura: idFactura,
    NombreRazonEmisor: n.NombreRazonEmisor,
    TipoFactura: tipo,
    DescripcionOperacion: n.DescripcionOperacion,
    Desglose: n.Desglose,
    CuotaTotal: n.CuotaTotal,
    ImporteTotal: n.ImporteTotal,
    Encadenamiento: encadenamiento,
    SistemaInformatico: n.SistemaInformatico,
    FechaHoraHusoGenRegistro: fechaHora,
    TipoHuella: '01',
    Huella: huella,
  }

  // Opcional: solo asignar si está definido (exactOptionalPropertyTypes)
  if (n.RefExterna !== undefined) registro.RefExterna = n.RefExterna
  if (n.TipoRectificativa !== undefined) registro.TipoRectificativa = n.TipoRectificativa
  if (n.FacturasRectificadas !== undefined) registro.FacturasRectificadas = n.FacturasRectificadas
  if (n.FacturasSustituidas !== undefined) registro.FacturasSustituidas = n.FacturasSustituidas
  if (n.ImporteRectificacion !== undefined) registro.ImporteRectificacion = n.ImporteRectificacion
  if (n.FechaOperacion !== undefined) registro.FechaOperacion = n.FechaOperacion
  if (n.FacturaSimplificadaArt7273 !== undefined)
    registro.FacturaSimplificadaArt7273 = n.FacturaSimplificadaArt7273
  if (n.FacturaSinIdentifDestinatarioArt61d !== undefined)
    registro.FacturaSinIdentifDestinatarioArt61d = n.FacturaSinIdentifDestinatarioArt61d
  if (n.Destinatarios !== undefined) registro.Destinatarios = n.Destinatarios

  return registro
}
