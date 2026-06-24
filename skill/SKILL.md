---
name: verifactu
description: Use when integrating Spanish VeriFactu (AEAT) invoicing compliance into a codebase, or when verifying that billing records/invoices meet the VeriFactu regulation (huella/hash chaining, QR, leyenda, registro de alta/anulación). Wraps the `verifactu` TypeScript library and its compliance linter.
---

# VeriFactu

Guía la integración y **verificación de cumplimiento** de VeriFactu usando la
librería open source `verifactu`.

## Cuándo usarla
- El usuario quiere que su software emita facturas conformes a VeriFactu.
- El usuario quiere **comprobar** si sus registros/facturas cumplen.

## Qué es VeriFactu (resumen operativo)
- Cada factura → un **registro de alta** generado a la vez que se expide.
- Los registros se **encadenan por huella SHA-256** (la huella anterior entra en
  el cálculo de la siguiente) → inalterabilidad.
- La factura lleva **QR de cotejo AEAT** + **leyenda** "VERI*FACTU".
- Dos modalidades: **VERI*FACTU** (envío inmediato a AEAT, sin firma por
  registro) y **no VERI*FACTU** (local, con **firma XAdES**).
- Obligación vigente: sociedades 1-ene-2027, resto 1-jul-2027 (RD-ley 15/2025).

## Flujo de integración
1. `npm i verifactu`.
2. Localiza dónde el código **expide** facturas (numeración de serie + importe).
3. En ese punto: construir `RegistroAlta`, calcular huella encadenada (usar la
   huella del último registro de la serie), persistirla, y renderizar el QR +
   leyenda en la factura/PDF.
4. Operaciones exentas de IVA (p.ej. sanidad, art. 20 LIVA) → desglose como
   **operación exenta**, no como cuota.
5. Incluir la **declaración responsable** del sistema (ver `examples/`).

## Verificar cumplimiento
Ejecuta el linter sobre los registros/serie:

```bash
npx verifactu lint <archivo>
```

Devuelve un informe con: campos obligatorios presentes, formato de fecha/importe,
**cadena de huellas intacta**, QR correcto, leyenda y modalidad. Explica cada
fallo y cómo corregirlo.

## No hagas
- No inventes el formato de la huella: usa `computeHuella` de la librería, que
  sigue el formato canónico AEAT contrastado con los vectores oficiales.
- No envíes a producción de la AEAT sin pasar antes por el entorno de pruebas.
