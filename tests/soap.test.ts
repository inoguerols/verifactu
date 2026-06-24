import { expect, test } from 'vitest'
import { SOAP_ENDPOINTS, parseRespuesta, soapEnvelope } from '../src/soap.js'

test('soapEnvelope envuelve el RegFactu y quita la declaración XML interna', () => {
  const reg = '<?xml version="1.0" encoding="UTF-8"?><sfLR:RegFactuSistemaFacturacion>X</sfLR:RegFactuSistemaFacturacion>'
  const env = soapEnvelope(reg)
  expect(env).toContain('<soapenv:Body><sfLR:RegFactuSistemaFacturacion>X')
  // Solo debe haber una declaración <?xml ...?> (la del sobre).
  expect(env.match(/<\?xml/g)?.length).toBe(1)
})

test('endpoints: pruebas apunta a prewww1, produccion a www1', () => {
  expect(SOAP_ENDPOINTS.pruebas).toContain('prewww1.aeat.es')
  expect(SOAP_ENDPOINTS.produccion).toContain('www1.agenciatributaria.gob.es')
})

// Respuesta de muestra con la forma de RespuestaSuministro de la AEAT.
const RESP = `<?xml version="1.0"?>
<env:Envelope xmlns:env="http://schemas.xmlsoap.org/soap/envelope/">
 <env:Body>
  <tikR:RespuestaRegFactuSistemaFacturacion xmlns:tikR="x">
   <tikR:CSV>ABC123CSV</tikR:CSV>
   <tikR:EstadoEnvio>ParcialmenteCorrecto</tikR:EstadoEnvio>
   <tikR:RespuestaLinea>
    <tikR:IDFactura><tikR:NumSerieFactura>12345678/G33</tikR:NumSerieFactura></tikR:IDFactura>
    <tikR:EstadoRegistro>Correcto</tikR:EstadoRegistro>
   </tikR:RespuestaLinea>
   <tikR:RespuestaLinea>
    <tikR:IDFactura><tikR:NumSerieFactura>12345679/G33</tikR:NumSerieFactura></tikR:IDFactura>
    <tikR:EstadoRegistro>Incorrecto</tikR:EstadoRegistro>
    <tikR:CodigoErrorRegistro>3002</tikR:CodigoErrorRegistro>
    <tikR:DescripcionErrorRegistro>Error de encadenamiento</tikR:DescripcionErrorRegistro>
   </tikR:RespuestaLinea>
  </tikR:RespuestaRegFactuSistemaFacturacion>
 </env:Body>
</env:Envelope>`

test('parseRespuesta extrae estado, CSV y líneas', () => {
  const r = parseRespuesta(RESP, 200)
  expect(r.httpStatus).toBe(200)
  expect(r.estadoEnvio).toBe('ParcialmenteCorrecto')
  expect(r.csv).toBe('ABC123CSV')
  expect(r.lineas).toHaveLength(2)
  expect(r.lineas[0]).toMatchObject({ numSerieFactura: '12345678/G33', estadoRegistro: 'Correcto' })
  expect(r.lineas[1]).toMatchObject({
    estadoRegistro: 'Incorrecto',
    codigoError: '3002',
    descripcionError: 'Error de encadenamiento',
  })
})
