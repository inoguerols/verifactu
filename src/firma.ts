// Firma XAdES enveloped del registro de facturación, para el modo "No Veri*Factu"
// (sin remisión en tiempo real a la AEAT): el RegFactuSistemaFacturacion debe ir
// firmado electrónicamente. Usa xadesjs sobre @peculiar/webcrypto.
// En Node hay que registrar las dependencias DOM de xml-core (no hay DOMParser global).
import * as xadesjs from 'xadesjs'
import { Stringify } from 'xmldsigjs'
import { Crypto } from '@peculiar/webcrypto'
import { setNodeDependencies } from 'xml-core'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import * as xpath from 'xpath'

const ALG = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' } as const
const NS_DS = 'http://www.w3.org/2000/09/xmldsig#'

let cryptoEngine: Crypto | undefined
function init(): Crypto {
  if (cryptoEngine === undefined) {
    setNodeDependencies({ DOMParser, XMLSerializer, xpath })
    cryptoEngine = new Crypto()
    xadesjs.Application.setEngine('nodejs', cryptoEngine)
  }
  return cryptoEngine
}

/** Cuerpo base64 (DER) de un bloque PEM (cert o clave), sin cabeceras ni espacios. */
function pemBody(pem: string | Buffer): string {
  return pem
    .toString('utf8')
    .replace(/-----[^-]+-----/g, '')
    .replace(/\s+/g, '')
}

/** Política de firma para elevar la firma a XAdES-EPES. */
export interface PoliticaFirma {
  /** Identificador de la política (URN/URL). Debe ser el publicado por la AEAT. */
  identifier: string
  /** Algoritmo de digest de la política (por defecto SHA-256). */
  hash?: string
}

/**
 * Firma un XML `RegFactuSistemaFacturacion` con una firma XAdES enveloped
 * (SigningTime + SigningCertificate, digest SHA-256, RSA-SHA256). Modo No Veri*Factu.
 *
 * `cred.key` = clave privada PKCS#8 en PEM; `cred.cert` = certificado X.509 en PEM.
 * Sin `opts.policy` produce XAdES-BES; con `opts.policy` produce XAdES-EPES.
 * ponytail: no se cablea una política AEAT por defecto (no verificada); pásala en `opts.policy`
 * para EPES en producción.
 */
export async function firmarRegistro(
  regFactuXml: string,
  cred: { cert: string | Buffer; key: string | Buffer },
  opts?: { policy?: PoliticaFirma },
): Promise<string> {
  const crypto = init()
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    Buffer.from(pemBody(cred.key), 'base64'),
    ALG,
    false,
    ['sign'],
  )
  const certB64 = pemBody(cred.cert)
  const xml = xadesjs.Parse(regFactuXml.replace(/^<\?xml[^>]*\?>\s*/, ''))
  const signed = new xadesjs.SignedXml()
  const signOpts: Record<string, unknown> = {
    references: [{ hash: 'SHA-256', transforms: ['enveloped'] }],
    x509: [certB64],
    signingCertificate: certB64,
    signingTime: {},
  }
  if (opts?.policy) {
    signOpts.policy = { hash: opts.policy.hash ?? 'SHA-256', identifier: { value: opts.policy.identifier } }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await signed.Sign(ALG, privateKey, xml, signOpts as any)
  const sigEl = signed.GetXml()
  if (sigEl === null) throw new Error('firmarRegistro: no se generó la firma')
  xml.documentElement.appendChild(sigEl)
  return Stringify(xml)
}

/** Verifica la firma de un XML firmado (roundtrip para tests). */
export async function verificarFirma(xmlFirmado: string): Promise<boolean> {
  init()
  const xml = xadesjs.Parse(xmlFirmado)
  const sigs = xml.getElementsByTagNameNS(NS_DS, 'Signature')
  const sig = sigs[0]
  if (sig === undefined || sig === null) return false
  const signed = new xadesjs.SignedXml(xml)
  signed.LoadXml(sig)
  return signed.Verify()
}
