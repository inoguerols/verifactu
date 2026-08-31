import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { crearAlta } from './factura.js'
import type { NuevaAlta } from './factura.js'
import type { Encadenamiento, RegistroAlta } from './types.js'

// Gestión del encadenamiento de series VeriFactu.
// SerieManager automatiza el eslabón previo para que el integrador no tenga
// que rastrear huellas a mano: llama a anadirAlta y recibe el RegistroAlta sellado.

/** Datos del último registro de una serie, necesarios para el siguiente eslabón. */
export interface EslabonPrevio {
  IDEmisorFactura: string
  NumSerieFactura: string
  FechaExpedicionFactura: string
  Huella: string
}

/** Almacén de eslabones (sincrónico o asíncrono). */
export interface SerieStore {
  ultimo(serie: string): Promise<EslabonPrevio | null> | EslabonPrevio | null
  guardar(serie: string, e: EslabonPrevio): Promise<void> | void
}

/** Almacén en memoria (Map). Se pierde al reiniciar el proceso. */
export class MemoriaStore implements SerieStore {
  private readonly map = new Map<string, EslabonPrevio>()

  ultimo(serie: string): EslabonPrevio | null {
    return this.map.get(serie) ?? null
  }

  guardar(serie: string, e: EslabonPrevio): void {
    this.map.set(serie, e)
  }
}

/** Almacén en fichero JSON `{ [serie]: EslabonPrevio }`. Crea el fichero si no existe. */
export class FicheroStore implements SerieStore {
  constructor(private readonly path: string) {}

  private load(): Record<string, EslabonPrevio> {
    try {
      return JSON.parse(readFileSync(this.path, 'utf8')) as Record<string, EslabonPrevio>
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}
      throw error
    }
  }

  ultimo(serie: string): EslabonPrevio | null {
    return this.load()[serie] ?? null
  }

  guardar(serie: string, e: EslabonPrevio): void {
    const data = this.load()
    data[serie] = e
    const tmp = `${this.path}.tmp`
    writeFileSync(tmp, JSON.stringify(data, null, 2))
    renameSync(tmp, this.path)
  }
}

/**
 * Gestiona el encadenamiento de una serie de facturas.
 * Llama a anadirAlta por cada nueva factura: calcula el Encadenamiento
 * automáticamente (PrimerRegistro o RegistroAnterior) y persiste el eslabón.
 */
export class SerieManager {
  private readonly serie: string
  private readonly store: SerieStore
  private cola: Promise<void> = Promise.resolve()

  constructor({ serie, store }: { serie: string; store?: SerieStore }) {
    this.serie = serie
    this.store = store ?? new MemoriaStore()
  }

  async anadirAlta(n: Omit<NuevaAlta, 'Encadenamiento'>): Promise<RegistroAlta> {
    const anterior = this.cola
    let liberar!: () => void
    this.cola = new Promise((resolve) => { liberar = resolve })
    await anterior
    try {
      return await this.anadirAltaInterno(n)
    } finally {
      liberar()
    }
  }

  // ponytail: serializa una instancia. Para varios procesos, el SerieStore debe
  // ofrecer una operación atómica de lectura, cálculo y escritura.
  private async anadirAltaInterno(n: Omit<NuevaAlta, 'Encadenamiento'>): Promise<RegistroAlta> {
    const previo = await this.store.ultimo(this.serie)

    const encadenamiento: Encadenamiento =
      previo === null
        ? { PrimerRegistro: 'S' }
        : { RegistroAnterior: { ...previo } }

    const registro = crearAlta({ ...n, Encadenamiento: encadenamiento })

    await this.store.guardar(this.serie, {
      IDEmisorFactura: registro.IDFactura.IDEmisorFactura,
      NumSerieFactura: registro.IDFactura.NumSerieFactura,
      FechaExpedicionFactura: registro.IDFactura.FechaExpedicionFactura,
      // crearAlta siempre calcula Huella; el cast es seguro
      Huella: registro.Huella as string,
    })

    return registro
  }
}
