import { expect, test } from 'vitest'
import { validarNif } from '../src/nif.js'

test('DNI: letra de control correcta vs incorrecta', () => {
  expect(validarNif('12345678Z')).toBe(true)
  expect(validarNif('12345678A')).toBe(false)
})

test('NIE: prefijo X/Y/Z con su letra de control', () => {
  expect(validarNif('X1234567L')).toBe(true)
  expect(validarNif('X1234567A')).toBe(false)
})

test('CIF: dígito/letra de control', () => {
  expect(validarNif('B00000000')).toBe(true) // control numérico 0
  expect(validarNif('B12345678')).toBe(false) // el control debería ser 4
})

test('formato inválido → false', () => {
  expect(validarNif('123')).toBe(false)
  expect(validarNif('123456789')).toBe(false) // 9 dígitos sin letra no es DNI/CIF válido
  expect(validarNif('')).toBe(false)
})
