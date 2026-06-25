// Validación del dígito de control de identificadores fiscales españoles:
// DNI, NIE y CIF (NIF de persona jurídica). La AEAT rechaza identificadores con
// dígito de control incorrecto, así que el verificador de cumplimiento lo comprueba.

const DNI_LETRAS = 'TRWAGMYFPDXBNJZSQVHLCKE'
const CIF_LETRAS = 'JABCDEFGHI'

/** Letra de control del DNI: posición (número mod 23) en la tabla oficial. */
function letraDni(numero: number): string {
  return DNI_LETRAS[numero % 23] as string
}

function validarDni(nif: string): boolean {
  const m = /^(\d{8})([A-Z])$/.exec(nif)
  if (!m) return false
  return letraDni(Number(m[1])) === m[2]
}

function validarNie(nif: string): boolean {
  const m = /^([XYZ])(\d{7})([A-Z])$/.exec(nif)
  if (!m) return false
  const prefijo = { X: '0', Y: '1', Z: '2' }[m[1] as 'X' | 'Y' | 'Z']
  return letraDni(Number(prefijo + m[2])) === m[3]
}

/** CIF: letra org. + 7 dígitos + control (dígito o letra según tipo de org.). */
function validarCif(nif: string): boolean {
  const m = /^([ABCDEFGHJNPQRSUVW])(\d{7})([0-9A-J])$/.exec(nif)
  if (!m) return false
  const tipo = m[1] as string
  const digitos = m[2] as string
  const control = m[3] as string
  let par = 0
  let impar = 0
  for (let i = 0; i < 7; i++) {
    const d = Number(digitos[i])
    if (i % 2 === 0) {
      // posiciones impares (1ª,3ª,5ª,7ª) → duplicar y sumar dígitos
      const x = d * 2
      impar += x < 10 ? x : x - 9
    } else {
      par += d
    }
  }
  const suma = par + impar
  const digitoControl = (10 - (suma % 10)) % 10
  const letraControl = CIF_LETRAS[digitoControl] as string
  // Org. con control numérico (A,B,E,H), con control alfabético (K,P,Q,S) y el
  // resto admiten cualquiera de las dos formas.
  if ('ABEH'.includes(tipo)) return control === String(digitoControl)
  if ('KPQS'.includes(tipo)) return control === letraControl
  return control === String(digitoControl) || control === letraControl
}

/**
 * ¿Es un NIF español válido (DNI, NIE o CIF) con dígito de control correcto?
 * No valida NIF-IVA extranjeros (esos van por IDOtro).
 */
export function validarNif(nif: string): boolean {
  if (!/^[0-9A-Z]{9}$/.test(nif)) return false
  return validarDni(nif) || validarNie(nif) || validarCif(nif)
}
