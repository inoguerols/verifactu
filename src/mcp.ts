#!/usr/bin/env node
// verifactu-mcp — servidor MCP stdio que expone esta misma librería. MIT.
// Se publica como segundo binario del paquete @inoguerols/verifactu.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { computeHuellaAlta, lint, qrSvg, qrUrl, validarNif, xmlRegistroAlta } from './index.js'
import type { Cabecera, RegistroAlta } from './index.js'

const server = new McpServer({ name: 'verifactu', version: '1.2.0' })

server.tool(
  'verifactu_huella_alta',
  'Calcula la huella SHA-256 de un registro de alta VeriFactu (Orden HAC/1177/2024). ' +
    'Devuelve la huella hex en mayúsculas (64). huellaAnterior vacía ("") en el primer registro.',
  {
    IDEmisorFactura: z.string().describe('NIF del emisor (p.ej. B12345678)'),
    NumSerieFactura: z.string().describe('Serie + número de la factura'),
    FechaExpedicionFactura: z.string().describe('Fecha de expedición, formato dd-mm-yyyy'),
    TipoFactura: z.string().describe('F1, F2, F3, R1..R5'),
    CuotaTotal: z.string().describe('Suma de cuotas, separador decimal punto'),
    ImporteTotal: z.string().describe('Importe total, separador decimal punto'),
    huellaAnterior: z.string().describe('Huella del registro anterior; "" para el primero'),
    FechaHoraHusoGenRegistro: z.string().describe('Fecha-hora con huso ISO 8601'),
  },
  (args) => ({ content: [{ type: 'text', text: computeHuellaAlta(args) }] }),
)

server.tool(
  'verifactu_lint',
  'Verifica el cumplimiento VeriFactu de una serie de registros de alta (campos, NIF, ' +
    'desglose, destinatarios, encadenamiento e integridad de la cadena de huellas). Devuelve un informe JSON.',
  {
    registros: z
      .array(z.record(z.string(), z.unknown()))
      .describe('Array de registros de alta (RegistroAlta[]) en orden de encadenamiento'),
  },
  (args) => ({
    content: [{ type: 'text', text: JSON.stringify(lint(args.registros as unknown as RegistroAlta[]), null, 2) }],
  }),
)

server.tool(
  'verifactu_qr',
  'Genera la URL de cotejo VeriFactu (y opcionalmente el SVG del QR). Entorno "produccion" (def) o "pruebas".',
  {
    nif: z.string().describe('NIF del emisor'),
    numserie: z.string().describe('Número + serie de la factura'),
    fecha: z.string().describe('Fecha de expedición, DD-MM-YYYY'),
    importe: z.string().describe('Importe total, separador decimal punto'),
    entorno: z.enum(['produccion', 'pruebas']).optional().describe('Entorno AEAT (def: produccion)'),
    svg: z.boolean().optional().describe('Si true, incluye también el SVG del QR'),
  },
  async (args) => {
    const { nif, numserie, fecha, importe, entorno = 'produccion', svg } = args
    const params = { nif, numserie, fecha, importe }
    const url = qrUrl(params, entorno)
    if (!svg) return { content: [{ type: 'text', text: url }] }
    return { content: [{ type: 'text', text: url }, { type: 'text', text: await qrSvg(params, entorno) }] }
  },
)

server.tool(
  'verifactu_validar_nif',
  'Valida el dígito de control de un NIF español (DNI, NIE o CIF). Devuelve "true" o "false".',
  { nif: z.string().describe('NIF a validar (9 caracteres, sin guiones ni espacios)') },
  (args) => ({ content: [{ type: 'text', text: String(validarNif(args.nif)) }] }),
)

server.tool(
  'verifactu_xml_alta',
  'Serializa un registro de alta al XML del web service AEAT (RegFactuSistemaFacturacion).',
  {
    registro: z.record(z.string(), z.unknown()).describe('Registro de alta (RegistroAlta)'),
    cabecera: z
      .object({ NombreRazon: z.string(), NIF: z.string() })
      .describe('Cabecera del envío (ObligadoEmision)'),
  },
  (args) => ({
    content: [{ type: 'text', text: xmlRegistroAlta(args.registro as unknown as RegistroAlta, args.cabecera as Cabecera) }],
  }),
)

const transport = new StdioServerTransport()
await server.connect(transport)
