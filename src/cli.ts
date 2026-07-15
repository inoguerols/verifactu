#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { firmarRegistro } from './firma.js'
import { computeHuellaAlta, computeHuellaAnulacion } from './huella.js'
import { lint } from './lint.js'
import {
  type ConsultaFiltro,
  type Credencial,
  type RegistroEnvio,
  type RespuestaLinea,
  consultaXml,
  consultar,
  enviar,
  enviarSerie,
  soapEnvelope,
} from './soap.js'
import type { Cabecera, RegistroAlta, RegistroAnulacion } from './types.js'
import { xmlLote, xmlRegistroAlta, xmlRegistroAnulacion } from './xml.js'

// CLI verifactu:
//   verifactu lint <serie.json>                 verifica una serie de altas
//   verifactu enviar <envio.json> [cert] [--prod] [--dry-run]   remite (TLS mutuo)
//   verifactu firmar <envio.json> --cert c.pem --key k.pem      firma XAdES (No Veri*Factu)
//   verifactu consultar <consulta.json> [cert] [--prod] [--dry-run]

const argv = process.argv.slice(2)
const cmd = argv[0]
const flag = (n: string) => argv.includes(n)
const opt = (n: string) => {
  const i = argv.indexOf(n)
  return i >= 0 ? argv[i + 1] : undefined
}
const die = (msg: string, code = 64): never => {
  console.error(msg)
  process.exit(code)
}

const USO =
  'uso:\n' +
  '  verifactu lint <serie.json>\n' +
  '  verifactu enviar <envio.json> [--pfx f.p12 [--passphrase p] | --cert c.pem --key k.pem] [--prod] [--dry-run]\n' +
  '  verifactu firmar <envio.json> --cert c.pem --key k.pem\n' +
  '  verifactu consultar <consulta.json> [--pfx f.p12 [--passphrase p] | --cert c.pem --key k.pem] [--prod] [--dry-run]\n' +
  '\n' +
  'envio.json: { "cabecera": {...}, "alta": {...} } | { "cabecera", "anulacion": {...} } | { "cabecera", "registros": [ {alta}|{anulacion}, ... ] }'

function leerJson<T>(file: string | undefined): T {
  if (!file || file.startsWith('--')) die(USO)
  try {
    return JSON.parse(readFileSync(file as string, 'utf8')) as T
  } catch (e) {
    return die(`No se pudo leer ${file}: ${(e as Error).message}`, 66)
  }
}

/** Lee el certificado de cliente para TLS mutuo desde los flags. */
function credencialDesdeFlags(): Credencial {
  const pfx = opt('--pfx')
  const cert = opt('--cert')
  const key = opt('--key')
  const pass = opt('--passphrase')
  if (pfx) return { pfx: readFileSync(pfx), ...(pass !== undefined && { passphrase: pass }) }
  if (cert && key)
    return {
      cert: readFileSync(cert),
      key: readFileSync(key),
      ...(pass !== undefined && { passphrase: pass }),
    }
  return die('falta certificado: --pfx f.p12 [--passphrase p]  o  --cert c.pem --key k.pem')
}

/** Calcula la huella de un registro si falta, a partir de su encadenamiento. */
function asegurarHuella(item: RegistroEnvio): void {
  if ('alta' in item) {
    const a = item.alta
    if (a.Huella) return
    const e = a.Encadenamiento
    const ha = 'RegistroAnterior' in e ? e.RegistroAnterior.Huella : ''
    a.Huella = computeHuellaAlta({
      IDEmisorFactura: a.IDFactura.IDEmisorFactura,
      NumSerieFactura: a.IDFactura.NumSerieFactura,
      FechaExpedicionFactura: a.IDFactura.FechaExpedicionFactura,
      TipoFactura: a.TipoFactura,
      CuotaTotal: a.CuotaTotal,
      ImporteTotal: a.ImporteTotal,
      huellaAnterior: ha,
      FechaHoraHusoGenRegistro: a.FechaHoraHusoGenRegistro,
    })
  } else {
    const a = item.anulacion
    if (a.Huella) return
    const e = a.Encadenamiento
    const ha = 'RegistroAnterior' in e ? e.RegistroAnterior.Huella : ''
    a.Huella = computeHuellaAnulacion({
      IDEmisorFacturaAnulada: a.IDFactura.IDEmisorFactura,
      NumSerieFacturaAnulada: a.IDFactura.NumSerieFactura,
      FechaExpedicionFacturaAnulada: a.IDFactura.FechaExpedicionFactura,
      huellaAnterior: ha,
      FechaHoraHusoGenRegistro: a.FechaHoraHusoGenRegistro,
    })
  }
}

interface Envio {
  cabecera?: Cabecera
  alta?: RegistroAlta
  anulacion?: RegistroAnulacion
  registros?: RegistroEnvio[]
}

/** Normaliza el JSON de envío a una lista de registros (alta/anulación). */
function itemsDeEnvio(envio: Envio): RegistroEnvio[] {
  if (envio.registros) return envio.registros
  if (envio.alta) return [{ alta: envio.alta }]
  if (envio.anulacion) return [{ anulacion: envio.anulacion }]
  return die('el JSON debe tener "alta", "anulacion" o "registros"')
}

