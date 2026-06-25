import QRCode from 'qrcode'
import type { Entorno } from './types.js'

// Código QR de cotejo VeriFactu (cap. VIII Orden HAC/1177/2024, doc QR v0.5.0).
// Contenido = URL HTTPS al servicio de la AEAT con 4 parámetros URL-encoded.

export const QR_ENDPOINTS: Record<Entorno, string> = {
  produccion: 'https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR',
  pruebas: 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR',
}

/** Leyendas que deben acompañar al QR en la factura. */
export const LEYENDA = {
  verifactu: 'VERI*FACTU',
  noVerifactu: 'Factura verificable en la sede electrónica de la AEAT',
} as const

export interface QrParams {
  /** NIF del emisor (sin guiones). */
  nif: string
  /** Número + serie de la factura. */
  numserie: string
  /** Fecha de expedición, formato DD-MM-YYYY. */
  fecha: string
  /** Importe total, separador decimal punto. */
  importe: string
}

/** Construye la URL de cotejo con los 4 parámetros en orden y URL-encoded. */
export function qrUrl(p: QrParams, entorno: Entorno = 'produccion'): string {
  // Orden fijo (nif, numserie, fecha, importe) y URL-encoding RFC 3986 sobre UTF-8:
  // encodeURIComponent codifica '/'→%2F, ' '→%20, '&'→%26… (deja '.' intacto en importe).
  const qs =
    `nif=${encodeURIComponent(p.nif)}` +
    `&numserie=${encodeURIComponent(p.numserie)}` +
    `&fecha=${encodeURIComponent(p.fecha)}` +
    `&importe=${encodeURIComponent(p.importe)}`
  return `${QR_ENDPOINTS[entorno]}?${qs}`
}

/** PNG (data URL) del QR, nivel de corrección M, listo para incrustar. */
export function qrDataUrl(p: QrParams, entorno: Entorno = 'produccion'): Promise<string> {
  return QRCode.toDataURL(qrUrl(p, entorno), { errorCorrectionLevel: 'M', margin: 2 })
}

/** SVG del QR, nivel de corrección M. */
export function qrSvg(p: QrParams, entorno: Entorno = 'produccion'): Promise<string> {
  return QRCode.toString(qrUrl(p, entorno), { type: 'svg', errorCorrectionLevel: 'M', margin: 2 })
}
