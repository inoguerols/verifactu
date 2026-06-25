// Serialización del registro de facturación al XML del web service AEAT.
// Estructura y orden de elementos según los XSD oficiales (tikeV1.0):
// SuministroLR.xsd (raíz RegFactuSistemaFacturacion) + SuministroInformacion.xsd.
// Validar con: npm run validate:xsd
import type {
  Cabecera,
  DesgloseItem,
  Persona,
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

function idFacturaAs(
  wrapper: string,
  f: { IDEmisorFactura: string; NumSerieFactura: string; FechaExpedicionFactura: string },
): string {
  return (
    `<sf:${wrapper}>` +
    el('IDEmisorFactura', f.IDEmisorFactura) +
    el('NumSerieFactura', f.NumSerieFactura) +
    el('FechaExpedicionFactura', f.FechaExpedicionFactura) +
    `</sf:${wrapper}>`
  )
}

function idFactura(f: { IDEmisorFactura: string; NumSerieFactura: string; FechaExpedicionFactura: string }): string {
  return idFacturaAs('IDFactura', f)
}

// El IDFactura de una anulación usa los nombres de elemento con sufijo "Anulada"
// (IDFacturaExpedidaBajaType del XSD).
function idFacturaAnulada(f: { IDEmisorFactura: string; NumSerieFactura: string; FechaExpedicionFactura: string }): string {
  return (
    `<sf:IDFactura>` +
    el('IDEmisorFacturaAnulada', f.IDEmisorFactura) +
    el('NumSerieFacturaAnulada', f.NumSerieFactura) +
    el('FechaExpedicionFacturaAnulada', f.FechaExpedicionFactura) +
    `</sf:IDFactura>`
  )
}

/** Destinatario: NombreRazon + (NIF | IDOtro). */
function destinatario(p: Persona): string {
  const ident =
    p.IDOtro !== undefined
      ? `<sf:IDOtro>` +
        el('CodigoPais', p.IDOtro.CodigoPais) +
        el('IDType', p.IDOtro.IDType) +
        el('ID', p.IDOtro.ID) +
        `</sf:IDOtro>`
      : el('NIF', p.NIF)
  return `<sf:IDDestinatario>` + el('NombreRazon', p.NombreRazon) + ident + `</sf:IDDestinatario>`
}

function envelope(cabecera: Cabecera, registros: string[]): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<sfLR:RegFactuSistemaFacturacion xmlns:sfLR="${NS_LR}" xmlns:sf="${NS_SF}">` +
    `<sfLR:Cabecera><sf:ObligadoEmision>` +
    el('NombreRazon', cabecera.NombreRazon) +
    el('NIF', cabecera.NIF) +
    `</sf:ObligadoEmision></sfLR:Cabecera>` +
    registros.map((r) => `<sfLR:RegistroFactura>${r}</sfLR:RegistroFactura>`).join('') +
    `</sfLR:RegFactuSistemaFacturacion>`
  )
}

/** Cuerpo `<sf:RegistroAlta>…</sf:RegistroAlta>` en orden XSD (RegistroFacturacionAltaType). */
function regAltaInner(r: RegistroAlta): string {
  const facturasRectificadas =
    r.FacturasRectificadas !== undefined
      ? `<sf:FacturasRectificadas>` +
        r.FacturasRectificadas.map((f) => idFacturaAs('IDFacturaRectificada', f)).join('') +
        `</sf:FacturasRectificadas>`
      : ''
  const facturasSustituidas =
    r.FacturasSustituidas !== undefined
      ? `<sf:FacturasSustituidas>` +
        r.FacturasSustituidas.map((f) => idFacturaAs('IDFacturaSustituida', f)).join('') +
        `</sf:FacturasSustituidas>`
      : ''
  const importeRectificacion =
    r.ImporteRectificacion !== undefined
      ? `<sf:ImporteRectificacion>` +
        el('BaseRectificada', r.ImporteRectificacion.BaseRectificada) +
        el('CuotaRectificada', r.ImporteRectificacion.CuotaRectificada) +
        el('CuotaRecargoRectificado', r.ImporteRectificacion.CuotaRecargoRectificado) +
        `</sf:ImporteRectificacion>`
      : ''
  const destinatarios =
    r.Destinatarios !== undefined
      ? `<sf:Destinatarios>` + r.Destinatarios.map(destinatario).join('') + `</sf:Destinatarios>`
      : ''
  return (
    `<sf:RegistroAlta>` +
    el('IDVersion', r.IDVersion) +
    idFactura(r.IDFactura) +
    el('RefExterna', r.RefExterna) +
    el('NombreRazonEmisor', r.NombreRazonEmisor) +
    el('TipoFactura', r.TipoFactura) +
    el('TipoRectificativa', r.TipoRectificativa) +
    facturasRectificadas +
    facturasSustituidas +
    importeRectificacion +
    el('FechaOperacion', r.FechaOperacion) +
    el('DescripcionOperacion', r.DescripcionOperacion) +
    el('FacturaSimplificadaArt7273', r.FacturaSimplificadaArt7273) +
    el('FacturaSinIdentifDestinatarioArt61d', r.FacturaSinIdentifDestinatarioArt61d) +
    destinatarios +
    `<sf:Desglose>${r.Desglose.map(detalle).join('')}</sf:Desglose>` +
    el('CuotaTotal', r.CuotaTotal) +
    el('ImporteTotal', r.ImporteTotal) +
    encadenamiento(r.Encadenamiento) +
    sistemaInformatico(r.SistemaInformatico) +
    el('FechaHoraHusoGenRegistro', r.FechaHoraHusoGenRegistro) +
    el('TipoHuella', r.TipoHuella) +
    el('Huella', r.Huella) +
    `</sf:RegistroAlta>`
  )
}

/** Cuerpo `<sf:RegistroAnulacion>…</sf:RegistroAnulacion>` en orden XSD. */
function regAnulacionInner(r: RegistroAnulacion): string {
  return (
    `<sf:RegistroAnulacion>` +
    el('IDVersion', r.IDVersion) +
    idFacturaAnulada(r.IDFactura) +
    encadenamiento(r.Encadenamiento) +
    sistemaInformatico(r.SistemaInformatico) +
    el('FechaHoraHusoGenRegistro', r.FechaHoraHusoGenRegistro) +
    el('TipoHuella', r.TipoHuella) +
    el('Huella', r.Huella) +
    `</sf:RegistroAnulacion>`
  )
}

/** XML de envío de un registro de ALTA (envoltorio RegFactu con un RegistroFactura). */
export function xmlRegistroAlta(r: RegistroAlta, cabecera: Cabecera): string {
  return envelope(cabecera, [regAltaInner(r)])
}

/** XML de envío de un registro de ANULACIÓN. */
export function xmlRegistroAnulacion(r: RegistroAnulacion, cabecera: Cabecera): string {
  return envelope(cabecera, [regAnulacionInner(r)])
}

/**
 * XML de un LOTE: varios registros (alta y/o anulación) en un mismo envío.
 * AEAT admite hasta 1000 registros por envío (XSD maxOccurs=1000).
 */
export function xmlLote(
  cabecera: Cabecera,
  items: Array<{ alta: RegistroAlta } | { anulacion: RegistroAnulacion }>,
): string {
  if (items.length === 0 || items.length > 1000) {
    throw new Error(`Lote VeriFactu: ${items.length} registros (debe ser 1-1000)`)
  }
  const registros = items.map((it) =>
    'alta' in it ? regAltaInner(it.alta) : regAnulacionInner(it.anulacion),
  )
  return envelope(cabecera, registros)
}
