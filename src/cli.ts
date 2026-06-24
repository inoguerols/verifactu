#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { computeHuellaAlta } from './huella.js'
import { lint } from './lint.js'
import { type Credencial, enviar, soapEnvelope } from './soap.js'
import type { Cabecera, RegistroAlta } from './types.js'
import { xmlRegistroAlta } from './xml.js'

// CLI: `verifactu lint <serie.json>` verifica una serie; `verifactu enviar
// <envio.json>` la remite al web service de la AEAT (TLS mutuo con certificado).

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
  '  verifactu enviar <envio.json> [--pfx f.p12 [--passphrase p] | --cert c.pem --key k.pem] [--prod] [--dry-run]'

if (cmd === 'lint') {
  const file = argv[1]
  if (!file) die(USO)
  let registros: RegistroAlta[]
  try {
    registros = JSON.parse(readFileSync(file as string, 'utf8'))
    if (!Array.isArray(registros)) throw new Error('el JSON debe ser un array de registros de alta')
  } catch (e) {
    die(`No se pudo leer ${file}: ${(e as Error).message}`, 66)
  }
  const informe = lint(registros!)
  for (const x of informe.incidencias) {
    const donde = x.index >= 0 ? `#${x.index}` : 'serie'
    console.error(`[${x.nivel}] ${donde} ${x.code}: ${x.message}`)
  }
  console.error(
    `\n${informe.ok ? 'OK' : 'NO CUMPLE'} — ${informe.total} registros, ${informe.errores} errores, ${informe.avisos} avisos`,
  )
  process.exit(informe.ok ? 0 : 1)
}

if (cmd === 'enviar') {
  const file = argv[1]
  if (!file || file.startsWith('--')) die(USO)
  let envio: { cabecera?: Cabecera; alta?: RegistroAlta }
  try {
    envio = JSON.parse(readFileSync(file as string, 'utf8'))
  } catch (e) {
    die(`No se pudo leer ${file}: ${(e as Error).message}`, 66)
  }
  const { cabecera, alta } = envio!
  if (!cabecera || !alta) die('el JSON debe tener { "cabecera": {...}, "alta": {...} }')

  // Si falta la huella, calcularla a partir de los campos del registro.
  if (!alta!.Huella) {
    const e = alta!.Encadenamiento
    const huellaAnterior = 'RegistroAnterior' in e ? e.RegistroAnterior.Huella : ''
    alta!.Huella = computeHuellaAlta({
      IDEmisorFactura: alta!.IDFactura.IDEmisorFactura,
      NumSerieFactura: alta!.IDFactura.NumSerieFactura,
      FechaExpedicionFactura: alta!.IDFactura.FechaExpedicionFactura,
      TipoFactura: alta!.TipoFactura,
      CuotaTotal: alta!.CuotaTotal,
      ImporteTotal: alta!.ImporteTotal,
      huellaAnterior,
      FechaHoraHusoGenRegistro: alta!.FechaHoraHusoGenRegistro,
    })
  }

  const xml = xmlRegistroAlta(alta!, cabecera!)
  if (flag('--dry-run')) {
    console.log(soapEnvelope(xml))
    process.exit(0)
  }

  const pfx = opt('--pfx')
  const cert = opt('--cert')
  const key = opt('--key')
  const pass = opt('--passphrase')
  let credencial: Credencial
  if (pfx) {
    credencial = { pfx: readFileSync(pfx), ...(pass !== undefined && { passphrase: pass }) }
  } else if (cert && key) {
    credencial = {
      cert: readFileSync(cert),
      key: readFileSync(key),
      ...(pass !== undefined && { passphrase: pass }),
    }
  } else {
    die('falta certificado: --pfx f.p12 [--passphrase p]  o  --cert c.pem --key k.pem')
  }

  const entorno = flag('--prod') ? 'produccion' : 'pruebas'
  enviar(xml, { entorno, credencial: credencial! })
    .then((r) => {
      console.error(`HTTP ${r.httpStatus} | EstadoEnvio: ${r.estadoEnvio ?? '?'}`)
      for (const l of r.lineas) {
        const err = l.codigoError ? ` [${l.codigoError}] ${l.descripcionError ?? ''}` : ''
        console.error(`  ${l.numSerieFactura ?? ''}: ${l.estadoRegistro ?? ''}${err}`)
      }
      if (r.csv) console.error(`CSV: ${r.csv}`)
      const ok = r.httpStatus < 400 && r.estadoEnvio !== 'Incorrecto'
      if (!ok) console.error(`\n--- respuesta cruda ---\n${r.raw}`)
      process.exit(ok ? 0 : 1)
    })
    .catch((e: Error) => die(`Error de conexión/TLS: ${e.message}`, 69))
} else {
  die(USO)
}
