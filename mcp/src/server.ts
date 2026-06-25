#!/usr/bin/env node
// verifactu-mcp — servidor MCP stdio que envuelve @inoguerols/verifactu. MIT.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import {
  computeHuellaAlta,
  lint,
  qrUrl,
  qrSvg,
  validarNif,
  xmlRegistroAlta,
} from '@inoguerols/verifactu'
import type { RegistroAlta, Cabecera } from '@inoguerols/verifactu'

const server = new McpServer({
  name: 'verifactu',
  version: '1.0.0',
})

// ── huella_alta ──────────────────────────────────────────────────────────────
server.tool(
  'verifactu_huella_alta',
  'Calcula la huella SHA-256 de un registro de alta VeriFactu (Orden HAC/1177/2024). ' +
    'Devuelve la huella hex en mayúsculas (64 caracteres). ' +
    'Pasar huellaAnterior vacía ("") en el primer registro de la serie.',
  {
    IDEmisorFactura: z.string().describe('NIF del emisor (p.ej. B12345678)'),
    NumSerieFactura: z.string().describe('Serie + número de la factura'),
    FechaExpedicionFactura: z.string().describe('Fecha de expedición, formato dd-mm-yyyy'),
    TipoFactura: z.string().describe('F1, F2, F3, R1..R5'),
    CuotaTotal: z.string().describe('Suma de cuotas, separador decimal punto'),
    ImporteTotal: z.string().describe('Importe total, separador decimal punto'),
    huellaAnterior: z.string().describe('Huella del registro anterior; "" para el primero'),
    FechaHoraHusoGenRegistro: z
      .string()
      .describe('Fecha-hora con huso ISO 8601, p.ej. 2024-01-15T10:30:00+01:00'),
  },
  (args) => {
    const huella = computeHuellaAlta(args)
    return { content: [{ type: 'text', text: huella }] }
  },
)

// ── lint ─────────────────────────────────────────────────────────────────────
// ponytail: el schema del array acepta unknown porque RegistroAlta es complejo;
// la librería ya valida internamente todos los campos.
server.tool(
  'verifactu_lint',
  'Verifica el cumplimiento VeriFactu de una serie de registros de alta: ' +
    'campos, formatos, NIF, desglose, destinatarios, encadenamiento e integridad de la cadena de huellas. ' +
    'Devuelve un informe JSON con ok, errores, avisos e incidencias detalladas.',
  {
    registros: z
      .array(z.record(z.string(), z.unknown()))
      .describe('Array de registros de alta (RegistroAlta[]) en orden de encadenamiento'),
  },
  (args) => {
    const informe = lint(args.registros as unknown as RegistroAlta[])
    return { content: [{ type: 'text', text: JSON.stringify(informe, null, 2) }] }
  },
)

// ── qr ───────────────────────────────────────────────────────────────────────
server.tool(
  'verifactu_qr',
  'Genera la URL de cotejo VeriFactu (y opcionalmente el SVG del QR) para incrustar en la factura. ' +
    'Entorno "produccion" (por defecto) o "pruebas".',
  {
    nif: z.string().describe('NIF del emisor'),
    numserie: z.string().describe('Número + serie de la factura'),
    fecha: z.string().describe('Fecha de expedición, formato DD-MM-YYYY'),
    importe: z.string().describe('Importe total, separador decimal punto'),
    entorno: z
      .enum(['produccion', 'pruebas'])
      .optional()
      .describe('Entorno AEAT (por defecto: produccion)'),
    svg: z.boolean().optional().describe('Si true, incluye también el SVG del QR'),
  },
  async (args) => {
    const { nif, numserie, fecha, importe, entorno = 'produccion', svg } = args
    const params = { nif, numserie, fecha, importe }
    const url = qrUrl(params, entorno)
    if (!svg) return { content: [{ type: 'text', text: url }] }
    const svgStr = await qrSvg(params, entorno)
    return {
      content: [
        { type: 'text', text: url },
        { type: 'text', text: svgStr },
      ],
    }
  },
)

// ── validar_nif ───────────────────────────────────────────────────────────────
server.tool(
  'verifactu_validar_nif',
  'Valida el dígito de control de un NIF español (DNI, NIE o CIF). ' +
    'Devuelve "true" o "false".',
  {
    nif: z.string().describe('NIF a validar (9 caracteres, sin guiones ni espacios)'),
  },
  (args) => {
    const ok = validarNif(args.nif)
    return { content: [{ type: 'text', text: String(ok) }] }
  },
)

// ── xml_alta ──────────────────────────────────────────────────────────────────
server.tool(
  'verifactu_xml_alta',
  'Serializa un registro de alta al XML del web service AEAT (RegFactuSistemaFacturacion). ' +
    'Devuelve el XML completo listo para enviar a la AEAT.',
  {
    registro: z
      .record(z.string(), z.unknown())
      .describe('Registro de alta (RegistroAlta) con todos sus campos'),
    cabecera: z
      .object({
        NombreRazon: z.string().describe('Nombre o razón social del obligado'),
        NIF: z.string().describe('NIF del obligado a la emisión'),
      })
      .describe('Cabecera del envío (ObligadoEmision)'),
  },
  (args) => {
    const xml = xmlRegistroAlta(args.registro as unknown as RegistroAlta, args.cabecera as Cabecera)
    return { content: [{ type: 'text', text: xml }] }
  },
)

// ── arranque ──────────────────────────────────────────────────────────────────
const transport = new StdioServerTransport()
await server.connect(transport)
