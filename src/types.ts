// Modelo del registro de facturación VeriFactu.
// Nombres y orden de campo según los XSD oficiales AEAT (SuministroLR.xsd /
// SuministroInformacion.xsd, tikeV1.0). Reconciliado 1:1 con el XSD.

/** Entornos del servicio AEAT. */
export type Entorno = 'produccion' | 'pruebas'

/**
 * Tipo de factura (ClaveTipoFacturaType del XSD).
 * F1 ordinaria, F2 simplificada, F3 sustitutiva de simplificadas, R1-R5 rectificativas.
 */
export type TipoFactura = 'F1' | 'F2' | 'F3' | 'R1' | 'R2' | 'R3' | 'R4' | 'R5'

/** Identificación de una factura (clave del registro y del encadenamiento). */
export interface IDFactura {
  /** NIF del emisor. */
  IDEmisorFactura: string
  /** Serie + número. */
  NumSerieFactura: string
  /** Fecha de expedición, formato dd-mm-yyyy. */
  FechaExpedicionFactura: string
}

/** Identificador de contraparte distinto del NIF (extranjeros). */
export interface IDOtro {
  /** Código de país ISO 3166-1 alpha-2 (p.ej. 'FR'). */
  CodigoPais?: string
  /** Tipo de identificador: 02 NIF-IVA, 03 pasaporte, 04 doc. oficial, 05 cert. residencia, 06 otro. */
  IDType: string
  /** El identificador (hasta 20 caracteres). */
  ID: string
}

/** Persona física o jurídica (NombreRazon + NIF nacional o IDOtro extranjero). */
export interface Persona {
  NombreRazon: string
  NIF?: string
  IDOtro?: IDOtro
}

/** Una línea del desglose de IVA/cuotas (DetalleType del XSD). */
export interface DesgloseItem {
  /** '01' IVA, '02' IPSI/IGIC… (ImpuestoType). Por defecto IVA si se omite. */
  Impuesto?: string
  /** Clave de régimen (p.ej. '01' general). */
  ClaveRegimen?: string
  /** 'S1' sujeta-no exenta sin ISP, 'S2' con inversión del sujeto pasivo, 'N1'/'N2' no sujeta. */
  CalificacionOperacion?: string
  /** Causa de exención: 'E1'..'E8'. Excluyente con CalificacionOperacion. */
  OperacionExenta?: string
  TipoImpositivo?: string
  BaseImponibleOimporteNoSujeto?: string
  CuotaRepercutida?: string
  TipoRecargoEquivalencia?: string
  CuotaRecargoEquivalencia?: string
}

/** Encadenamiento: o es el primer registro, o referencia al anterior. */
export type Encadenamiento =
  | { PrimerRegistro: 'S' }
  | { RegistroAnterior: IDFactura & { Huella: string } }

/** Datos del sistema informático productor (declaración). */
export interface SistemaInformatico {
  NombreRazon: string
  NIF: string
  NombreSistemaInformatico: string
  /** Id del sistema informático (máx 2 caracteres). */
  IdSistemaInformatico: string
  Version: string
  NumeroInstalacion: string
  /** ¿El sistema solo puede operar como VeriFactu? 'S'|'N'. */
  TipoUsoPosibleSoloVerifactu: 'S' | 'N'
  /** ¿Permite multi-obligado tributario? 'S'|'N'. */
  TipoUsoPosibleMultiOT: 'S' | 'N'
  /** ¿Se está usando para varios obligados? 'S'|'N'. */
  IndicadorMultiplesOT: 'S' | 'N'
}

/** Cabecera del envío: obligado a la emisión (ObligadoEmision). */
export interface Cabecera {
  NombreRazon: string
  NIF: string
}

/** Desglose de base/cuota sustituida en rectificativas por sustitución. */
export interface ImporteRectificacion {
  BaseRectificada: string
  CuotaRectificada: string
  CuotaRecargoRectificado?: string
}

/** Registro de alta de una factura. */
export interface RegistroAlta {
  IDVersion: string
  IDFactura: IDFactura
  /** Referencia externa libre del emisor (máx 60). */
  RefExterna?: string
  NombreRazonEmisor: string
  TipoFactura: TipoFactura
  /** 'S' sustitutiva / 'I' incremental — obligatorio en rectificativas R1-R5. */
  TipoRectificativa?: 'S' | 'I'
  /** Facturas rectificadas (R1-R5). */
  FacturasRectificadas?: IDFactura[]
  /** Facturas sustituidas (F3). */
  FacturasSustituidas?: IDFactura[]
  /** Base/cuota rectificada en rectificativas por sustitución. */
  ImporteRectificacion?: ImporteRectificacion
  /** Fecha de la operación si difiere de la de expedición (dd-mm-yyyy). */
  FechaOperacion?: string
  DescripcionOperacion: string
  /** 'S' si es F1 acogida al art. 7.2/7.3 (cualificada como simplificada). */
  FacturaSimplificadaArt7273?: 'S' | 'N'
  /** 'S' si es factura completa sin identificación del destinatario (art. 6.1.d). */
  FacturaSinIdentifDestinatarioArt61d?: 'S' | 'N'
  /** Destinatarios (contraparte). Obligatorio salvo simplificada/sin identificación. */
  Destinatarios?: Persona[]
  Desglose: DesgloseItem[]
  /** Suma de cuotas. */
  CuotaTotal: string
  /** Importe total de la factura. */
  ImporteTotal: string
  Encadenamiento: Encadenamiento
  SistemaInformatico: SistemaInformatico
  /** Fecha-hora con huso de generación del registro (ISO 8601 con offset). */
  FechaHoraHusoGenRegistro: string
  /** Tipo de huella: '01' = SHA-256. */
  TipoHuella: '01'
  /** Huella resultante (hex). Se calcula con computeHuella. */
  Huella?: string
}

/** Registro de anulación de una factura emitida por error material. */
export interface RegistroAnulacion {
  IDVersion: string
  IDFactura: IDFactura
  RefExterna?: string
  Encadenamiento: Encadenamiento
  SistemaInformatico: SistemaInformatico
  FechaHoraHusoGenRegistro: string
  TipoHuella: '01'
  Huella?: string
}
