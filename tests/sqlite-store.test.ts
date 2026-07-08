import { existsSync, rmSync } from 'node:fs'
import { afterEach, expect, test } from 'vitest'
import { SqliteStore } from '../src/sqlite-store.js'

const DB_PATH = '.tmp-sqlite-store.test.db'

afterEach(() => {
  if (existsSync(DB_PATH)) rmSync(DB_PATH)
})

test('SqliteStore persiste y devuelve el último eslabón por serie', () => {
  const store = new SqliteStore(DB_PATH)
  expect(store.ultimo('F')).toBeNull()

  store.guardar('F', {
    IDEmisorFactura: 'B12345678',
    NumSerieFactura: 'F-1',
    FechaExpedicionFactura: '01-01-2024',
    Huella: 'A'.repeat(64),
  })
  expect(store.ultimo('F')).toEqual({
    IDEmisorFactura: 'B12345678',
    NumSerieFactura: 'F-1',
    FechaExpedicionFactura: '01-01-2024',
    Huella: 'A'.repeat(64),
  })

  // Segundo guardar en la misma serie sobrescribe (upsert), no duplica.
  store.guardar('F', {
    IDEmisorFactura: 'B12345678',
    NumSerieFactura: 'F-2',
    FechaExpedicionFactura: '02-01-2024',
    Huella: 'B'.repeat(64),
  })
  expect(store.ultimo('F')?.NumSerieFactura).toBe('F-2')
  store.close()

  // Reabrir el mismo fichero recupera el estado (durabilidad).
  const reopened = new SqliteStore(DB_PATH)
  expect(reopened.ultimo('F')?.NumSerieFactura).toBe('F-2')
  reopened.close()
})
