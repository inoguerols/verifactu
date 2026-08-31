# Changelog

## [1.5.1](https://github.com/inoguerols/verifactu/compare/verifactu-v1.5.0...verifactu-v1.5.1) (2026-08-31)


### Bug Fixes

* corregir integridad y serialización VeriFactu ([3533013](https://github.com/inoguerols/verifactu/commit/353301374ec5d76be8713c50a1d5835b4e8c3aa4))
* corregir validación y serialización Verifactu ([6b3800b](https://github.com/inoguerols/verifactu/commit/6b3800be4d19da362196734530f8fb6680d53909))

## [1.5.0](https://github.com/inoguerols/verifactu/compare/verifactu-v1.4.0...verifactu-v1.5.0) (2026-08-31)


### Features

* mejorar validación y consulta de registros VeriFactu ([b89d9f9](https://github.com/inoguerols/verifactu/commit/b89d9f9cf53922e13dab0297072df70c56dbdd45))


### Bug Fixes

* extraer EstadoRegistro, CodigoErrorRegistro y DescripcionErrorRegistro de objeto contenedor en consultas AEAT ([a8e26be](https://github.com/inoguerols/verifactu/commit/a8e26bec667f2607ef1b592d84e9d4af5da4453c))

## [1.4.0](https://github.com/inoguerols/verifactu/compare/verifactu-v1.3.0...verifactu-v1.4.0) (2026-07-15)


### Features

* SqliteStore opcional para SerieStore (issue [#2](https://github.com/inoguerols/verifactu/issues/2)) ([8432e32](https://github.com/inoguerols/verifactu/commit/8432e3285d5b5599121b4445b430dceda7904829))


### Bug Fixes

* **ci:** pin npm a la rama 11.x en publish.yml ([b4d6d0f](https://github.com/inoguerols/verifactu/commit/b4d6d0fccac6ecce6adca97af6ac284a77d36925))
* corregir parseo de respuesta de consulta y namespace SOAP ([#4](https://github.com/inoguerols/verifactu/issues/4)) ([099b750](https://github.com/inoguerols/verifactu/commit/099b750adc53d5e5acef3150b9433a6ceffbdb04))
* **pkg:** bin verifactu = dist/cli.js (npm rechazaba el ./) ([e010408](https://github.com/inoguerols/verifactu/commit/e010408a22fe161f920468b40e8cf6d357798c62))
