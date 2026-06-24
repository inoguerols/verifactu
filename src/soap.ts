// Cliente SOAP del web service VeriFactu (AEAT). TLS mutuo con certificado.
// Endpoints y operación según SistemaFacturacion.wsdl oficial (tikeV1.0).
// En modo VERI*FACTU la autenticación es el certificado de cliente (no XAdES).
import { request } from 'node:https'
import { XMLParser } from 'fast-xml-parser'
import type { Entorno } from './types.js'

/** Endpoints del servicio de remisión de registros (VerifactuSOAP). */
export const SOAP_ENDPOINTS: Record<Entorno, string> = {
  produccion:
    'https://www1.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP',
  pruebas: 'https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP',
}

/** Certificado de cliente: PEM (cert+key) o PKCS#12 (pfx) con passphrase. */
export type Credencial =
  | { cert: string | Buffer; key: string | Buffer; passphrase?: string }
  | { pfx: string | Buffer; passphrase?: string }

export interface EnvioOpts {
  /** 'pruebas' (preproducción) por defecto; 'produccion' para envío real. */
  entorno?: Entorno
  credencial: Credencial
}

/** Envuelve el XML `RegFactuSistemaFacturacion` en un sobre SOAP 1.1. */
export function soapEnvelope(regFactuXml: string): string {
  const body = regFactuXml.replace(/^<\?xml[^>]*\?>\s*/, '')
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">` +
    `<soapenv:Header/><soapenv:Body>${body}</soapenv:Body></soapenv:Envelope>`
  )
}

export interface RespuestaLinea {
  numSerieFactura?: string | undefined
  estadoRegistro?: string | undefined
  codigoError?: string | undefined
  descripcionError?: string | undefined
}

export interface RespuestaEnvio {
  /** HTTP status de la respuesta. */
  httpStatus: number
  /** 'Correcto' | 'ParcialmenteCorrecto' | 'Incorrecto' (si parseable). */
  estadoEnvio?: string | undefined
  csv?: string | undefined
  lineas: RespuestaLinea[]
  /** Cuerpo XML crudo de la respuesta (siempre presente para depurar). */
  raw: string
}

/** Extrae estado y líneas de la RespuestaSuministro de la AEAT (tolerante a NS). */
export function parseRespuesta(xml: string, httpStatus = 0): RespuestaEnvio {
  const p = new XMLParser({ removeNSPrefix: true, ignoreAttributes: true })
  let doc: Record<string, unknown> = {}
  try {
    doc = p.parse(xml) as Record<string, unknown>
  } catch {
    return { httpStatus, lineas: [], raw: xml }
  }
  // Buscar el nodo de respuesta sin asumir prefijos exactos.
  const env = (doc.Envelope ?? doc) as Record<string, unknown>
  const body = (env.Body ?? env) as Record<string, unknown>
  const resp = (Object.values(body).find(
    (v) => v && typeof v === 'object' && 'RespuestaLinea' in (v as object),
  ) ?? {}) as Record<string, unknown>
  const rawLineas = resp.RespuestaLinea
  const arr = Array.isArray(rawLineas) ? rawLineas : rawLineas ? [rawLineas] : []
  const lineas: RespuestaLinea[] = arr.map((l) => {
    const o = l as Record<string, unknown>
    const id = (o.IDFactura ?? {}) as Record<string, unknown>
    return {
      numSerieFactura: str(id.NumSerieFactura),
      estadoRegistro: str(o.EstadoRegistro),
      codigoError: str(o.CodigoErrorRegistro),
      descripcionError: str(o.DescripcionErrorRegistro),
    }
  })
  return {
    httpStatus,
    estadoEnvio: str(resp.EstadoEnvio),
    csv: str(resp.CSV),
    lineas,
    raw: xml,
  }
}

function str(v: unknown): string | undefined {
  return v === undefined || v === null ? undefined : String(v)
}

/**
 * Envía un XML `RegFactuSistemaFacturacion` al web service (TLS mutuo).
 * Devuelve la respuesta parseada. Lanza si la conexión falla.
 */
export async function enviar(regFactuXml: string, opts: EnvioOpts): Promise<RespuestaEnvio> {
  const url = new URL(SOAP_ENDPOINTS[opts.entorno ?? 'pruebas'])
  const payload = Buffer.from(soapEnvelope(regFactuXml), 'utf8')
  return new Promise<RespuestaEnvio>((resolve, reject) => {
    const req = request(
      {
        host: url.hostname,
        path: url.pathname,
        method: 'POST',
        ...opts.credencial,
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          SOAPAction: '""',
          'Content-Length': payload.length,
        },
      },
      (res) => {
        let data = ''
        res.setEncoding('utf8')
        res.on('data', (c) => (data += c))
        res.on('end', () => resolve(parseRespuesta(data, res.statusCode ?? 0)))
      },
    )
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}
