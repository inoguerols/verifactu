// SerieStore sobre SQLite (opcional). Entry point separado: solo se paga el
// coste de node:sqlite si el consumidor importa '@inoguerols/verifactu/sqlite'.
// ponytail: usa node:sqlite (estable desde Node 22.5); en Node <22 lanza al
// instanciar con un mensaje claro. Bun (bun:sqlite) no está soportado aquí —
// SerieStore es una interfaz de dos métodos, trivial de implementar aparte.
import { createRequire } from 'node:module'
import type { EslabonPrevio, SerieStore } from './serie.js'

const requireNode = createRequire(import.meta.url)

/** Almacén de eslabones en SQLite (WAL, escritura atómica y durable). */
export class SqliteStore implements SerieStore {
  private readonly db: import('node:sqlite').DatabaseSync

  constructor(path: string) {
    let DatabaseSync: typeof import('node:sqlite').DatabaseSync
    try {
      ;({ DatabaseSync } = requireNode('node:sqlite'))
    } catch {
      throw new Error(
        'SqliteStore requiere node:sqlite (Node >=22.5). Usa FicheroStore o MemoriaStore en versiones anteriores.',
      )
    }
    this.db = new DatabaseSync(path)
    this.db.exec(
      'CREATE TABLE IF NOT EXISTS eslabones (serie TEXT PRIMARY KEY, id_emisor TEXT NOT NULL, num_serie TEXT NOT NULL, fecha_expedicion TEXT NOT NULL, huella TEXT NOT NULL)',
    )
  }

  ultimo(serie: string): EslabonPrevio | null {
    const row = this.db
      .prepare('SELECT id_emisor, num_serie, fecha_expedicion, huella FROM eslabones WHERE serie = ?')
      .get(serie) as
      | { id_emisor: string; num_serie: string; fecha_expedicion: string; huella: string }
      | undefined
    if (!row) return null
    return {
      IDEmisorFactura: row.id_emisor,
      NumSerieFactura: row.num_serie,
      FechaExpedicionFactura: row.fecha_expedicion,
      Huella: row.huella,
    }
  }

  guardar(serie: string, e: EslabonPrevio): void {
    this.db
      .prepare(
        'INSERT INTO eslabones (serie, id_emisor, num_serie, fecha_expedicion, huella) VALUES (?, ?, ?, ?, ?) ' +
          'ON CONFLICT(serie) DO UPDATE SET id_emisor = excluded.id_emisor, num_serie = excluded.num_serie, ' +
          'fecha_expedicion = excluded.fecha_expedicion, huella = excluded.huella',
      )
      .run(serie, e.IDEmisorFactura, e.NumSerieFactura, e.FechaExpedicionFactura, e.Huella)
  }

  /** Cierra la conexión. Llamar al terminar el proceso. */
  close(): void {
    this.db.close()
  }
}
