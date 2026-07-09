// Cliente SOAP del web service VeriFactu (AEAT). TLS mutuo con certificado.
// Endpoints y operación según SistemaFacturacion.wsdl oficial (tikeV1.0).
// En modo VERI*FACTU la autenticación es el certificado de cliente (no XAdES).
import { request } from 'node:https'
import { XMLParser } from 'fast-xml-parser'
import type { Cabecera, Entorno, RegistroAlta, RegistroAnulacion } from './types.js'
import { xmlLote } from './xml.js'

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
  ) ?? Object.values(body).find(
    (v) => v && typeof v === 'object' && ('RegistroRespuestaConsultaFactuSistemaFacturacion' in (v as object) || 'RegistroRespuestaConsulta' in (v as object)),
  ) ?? {}) as Record<string, unknown>
  const rawLineas = resp.RespuestaLinea ?? resp.RegistroRespuestaConsultaFactuSistemaFacturacion ?? resp.RegistroRespuestaConsulta
  const arr = Array.isArray(rawLineas) ? rawLineas : rawLineas ? [rawLineas] : []
  const lineas: RespuestaLinea[] = arr.map((l) => {
    const o = l as Record<string, unknown>
    const id = (o.IDFactura ?? {}) as Record<string, unknown>
    // En respuesta de consulta, EstadoRegistro es {EstadoRegistro:"Correcto",...} en vez de string
    const er = o.EstadoRegistro as Record<string, unknown> | string | undefined
    const estadoRegistro = typeof er === 'object' && er !== null ? str(er.EstadoRegistro) : str(er)
    const codigoError = typeof er === 'object' && er !== null ? str(er.CodigoErrorRegistro) : str(o.CodigoErrorRegistro)
    const descripcionError = typeof er === 'object' && er !== null ? str(er.DescripcionErrorRegistro) : str(o.DescripcionErrorRegistro)
    return {
      numSerieFactura: str(id.NumSerieFactura),
      estadoRegistro,
      codigoError,
      descripcionError,
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

/** Un registro a remitir: alta o anulación. */
export type RegistroEnvio = { alta: RegistroAlta } | { anulacion: RegistroAnulacion }

/** Trocea un array en lotes de tamaño <= n (por defecto 1000, el máx. AEAT por envío). */
export function trocear<T>(xs: T[], n = 1000): T[][] {
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n))
  return out
}

/**
 * Remite una serie de registros troceándola en lotes de <=1000 y enviándolos en secuencia.
 * Devuelve una RespuestaEnvio por lote.
 */
// ponytail: secuencial sin espera entre envíos (vale en local/dry). Un volcado masivo real
// debe respetar el tiempo de espera (TiempoEsperaEnvio, inicial 60s) que la AEAT devuelve.
export async function enviarSerie(
  cabecera: Cabecera,
  registros: RegistroEnvio[],
  opts: EnvioOpts,
): Promise<RespuestaEnvio[]> {
  const respuestas: RespuestaEnvio[] = []
  for (const lote of trocear(registros)) {
    respuestas.push(await enviar(xmlLote(cabecera, lote), opts))
  }
  return respuestas
}

const NS_CONS_LR =
  'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/ConsultaLR.xsd'
const NS_CONS_SF =
  'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroInformacion.xsd'

function escXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function elc(name: string, value: string | undefined): string {
  return value === undefined ? '' : `<sfc:${name}>${escXml(value)}</sfc:${name}>`
}

/** Filtro de la operación de consulta `ConsultaFactuSistemaFacturacion`. */
export interface ConsultaFiltro {
  ejercicio: string
  periodo?: string
  NIFEmisor?: string
  numSerieFactura?: string
  /** Clave para continuar una respuesta paginada (IndicadorPaginacion="S"). */
  clavePaginacion?: { IDEmisorFactura: string; NumSerieFactura: string; FechaExpedicionFactura: string }
}

/** XML de la operación de consulta (schema ConsultaLR.xsd) envuelto en RegFactu de consulta. */
export function consultaXml(cabecera: Cabecera, f: ConsultaFiltro): string {
  const periodoImputacion =
    `<con:PeriodoImputacion>` +
    elc('Ejercicio', f.ejercicio) +
    elc('Periodo', f.periodo) +
    `</con:PeriodoImputacion>`
  const clave = f.clavePaginacion
    ? `<con:ClavePaginacion>` +
      elc('IDEmisorFactura', f.clavePaginacion.IDEmisorFactura) +
      elc('NumSerieFactura', f.clavePaginacion.NumSerieFactura) +
      elc('FechaExpedicionFactura', f.clavePaginacion.FechaExpedicionFactura) +
      `</con:ClavePaginacion>`
    : ''
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<con:ConsultaFactuSistemaFacturacion xmlns:con="${NS_CONS_LR}" xmlns:sfc="${NS_CONS_SF}">` +
    `<con:Cabecera>` +
    elc('IDVersion', '1.0') +
    `<sfc:ObligadoEmision>` +
    elc('NombreRazon', cabecera.NombreRazon) +
    elc('NIF', cabecera.NIF) +
    `</sfc:ObligadoEmision></con:Cabecera>` +
    `<con:FiltroConsulta>` +
    periodoImputacion +
    elc('NumSerieFactura', f.numSerieFactura) +
    clave +
    `</con:FiltroConsulta>` +
    `</con:ConsultaFactuSistemaFacturacion>`
  )
}

/**
 * Lanza una consulta de registros (TLS mutuo) sobre el mismo servicio SistemaFacturacion.
 * Devuelve la respuesta cruda; el parseo completo (paginación) queda fuera de alcance.
 */
// ponytail: respuestas paginan con IndicadorPaginacion="S" + ClavePaginacion (máx 10000);
// reenviar consultaXml con f.clavePaginacion para la siguiente página cuando haga falta.
export async function consultar(
  cabecera: Cabecera,
  f: ConsultaFiltro,
  opts: EnvioOpts,
): Promise<RespuestaEnvio> {
  const url = new URL(SOAP_ENDPOINTS[opts.entorno ?? 'pruebas'])
  const payload = Buffer.from(soapEnvelope(consultaXml(cabecera, f)), 'utf8')
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: url.hostname,
        path: url.pathname,
        method: 'POST',
        ...opts.credencial,
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          SOAPAction: '"?op=ConsultaFactuSistemaFacturacion"',
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
