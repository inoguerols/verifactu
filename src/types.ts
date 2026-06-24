// Modelo del registro de facturación VeriFactu.
// ponytail: nombres de campo según los XSD oficiales AEAT (SuministroLR.xsd /
// SuministroInformacion.xsd). Reconciliar 1:1 con el XSD antes de cerrar fase 1.

/** Entornos del servicio AEAT. */
export type Entorno = 'produccion' | 'pruebas'

/** Tipo de factura (subconjunto). F1 ordinaria, F2 simplificada, R1-R5 rectificativas. */
export type TipoFactura = 'F1' | 'F2' | 'F3' | 'F4' | 'F5' | 'F6' | 'R1' | 'R2' | 'R3' | 'R4' | 'R5'

/** Identificación de una factura (clave del registro y del encadenamiento). */
export interface IDFactura {
  /** NIF del emisor. */
  IDEmisorFactura: string
  /** Serie + número. */
  NumSerieFactura: string
  /** Fecha de expedición, formato dd-mm-yyyy. */
  FechaExpedicionFactura: string
}

/** Una línea del desglose de IVA/cuotas. */
export interface DesgloseItem {
  /** Clave de régimen (p.ej. '01' general). */
  ClaveRegimen?: string
  /** 'S1' sujeta-no exenta, 'S2' inversión sujeto pasivo, 'N1'/'N2' no sujeta. */
  CalificacionOperacion?: string
  /** Causa de exención (p.ej. 'E1'..'E6'); para sanidad art.20 LIVA. */
  OperacionExenta?: string
  TipoImpositivo?: string
  BaseImponibleOimporteNoSujeto?: string
  CuotaRepercutida?: string
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

/** Registro de alta de una factura. */
export interface RegistroAlta {
  IDVersion: string
  IDFactura: IDFactura
  NombreRazonEmisor: string
  TipoFactura: TipoFactura
  DescripcionOperacion: string
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
  Encadenamiento: Encadenamiento
  SistemaInformatico: SistemaInformatico
  FechaHoraHusoGenRegistro: string
  TipoHuella: '01'
  Huella?: string
}
