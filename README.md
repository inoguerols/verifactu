# verifactu

Librería **TypeScript totalmente libre (MIT)** para integrar y **verificar el
cumplimiento** de **VeriFactu** (AEAT) en cualquier desarrollo. Sin dependencias
de pago ni APIs de terceros: el núcleo es determinista y se ejecuta offline.

> Estado: **v1.0 — completa (ambos modos)**.
> Soporta **Veri\*Factu** (remisión en tiempo real al web service de la AEAT con
> **TLS mutuo** por certificado; la firma XML **no** es obligatoria) y
> **No Veri\*Factu** (registros conservados y **firmados con XAdES**).

## ¿Qué resuelve?

El reglamento VeriFactu (RD 1007/2023 + Orden HAC/1177/2024) obliga a que el
software de facturación genere, por cada factura, un **registro encadenado por
huella SHA-256**, con **código QR** de cotejo y leyenda. Esta librería:

- **Construye** los registros de alta/anulación.
- **Calcula la huella canónica** y **encadena** la serie (inalterabilidad).
- **Genera el QR** (URL de cotejo AEAT + imagen) y la leyenda.
- **Verifica el cumplimiento** (`verifactu lint`): comprueba campos, formato,
  cadena de huellas intacta, QR y leyenda, y emite un informe.

A diferencia de los MCP/SaaS existentes, es una **librería embebible**, en
TypeScript, **independiente** y con **verificador de cumplimiento**.

## Instalación

Desde GitHub (no requiere cuenta de npm; se compila al instalar):

```bash
npm i github:inoguerols/verifactu
```

> Aún no está publicado en el registro de npm. Cuando lo esté: `npm i verifactu`.

## Guía de integración

```ts
import {
  computeHuellaAlta, qrSvg, lint,
  xmlRegistroAlta, xmlLote,
  enviar, firmarRegistro, consultar,
} from 'verifactu'

// 1) Construir un RegistroAlta (strings serializados tal cual van al XML)
const alta = {
  IDEmisorFactura: '89890001K',
  NumSerieFactura: '12345678/G33',
  FechaExpedicionFactura: '01-01-2024', // dd-mm-yyyy
  TipoFactura: 'F1',
  CuotaTotal: '12.35',
  ImporteTotal: '123.45',
  FechaHoraHusoGenRegistro: '2024-01-01T19:20:30+01:00',
  // ...resto de campos del registro (desglose, sistema informático, etc.)
}

// 2) Huella encadenada (la huella del registro anterior entra; '' en el 1º)
const huella = computeHuellaAlta({ ...alta, huellaAnterior: '' })

// 3) QR de cotejo AEAT (SVG) + leyenda
const svg = await qrSvg({
  nif: '89890001K', numserie: '12345678/G33',
  fecha: '01-01-2024', importe: '123.45',
})

// 4) Verificar el cumplimiento antes de enviar
const informe = lint([{ ...alta, Huella: huella }]) // { ok, errores, avisos, incidencias[] }

// 5) Serializar a XML (un registro o un lote)
const xml1 = xmlRegistroAlta({ ...alta, Huella: huella })
const xmlMuchos = xmlLote(cabecera, [{ ...alta, Huella: huella }])

// 6a) Modo Veri*Factu: remisión en tiempo real (TLS mutuo por certificado)
const resp = await enviar(
  { cabecera, alta: { ...alta, Huella: huella } },
  { pfx: fs.readFileSync('cert.p12'), passphrase: '...' }, // o { cert, key } PEM
)

// 6b) Modo No Veri*Factu: firmar el registro con XAdES y conservarlo
const xmlFirmado = await firmarRegistro(xml1, { cert, key })

// 7) Consultar registros remitidos (ConsultaFactuSistemaFacturacion)
const consulta = await consultar({ /* filtros */ }, { pfx, passphrase })
```

## Verificador y envío (CLI)

```bash
# Verificar el cumplimiento de una serie (exit 0 OK / 1 NO CUMPLE)
verifactu lint examples/serie-valida.json

# Remitir al web service AEAT (TLS mutuo). Acepta {cabecera,alta} |
# {cabecera,anulacion} | {cabecera,registros:[...]}; lotes >1000 se trocean.
verifactu enviar examples/envio-alta.json --pfx cert.p12 --passphrase secreto
verifactu enviar examples/envio-lote.json --cert cert.pem --key key.pem --prod
verifactu enviar examples/envio-anulacion.json --pfx cert.p12 --dry-run

# Firmar un registro con XAdES (modo No Veri*Factu)
verifactu firmar examples/envio-alta.json --cert cert.pem --key key.pem

# Consultar registros remitidos
verifactu consultar examples/consulta.json --pfx cert.p12 --passphrase secreto
```

Ejemplos en [`examples/`](./examples): `serie-valida.json`, `envio-alta.json`,
`envio-anulacion.json`, `envio-lote.json`.

La base técnica (formato canónico + vector oficial de prueba) está en
[`spec/SPEC.md`](./spec/SPEC.md).


## Aviso legal

Proyecto **comunitario e independiente**, **no oficial** ni avalado por la AEAT.
No garantiza por sí mismo la aceptación por la Agencia Tributaria: contrasta
siempre contra las especificaciones oficiales y el entorno de pruebas de la AEAT.
Se entrega "tal cual", sin garantías (ver `LICENSE`).

**Límite honesto:** la aceptación real depende de probar contra el **entorno de
pruebas de la AEAT con un certificado FNMT** (validación censal del NIF, TLS
mutuo, respuestas del web service). Hasta hacerlo, el cumplimiento queda
verificado solo a nivel de formato/huella/QR, no end-to-end contra la AEAT.

Fechas de obligatoriedad vigentes (RD-ley 15/2025): sociedades **1-ene-2027**,
resto de obligados **1-jul-2027**.

## Licencia

[MIT](./LICENSE) © 2026 Ignacio Noguerol
