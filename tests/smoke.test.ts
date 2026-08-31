import { expect, test } from 'vitest'
import { version } from '../package.json'
import { VERSION } from '../src/index.js'

test('paquete expone versión', () => {
  expect(VERSION).toBe(version)
})
