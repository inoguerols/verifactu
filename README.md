# verifactu

[![npm](https://img.shields.io/npm/v/@inoguerols/verifactu)](https://www.npmjs.com/package/@inoguerols/verifactu)
[![ci](https://github.com/inoguerols/verifactu/actions/workflows/ci.yml/badge.svg)](https://github.com/inoguerols/verifactu/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)

Librería **TypeScript totalmente libre (MIT)** para **generar, firmar, enviar y
verificar el cumplimiento** de **VeriFactu** (AEAT) en cualquier desarrollo.
Sin dependencias de pago ni APIs de terceros: el núcleo es determinista y se
ejecuta offline.

> **Estado: v1.0 — completa y verificada end-to-end contra la AEAT.**
> Una factura de prueba fue **aceptada y registrada en el entorno de
> preproducción de la AEAT** (`HTTP 200`, con su CSV) usando un certificado de
> representante por TLS mutuo.

Soporta los **dos modos** del reglamento:

- **Veri\*Factu** — remisión en tiempo real al web service de la AEAT con
  **TLS mutuo** por certificado (la firma XML **no** es obligatoria).
- **No Veri\*Factu** — registros conservados y **firmados con XAdES**.

## Cómo funciona VeriFactu

VeriFactu es un sistema **antifraude**: una vez emites una factura, no debe poderse
alterar ni borrar sin que quede rastro. El mecanismo, paso a paso:

1. **Un registro por factura.** Al emitir (o anular) una factura, el software genera un
   *registro de facturación* con sus datos clave: emisor, nº de serie, fecha, tipo,
   desglose de IVA, importe y destinatario.
2. **Huella encadenada (hash chain).** A cada registro se le calcula una **huella
   SHA-256** sobre sus campos **más la huella del registro anterior**. Los registros
   quedan así **encadenados**: si alguien altera o elimina una factura del pasado, las
   huellas posteriores dejan de cuadrar y la manipulación se detecta. El primer registro
   de la serie usa huella anterior vacía.
3. **QR de cotejo.** Cada factura lleva un **código QR** con una URL a la AEAT y la
   leyenda «VERI\*FACTU». Quien la recibe puede escanearlo y comprobar que está declarada.
4. **Dos formas de cumplir:**
   - **Veri\*Factu** — el software **remite cada registro en tiempo real** al web service
     de la AEAT, autenticándose con **certificado (TLS mutuo)**. Si remites, la firma XML
     no es obligatoria.
   - **No Veri\*Factu** — no remites en tiempo real, pero **conservas** los registros y los
     **firmas con XAdES** para garantizar su integridad, a disposición de la AEAT.
5. **Inalterabilidad, trazabilidad y conservación** son los principios que el sistema debe
   garantizar de extremo a extremo.

Esta librería implementa **cada uno de esos pasos** (huella y encadenamiento, QR, XML,
remisión por TLS mutuo o firma XAdES) y añade un **verificador** que comprueba que un
registro o una serie cumplirían **antes** de enviarlos.

## ¿Qué resuelve?

El reglamento VeriFactu (RD 1007/2023 + Orden HAC/1177/2024) obliga a que el
software de facturación genere, por cada factura, un **registro encadenado por
huella SHA-256**, con **código QR** de cotejo y leyenda. Esta librería:

- **Construye** los registros de alta/anulación y los serializa al **XML oficial**
  (validado contra los XSD de la AEAT).
- **Calcula la huella canónica** y **encadena** la serie (inalterabilidad).
- **Genera el QR** de cotejo (URL AEAT + imagen SVG/PNG) y la leyenda.
- **Verifica el cumplimiento** (`lint`): NIF con dígito de control, desglose de
  IVA, coherencia de importes, destinatarios, rectificativas y cadena de huellas.
- **Envía** al web service por TLS mutuo (registro único, **lotes** ≤1000 y
  **series** que se trocean solas) y **consulta** los registros remitidos.
- **Firma** con XAdES para el modo No Veri\*Factu.

A diferencia de los MCP/SaaS existentes, es una **librería embebible**, en
TypeScript, **independiente** y con **verificador de cumplimiento**.

## Instalación

```bash
npm i @inoguerols/verifactu        # publicada en npm (latest: 1.0.0)
npm i github:inoguerols/verifactu  # o directamente desde GitHub
```

Node ≥ 18. ESM.

## Uso (librería)

```ts
import {
  computeHuellaAlta, qrSvg, lint, validarNif,
  xmlRegistroAlta, xmlLote,
  enviar, enviarSerie, consultar,
  firmarRegistro,
} from '@inoguerols/verifactu'
import { readFileSync } from 'node:fs'

const cabecera = { NombreRazon: 'CLINICA DEMO SL', NIF: 'B00000000' }

// 1) Huella encadenada (la huella del registro anterior entra; '' en el 1º)
const huella = computeHuellaAlta({
  IDEmisorFactura: 'B00000000',
  NumSerieFactura: 'A/100',
  FechaExpedicionFactura: '10-06-2026', // dd-mm-yyyy
  TipoFactura: 'F1',
  CuotaTotal: '21.00',
  ImporteTotal: '121.00',
  huellaAnterior: '',
  FechaHoraHusoGenRegistro: '2026-06-10T12:00:00+02:00', // ISO 8601 con huso
})

// 2) Registro de alta completo
const alta = {
  IDVersion: '1.0',
  IDFactura: { IDEmisorFactura: 'B00000000', NumSerieFactura: 'A/100', FechaExpedicionFactura: '10-06-2026' },
  NombreRazonEmisor: 'CLINICA DEMO SL',
  TipoFactura: 'F1',
  DescripcionOperacion: 'Consulta',
  Destinatarios: [{ NombreRazon: 'Cliente SL', NIF: '12345678Z' }], // F1 lo exige; F2 no
  Desglose: [{
    ClaveRegimen: '01', CalificacionOperacion: 'S1', TipoImpositivo: '21',
    BaseImponibleOimporteNoSujeto: '100.00', CuotaRepercutida: '21.00',
  }],
  CuotaTotal: '21.00',
  ImporteTotal: '121.00',
  Encadenamiento: { PrimerRegistro: 'S' },
  SistemaInformatico: {
    NombreRazon: 'CLINICA DEMO SL', NIF: 'B00000000', NombreSistemaInformatico: 'mi-erp',
    IdSistemaInformatico: '01', Version: '1.0', NumeroInstalacion: '0001',
    TipoUsoPosibleSoloVerifactu: 'S', TipoUsoPosibleMultiOT: 'N', IndicadorMultiplesOT: 'N',
  },
  FechaHoraHusoGenRegistro: '2026-06-10T12:00:00+02:00',
  TipoHuella: '01',
  Huella: huella,
} as const

// 3) Verificar el cumplimiento ANTES de enviar
const informe = lint([alta]) // { ok, errores, avisos, incidencias[] }
if (!informe.ok) throw new Error('no cumple: ' + JSON.stringify(informe.incidencias))

// 4) QR de cotejo (SVG) + validación de NIF
const svg = await qrSvg({ nif: 'B00000000', numserie: 'A/100', fecha: '10-06-2026', importe: '121.00' })
validarNif('B00000000') // true (dígito de control DNI/NIE/CIF)

// 5a) Modo Veri*Factu: serializar y remitir por TLS mutuo
const xml = xmlRegistroAlta(alta, cabecera)
const resp = await enviar(xml, {
  entorno: 'pruebas', // 'produccion' para envío real
  credencial: { pfx: readFileSync('cert.p12'), passphrase: '...' }, // o { cert, key } PEM
})
// resp = { httpStatus, estadoEnvio, csv, lineas[], raw }

// Lote (≤1000) o serie grande (se trocea sola en envíos de 1000):
const xmlMuchos = xmlLote(cabecera, [{ alta }])
const respuestas = await enviarSerie(cabecera, [{ alta } /*, ...miles... */], { entorno: 'pruebas', credencial: { pfx: readFileSync('cert.p12') } })

// 5b) Modo No Veri*Factu: firmar el registro con XAdES y conservarlo
const xmlFirmado = await firmarRegistro(xml, { cert: readFileSync('cert.pem'), key: readFileSync('key.pem') })

// 6) Consultar registros remitidos
const r = await consultar(cabecera, { ejercicio: '2026', periodo: '06' }, { entorno: 'pruebas', credencial: { pfx: readFileSync('cert.p12') } })
```

### Atajos de alto nivel

Para no encadenar huellas ni sellar la hora a mano, usa `crearAlta` y `SerieManager`
(persiste la última huella y **encadena solo**, sellando `FechaHoraHusoGenRegistro = ahora`,
lo que evita el error AEAT 2004):

```ts
import { SerieManager, FicheroStore } from '@inoguerols/verifactu'

const serie = new SerieManager({ serie: 'A', store: new FicheroStore('.verifactu.json') })
const registro = await serie.anadirAlta({
  IDEmisorFactura: 'B00000000', NumSerieFactura: 'A/100',
  NombreRazonEmisor: 'CLINICA DEMO SL', DescripcionOperacion: 'Consulta',
  Destinatarios: [{ NombreRazon: 'Cliente SL', NIF: '12345678Z' }],
  Desglose: [{ CalificacionOperacion: 'S1', TipoImpositivo: '21', BaseImponibleOimporteNoSujeto: '100.00', CuotaRepercutida: '21.00' }],
  CuotaTotal: '21.00', ImporteTotal: '121.00', SistemaInformatico,
})
// registro ya viene encadenado, con la hora actual y la Huella calculada.
```

> **Servidor MCP:** el paquete incluye el binario **`verifactu-mcp`** (servidor MCP por
> stdio) que expone la huella, el `lint`, el QR, la validación de NIF y la generación de
> XML como herramientas para Claude y otros clientes MCP. Alta en Claude Code:
> `claude mcp add verifactu -- npx -y --package=@inoguerols/verifactu verifactu-mcp`
> (Claude Desktop: `command` `npx`, `args` `["-y","--package=@inoguerols/verifactu","verifactu-mcp"]`).

## CLI

```bash
# Verificar el cumplimiento de una serie (exit 0 OK / 1 NO CUMPLE)
verifactu lint examples/serie-valida.json

# Remitir al web service AEAT (TLS mutuo). El JSON admite:
#   { cabecera, alta } | { cabecera, anulacion } | { cabecera, registros:[ {alta}|{anulacion}, ... ] }
# Lotes >1000 se trocean automáticamente. Sin --prod va a preproducción.
verifactu enviar examples/envio-alta.json      --pfx cert.p12 --passphrase secreto
verifactu enviar examples/envio-lote.json      --cert cert.pem --key key.pem --prod
verifactu enviar examples/envio-anulacion.json --pfx cert.p12 --dry-run   # imprime el SOAP, no envía

# Firmar un registro con XAdES (modo No Veri*Factu) — requiere PEM
verifactu firmar examples/envio-alta.json --cert cert.pem --key key.pem

# Consultar registros remitidos
verifactu consultar examples/consulta.json --pfx cert.p12 --passphrase secreto
```

Ejemplos en [`examples/`](./examples). Si falta la `Huella` en el JSON, el CLI la
calcula a partir del encadenamiento.

## Cómo probar contra la AEAT (preproducción)

El **entorno de pruebas externas** no exige apoderamiento, así que vale un
**certificado FNMT de persona física** (o de representante de la entidad).

1. **Exporta el certificado a `.p12` con su clave privada.** En macOS: *Acceso a
   Llaveros → Mis certificados →* tu certificado *→ Exportar… → formato `.p12`* y
   ponle contraseña. (Para `firmar`/`--cert`/`--key` conviértelo a PEM con
   `openssl pkcs12 -in cert.p12 -clcerts -nokeys -out cert.pem` y
   `openssl pkcs12 -in cert.p12 -nocerts -nodes -out key.pem`.)
2. **Prepara el `envio.json`** con **tu NIF real** en `cabecera.NIF` y en
   `alta.IDFactura.IDEmisorFactura` (debe coincidir con el titular del
   certificado). Deja `Huella` vacía (el CLI la calcula).
3. **Envía a preproducción** (sin `--prod`):
   ```bash
   verifactu enviar envio.json --pfx cert.p12 --passphrase 'TU_CONTRASEÑA'
   ```
   Respuesta esperada: `EstadoEnvio: Correcto`/`ParcialmenteCorrecto` y un **CSV**.

Dos detalles que la AEAT valida en preproducción (son de datos, no de la librería):

- **NIF del destinatario**: debe existir en el censo de la AEAT (error `1239`). En
  facturas F1 usa el NIF real del cliente; las **F2 simplificadas no llevan
  destinatario**.
- **`FechaHoraHusoGenRegistro`**: debe ser la **hora actual** de la AEAT
  (±240 s; error `2004`). Séllala con `new Date().toISOString()` al emitir.

## Cumplimiento: qué comprueba `lint`

Formato y presencia de campos · **NIF con dígito de control** (DNI/NIE/CIF) ·
`TipoFactura` válido (F1/F2/F3/R1–R5) · **destinatario obligatorio** salvo F2 o
factura sin identificación · **desglose** (exactamente una de
`CalificacionOperacion` S1/S2/N1/N2 u `OperacionExenta` E1–E8; S1 exige tipo y
cuota) · **coherencia de importes** (suma de cuotas y base+cuota, como aviso) ·
**rectificativas** (R1–R5 exigen `TipoRectificativa` y facturas rectificadas) ·
**integridad de la cadena de huellas** (recálculo, detecta `cadena-rota`).
Devuelve `{ ok, errores, avisos, incidencias[] }`; el CLI sale con código 1 si no cumple.

La base técnica (formato canónico, vector oficial de prueba y fuentes AEAT) está
en [`spec/SPEC.md`](./spec/SPEC.md). Playground online:
<https://inoguerols.github.io/verifactu/>.

## Aviso legal

Proyecto **comunitario e independiente**, **no oficial** ni avalado por la AEAT.
Se entrega "tal cual", sin garantías (ver `LICENSE`). Contrasta siempre contra
las especificaciones oficiales y el entorno de pruebas de la AEAT.

El cumplimiento está verificado a nivel de formato/huella/QR/XSD **y** end-to-end
contra el **entorno de pruebas** de la AEAT. Para el **envío real en producción**
de una sociedad necesitarás un **certificado de representante** o apoderamiento.
Fechas de obligatoriedad (RD-ley 15/2025): sociedades **1-ene-2027**, resto de
obligados **1-jul-2027**.

## Licencia

[MIT](./LICENSE) © 2026 Ignacio Noguerol