function imprimirRespuesta(httpStatus: number, estadoEnvio: string | undefined, lineas: RespuestaLinea[], csv: string | undefined): boolean {
  console.error(`HTTP ${httpStatus} | EstadoEnvio: ${estadoEnvio ?? '?'}`)
  for (const l of lineas) {
    const err = l.codigoError ? ` [${l.codigoError}] ${l.descripcionError ?? ''}` : ''
    console.error(`  ${l.numSerieFactura ?? ''}: ${l.estadoRegistro ?? ''}${err}`)
  }
  if (csv) console.error(`CSV: ${csv}`)
  return httpStatus < 400 && estadoEnvio !== 'Incorrecto'
}

/** XML de un envío (un registro → su sobre concreto; varios → lote). */
function xmlDeItems(cabecera: Cabecera, items: RegistroEnvio[]): string {
  const uno = items[0]
  if (items.length === 1 && uno && 'alta' in uno) return xmlRegistroAlta(uno.alta, cabecera)
  if (items.length === 1 && uno && 'anulacion' in uno) return xmlRegistroAnulacion(uno.anulacion, cabecera)
  return xmlLote(cabecera, items)
}

async function main(): Promise<number> {
  if (cmd === 'lint') {
    const registros = leerJson<RegistroAlta[]>(argv[1])
    if (!Array.isArray(registros)) die('el JSON debe ser un array de registros de alta', 66)
    const informe = lint(registros)
    for (const x of informe.incidencias) {
      const donde = x.index >= 0 ? `#${x.index}` : 'serie'
      console.error(`[${x.nivel}] ${donde} ${x.code}: ${x.message}`)
    }
    console.error(`\n${informe.ok ? 'OK' : 'NO CUMPLE'} — ${informe.total} registros, ${informe.errores} errores, ${informe.avisos} avisos`)
    return informe.ok ? 0 : 1
  }

  if (cmd === 'enviar') {
    const envio = leerJson<Envio>(argv[1])
    if (!envio.cabecera) die('el JSON debe incluir "cabecera"')
    const cabecera = envio.cabecera as Cabecera
    const items = itemsDeEnvio(envio)
    items.forEach(asegurarHuella)

    if (flag('--dry-run')) {
      console.log(soapEnvelope(xmlDeItems(cabecera, items)))
      return 0
    }

    const credencial = credencialDesdeFlags()
    const entorno = flag('--prod') ? 'produccion' : 'pruebas'
    let ok = true
    if (items.length > 1000) {
      const respuestas = await enviarSerie(cabecera, items, { entorno, credencial })
      respuestas.forEach((r, i) => {
        console.error(`-- lote ${i + 1}/${respuestas.length} --`)
        ok = imprimirRespuesta(r.httpStatus, r.estadoEnvio, r.lineas, r.csv) && ok
      })
    } else {
      const r = await enviar(xmlDeItems(cabecera, items), { entorno, credencial })
      ok = imprimirRespuesta(r.httpStatus, r.estadoEnvio, r.lineas, r.csv)
      if (!ok) console.error(`\n--- respuesta cruda ---\n${r.raw}`)
    }
    return ok ? 0 : 1
  }

  if (cmd === 'firmar') {
    const envio = leerJson<Envio>(argv[1])
    if (!envio.cabecera || !envio.alta) die('firmar requiere { "cabecera", "alta" }')
    const alta = envio.alta as RegistroAlta
    asegurarHuella({ alta })
    const cert = opt('--cert')
    const key = opt('--key')
    if (!cert || !key) return die('firmar requiere --cert c.pem --key k.pem (PEM)')
    const xml = xmlRegistroAlta(alta, envio.cabecera as Cabecera)
    console.log(await firmarRegistro(xml, { cert: readFileSync(cert), key: readFileSync(key) }))
    return 0
  }

  if (cmd === 'consultar') {
    const cons = leerJson<{ cabecera?: Cabecera; filtro?: ConsultaFiltro }>(argv[1])
    if (!cons.cabecera || !cons.filtro) die('consultar requiere { "cabecera", "filtro" }')
    const cabecera = cons.cabecera as Cabecera
    const filtro = cons.filtro as ConsultaFiltro
    if (flag('--dry-run')) {
      console.log(soapEnvelope(consultaXml(cabecera, filtro)))
      return 0
    }
    const credencial = credencialDesdeFlags()
    const entorno = flag('--prod') ? 'produccion' : 'pruebas'
    const r = await consultar(cabecera, filtro, { entorno, credencial })
    console.error(`HTTP ${r.httpStatus}`)
    if (r.avisos?.length) console.error('Avisos:', r.avisos.join('; '))
    console.log(r.raw)
    return r.httpStatus < 400 ? 0 : 1
  }

  die(USO)
  return 64
}

main()
  .then((code) => process.exit(code))
  .catch((e: Error) => die(`Error: ${e.message}`, 69))
