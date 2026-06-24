# verifactu

Librería **TypeScript totalmente libre (MIT)** para integrar y **verificar el
cumplimiento** de **VeriFactu** (AEAT) en cualquier desarrollo. Sin dependencias
de pago ni APIs de terceros: el núcleo es determinista y se ejecuta offline.

> Estado: **v0.1 (fase 1, en construcción)** — núcleo offline verificable.
> Fase 2 (firma XAdES + envío SOAP al web service AEAT) más adelante.

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

```bash
npm i verifactu
```

## Uso (avance de API)

```ts
import { buildRegistroAlta, computeHuella, chain, qrUrl, lint } from 'verifactu'
// ... la API se documenta al cerrar la fase 1
```

## Verificador (CLI)

```bash
npx verifactu lint registros.json
```

## Aviso legal

Proyecto **comunitario e independiente**, **no oficial** ni avalado por la AEAT.
No garantiza por sí mismo la aceptación por la Agencia Tributaria: contrasta
siempre contra las especificaciones oficiales y el entorno de pruebas de la AEAT.
Se entrega "tal cual", sin garantías (ver `LICENSE`).

Fechas de obligatoriedad vigentes (RD-ley 15/2025): sociedades **1-ene-2027**,
resto de obligados **1-jul-2027**.

## Licencia

[MIT](./LICENSE) © 2026 Ignacio Noguerol
