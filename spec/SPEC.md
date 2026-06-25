# Especificación canónica usada por `verifactu`

Resumen accionable de la spec técnica VeriFactu en que se basa la librería,
consolidado de fuentes oficiales AEAT/BOE y verificado adversarialmente.
`[CONFIRMADO]` = consenso de varias fuentes incl. AEAT. `[VERIFICAR]` = requiere
contrastar el PDF/XSD oficial (ver §4) antes de producción.

## 1. Huella / hash

- Cadena `clave=valor` unida por `&` (sin espacios), **UTF-8**, **SHA-256**,
  salida **hex MAYÚSCULAS** (64). `[CONFIRMADO]`
- **RegistroAlta** — 8 campos en orden:
  `IDEmisorFactura, NumSerieFactura, FechaExpedicionFactura, TipoFactura,
  CuotaTotal, ImporteTotal, Huella, FechaHoraHusoGenRegistro`.
- **RegistroAnulación** — 5 campos:
  `IDEmisorFacturaAnulada, NumSerieFacturaAnulada, FechaExpedicionFacturaAnulada,
  Huella, FechaHoraHusoGenRegistro`.
- Primer registro de la serie: `Huella=` **vacío** (no hay semilla). `[CONFIRMADO]`

### Vector oficial de prueba (verificado, ver tests/huella.test.ts)
```
IDEmisorFactura=89890001K&NumSerieFactura=12345678/G33&FechaExpedicionFactura=01-01-2024&TipoFactura=F1&CuotaTotal=12.35&ImporteTotal=123.45&Huella=&FechaHoraHusoGenRegistro=2024-01-01T19:20:30+01:00
```
→ `3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60`

> Regla de diseño: la huella se construye con los **mismos strings serializados**
> que van al XML (no re-formatear números/fechas), para respetar automáticamente
> cualquier convención de decimales/fecha que exija la AEAT.

## 2. Código QR `[CONFIRMADO]`
- URL cotejo: prod `https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR`
  (**`.gob.es`**, no `.es`), pruebas `https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR`.
- Params en este orden: `nif, numserie, fecha, importe`. **URL-encoded en UTF-8**
  (`/`→`%2F`, espacio→`%20`, `&`→`%26`). `fecha` en **DD-MM-YYYY**; `importe` con
  **punto decimal**.
- QR **ISO/IEC 18004** nivel de corrección **M**, tamaño **30–40 mm**, zona de
  silencio (quiet zone) **2 mm**.
- Leyenda: `VERI*FACTU` (modo Veri*Factu) o
  `Factura verificable en la sede electrónica de la AEAT`.
- Fuente: `DetalleEspecificacTecnCodigoQRfactura.pdf` v0.5.0 (AEAT).

## 3. Modelo de registro
Ver `src/types.ts`. RegistroAlta obligatorios: NIF+nombre emisor, NIF receptor
(salvo simplificada F2/art.6.1.d), num+serie, fecha expedición, TipoFactura
(F1, F2, F3, R1–R5), descripción, ImporteTotal, Desglose, CuotaTotal, Huella,
FechaHoraHusoGenRegistro, SistemaInformatico. Firma XML **NO** obligatoria en
Veri*Factu (autenticación por TLS mutuo); **sí** obligatoria (XAdES) en el modo
No Veri*Factu.

## 4. Confirmado contra fuente AEAT `[CONFIRMADO]` (nivel 1 cerrado)
- **Vector de alta**: la cadena `IDEmisorFactura=89890001K&…&FechaHoraHusoGenRegistro=
  2024-01-01T19:20:30+01:00` produce SHA-256
  `3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60`. Cotejado
  dígito a dígito con el ejemplo oficial → **prueba que el motor es correcto**.
- **RegistroAnulación**: orden de campos confirmado contra la lista oficial de la
  AEAT — `IDEmisorFacturaAnulada, NumSerieFacturaAnulada, FechaExpedicionFacturaAnulada,
  Huella (anterior), FechaHoraHusoGenRegistro`. La AEAT no publica un digest de
  ejemplo, pero el motor ya está probado por el vector de alta → huella correcta
  por construcción. Test de encadenamiento cruzado alta→anulación añadido.
- **Decimales**: la huella se calcula sobre el **literal** del XML; la AEAT ignora
  ceros de cola al cotejar (`123.1` ≡ `123.10`), pero el hash es sobre el string
  tal cual. Decisión de diseño: importes son `string` y se hashean **verbatim**
  (el llamante pasa el mismo valor que serializa en el XML). Test que lo bloquea.
- **`FechaExpedicionFactura` en el XML**: tipo `fecha` del XSD = **`dd-mm-yyyy`**
  (length 10, patrón `\d{2}-\d{2}-\d{4}`). **Coincide** con el formato de la
  huella — no es ISO 8601.
- **QR**: endpoint `.gob.es`, orden `nif,numserie,fecha,importe`, URL-encoded UTF-8
  (`/`→`%2F`, espacio→`%20`, `&`→`%26`), fecha `DD-MM-YYYY`, importe con punto.
  ISO/IEC 18004 nivel M, 30–40 mm, quiet zone 2 mm. (§2)
- **CalificacionOperacion**: `S1` (sujeta no exenta sin ISP), `S2` (con ISP),
  `N1`, `N2` (no sujeta). **OperacionExenta**: `E1`…`E8` (el XSD enumera hasta E8).
  Por cada línea de `DetalleDesglose` va **exactamente uno** de los dos (choice del
  XSD). `DetalleDesglose` máx. **12** líneas.
- **TipoFactura** válidos: `F1, F2, F3, R1, R2, R3, R4, R5` (no existen F4/F5/F6).
  Destinatario obligatorio salvo `F2`/simplificada/art.6.1.d. Rectificativas
  `R1`–`R5`: `TipoRectificativa` `S` (sustitutiva) / `I` (incremental);
  `FacturasRectificadas`; `ImporteRectificacion` obligatorio si `S`.
- **NIF**: la AEAT valida contra **censo**. Localmente solo se comprueba el dígito
  de control DNI/NIE/CIF (`validarNif`); la validez final es **censal**.
- **Límite de envío**: máx. **1000 registros** por envío (puede mezclar alta y
  anulación).
- **Consulta**: operación `ConsultaFactuSistemaFacturacion` (`ConsultaLR.xsd`);
  respuestas paginadas (`IndicadorPaginacion`/`ClavePaginacion`, máx. 10000);
  control de flujo por tiempo de espera (inicial 60 s).
- Fuentes: `DetalleEspecificacTecnCodigoQRfactura.pdf` v0.5.0,
  `Veri-Factu_Descripcion_SWeb.pdf` v1.0.3 (AEAT).

## 5. Aún pendiente de la doc oficial de Validaciones `[VERIFICAR]`
- **Matriz exacta de obligatoriedad condicional por código de error** (qué campos
  son obligatorios/incompatibles según cada caso) contra el documento de
  «Validaciones» de la AEAT.
- Digest oficial de un ejemplo de anulación (no publicado por la AEAT; solo lista
  de campos) — el motor ya está probado por el vector de alta.

Descargar de:
https://www.agenciatributaria.es/AEAT.desarrolladores/Desarrolladores/_menu_/Documentacion/Sistemas_Informaticos_de_Facturacion_y_Sistemas_VERI_FACTU/Sistemas_Informaticos_de_Facturacion_y_Sistemas_VERI_FACTU.html
