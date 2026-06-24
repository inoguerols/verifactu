// Serialización del registro de facturación al XML del web service AEAT.
// Estructura y orden de elementos según los XSD oficiales (tikeV1.0):
// SuministroLR.xsd (raíz RegFactuSistemaFacturacion) + SuministroInformacion.xsd.
// Validar con: npm run validate:xsd
import type {
  Cabecera,
  DesgloseItem,
  RegistroAlta,
  RegistroAnulacion,
  SistemaInformatico,
} from './types.js'

const NS_LR =
  'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroLR.xsd'
const NS_SF =
  'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroInformacion.xsd'

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** `<sf:Nombre>valor</sf:Nombre>` con escape; '' si el valor es undefined. */
function el(name: string, value: string | undefined): string {
  return value === undefined ? '' : `<sf:${name}>${esc(value)}</sf:${name}>`
}

function sistemaInformatico(s: SistemaInformatico): string {
  return (
    `<sf:SistemaInformatico>` +
    el('NombreRazon', s.NombreRazon) +
    el('NIF', s.NIF) +
    el('NombreSistemaInformatico', s.NombreSistemaInformatico) +
    el('IdSistemaInformatico', s.IdSistemaInformatico) +
    el('Version', s.Version) +
    el('NumeroInstalacion', s.NumeroInstalacion) +
    el('TipoUsoPosibleSoloVerifactu', s.TipoUsoPosibleSoloVerifactu) +
    el('TipoUsoPosibleMultiOT', s.TipoUsoPosibleMultiOT) +
    el('IndicadorMultiplesOT', s.IndicadorMultiplesOT) +
    `</sf:SistemaInformatico>`
  )
}

// Orden XSD de DetalleType: Impuesto?, ClaveRegimen?, (Calificacion|Exenta),
// TipoImpositivo?, BaseImponible, CuotaRepercutida?
function detalle(d: DesgloseItem): string {
  const calif =
    d.OperacionExenta !== undefined
      ? el('OperacionExenta', d.OperacionExenta)
      : el('CalificacionOperacion', d.CalificacionOperacion)
  return (
    `<sf:DetalleDesglose>` +
    el('ClaveRegimen', d.ClaveRegimen) +
    calif +
    el('TipoImpositivo', d.TipoImpositivo) +
    el('BaseImponibleOimporteNoSujeto', d.BaseImponibleOimporteNoSujeto) +
    el('CuotaRepercutida', d.CuotaRepercutida) +
    `</sf:DetalleDesglose>`
  )
}

function encadenamiento(e: RegistroAlta['Encadenamiento']): string {
  if ('PrimerRegistro' in e) {
    return `<sf:Encadenamiento><sf:PrimerRegistro>${e.PrimerRegistro}</sf:PrimerRegistro></sf:Encadenamiento>`
  }
  const a = e.RegistroAnterior
  return (
    `<sf:Encadenamiento><sf:RegistroAnterior>` +
    el('IDEmisorFactura', a.IDEmisorFactura) +
    el('NumSerieFactura', a.NumSerieFactura) +
    el('FechaExpedicionFactura', a.FechaExpedicionFactura) +
    el('Huella', a.Huella) +
    `</sf:RegistroAnterior></sf:Encadenamiento>`
  )
}

function idFactura(f: { IDEmisorFactura: string; NumSerieFactura: string; FechaExpedicionFactura: string }): string {
  return (
    `<sf:IDFactura>` +
    el('IDEmisorFactura', f.IDEmisorFactura) +
    el('NumSerieFactura', f.NumSerieFactura) +
    el('FechaExpedicionFactura', f.FechaExpedicionFactura) +
    `</sf:IDFactura>`
  )
}

function envelope(cabecera: Cabecera, registro: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<sfLR:RegFactuSistemaFacturacion xmlns:sfLR="${NS_LR}" xmlns:sf="${NS_SF}">` +
    `<sfLR:Cabecera><sf:ObligadoEmision>` +
    el('NombreRazon', cabecera.NombreRazon) +
    el('NIF', cabecera.NIF) +
    `</sf:ObligadoEmision></sfLR:Cabecera>` +
    `<sfLR:RegistroFactura>${registro}</sfLR:RegistroFactura>` +
    `</sfLR:RegFactuSistemaFacturacion>`
  )
}

/** XML de envío de un registro de ALTA (envoltorio RegFactu con un RegistroFactura). */
// ponytail: un registro por envío. Lotes (hasta 1000) y firma ds:Signature, después.
export function xmlRegistroAlta(r: RegistroAlta, cabecera: Cabecera): string {
  const reg =
    `<sf:RegistroAlta>` +
    el('IDVersion', r.IDVersion) +
    idFactura(r.IDFactura) +
    el('NombreRazonEmisor', r.NombreRazonEmisor) +
    el('TipoFactura', r.TipoFactura) +
    el('DescripcionOperacion', r.DescripcionOperacion) +
    `<sf:Desglose>${r.Desglose.map(detalle).join('')}</sf:Desglose>` +
    el('CuotaTotal', r.CuotaTotal) +
    el('ImporteTotal', r.ImporteTotal) +
    encadenamiento(r.Encadenamiento) +
    sistemaInformatico(r.SistemaInformatico) +
    el('FechaHoraHusoGenRegistro', r.FechaHoraHusoGenRegistro) +
    el('TipoHuella', r.TipoHuella) +
    el('Huella', r.Huella) +
    `</sf:RegistroAlta>`
  return envelope(cabecera, reg)
}

/** XML de envío de un registro de ANULACIÓN. */
export function xmlRegistroAnulacion(r: RegistroAnulacion, cabecera: Cabecera): string {
  const reg =
    `<sf:RegistroAnulacion>` +
    el('IDVersion', r.IDVersion) +
    idFactura(r.IDFactura) +
    encadenamiento(r.Encadenamiento) +
    sistemaInformatico(r.SistemaInformatico) +
    el('FechaHoraHusoGenRegistro', r.FechaHoraHusoGenRegistro) +
    el('TipoHuella', r.TipoHuella) +
    el('Huella', r.Huella) +
    `</sf:RegistroAnulacion>`
  return envelope(cabecera, reg)
}
