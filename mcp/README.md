# @inoguerols/verifactu-mcp

Servidor MCP que expone la librería [`@inoguerols/verifactu`](https://www.npmjs.com/package/@inoguerols/verifactu) como tools para Claude y cualquier cliente compatible con el [Model Context Protocol](https://modelcontextprotocol.io/).

MIT — sin APIs de pago, sin telemetría.

## Instalación

```bash
npm install -g @inoguerols/verifactu-mcp
```

O ejecutar directamente con npx (sin instalación):

```bash
npx @inoguerols/verifactu-mcp
```

## Configuración en Claude Desktop

Edita `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) o `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "verifactu": {
      "command": "npx",
      "args": ["-y", "@inoguerols/verifactu-mcp"]
    }
  }
}
```

Si instalaste globalmente:

```json
{
  "mcpServers": {
    "verifactu": {
      "command": "verifactu-mcp"
    }
  }
}
```

## Configuración en Claude Code (CLI)

```bash
claude mcp add verifactu -- npx -y @inoguerols/verifactu-mcp
```

## Tools disponibles

| Tool | Descripción |
|------|-------------|
| `verifactu_huella_alta` | Calcula la huella SHA-256 de un registro de alta (encadenamiento VeriFactu) |
| `verifactu_lint` | Verifica el cumplimiento de una serie de registros de alta: campos, NIF, desglose, encadenamiento e integridad de la cadena de huellas |
| `verifactu_qr` | Genera la URL de cotejo AEAT y, opcionalmente, el SVG del QR |
| `verifactu_validar_nif` | Valida el dígito de control de un NIF español (DNI, NIE, CIF) |
| `verifactu_xml_alta` | Serializa un registro de alta al XML del web service AEAT |

## Licencia

MIT © Ignacio Noguerol (inoguerols)
