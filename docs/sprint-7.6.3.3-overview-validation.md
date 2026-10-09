# Sprint 7.6.3.3 — Validación integral de Member Overview

Fecha: 2026-10-09. Alcance: diff acumulado de 7.6.3.2 y validación final de `GET /api/members/[id]/overview`. Referencias: [diseño](sprint-7.6.3.1-overview-design.md) e [implementación y revisión](sprint-7.6.3.2-overview-implementation.md).

Este sprint no añade funcionalidades ni modifica código productivo, frontend, today, reglas comerciales, Prisma o migraciones. No se realizan commit/push/merge. La guardia contra totales no finitos ya estaba corregida en la revisión de 7.6.3.2 y se valida aquí.

## Método y alcance de la evidencia

Se ejecuta el handler GET de producción, transpilado en VM, junto a auth-server, core operativo, composición compartida, cálculo mensual, resolver DNI y parser legacy reales. Se sustituyen exclusivamente dependencias externas y reloj: sesión, frontera Prisma, Storage y red. Las peticiones usan Request/Response reales, pero no atraviesan un servidor Next HTTP, proxy ni un despliegue.

Se inspeccionan y capturan los objetos exactos enviados por el handler a Prisma. No se ejecuta el query engine ni PostgreSQL. El doble de consultas filtra/ordena las filas de prueba según esos argumentos; las pruebas no demuestran planes SQL, aislamiento del servidor ni latencia real.

Se revisaron nombres de variables (sin exponer valores) y referencias a configuración de pruebas en README, docs, scripts, .github y .env.example. Se encontró DATABASE_URL general, pero no una conexión designada como base de pruebas segura ni evidencia que autorizase tratar esa conexión como desechable. No se conectó a ella ni se consultaron/modificaron datos de producción. No se midieron consultas SQL ni latencia PostgreSQL. Los tiempos del runner de tests no son métricas del endpoint.

## Seguridad y autorización

| Caso | Resultado esperado y verificado |
| --- | --- |
| Anónimo | 401 UNAUTHORIZED, sin lecturas de dominio |
| AppUser inexistente | 401, sin acceso al socio |
| AppUser desactivado | 401 aunque JWT declare ADMIN |
| Rol persistido MEMBER | 403 aunque JWT declare ADMIN |
| STAFF persistido con JWT MEMBER | 200 |
| ADMIN persistido con JWT MEMBER | 200; mismo DTO mínimo que STAFF |
| Cambio de rol entre peticiones | Nueva lectura de AppUser y 403 |
| Desactivación/revocación entre peticiones | Nueva lectura y 401 |
| Desaparición de AppUser tras una petición válida | Nueva lectura y 401 |
| ID inválido con usuario autorizado | 400, sin consultas de dominio |
| ID inválido anónimo/rol prohibido | 401/403, no evita autorización |
| Socio inexistente | 404 tras una lectura Member, sin ramas dependientes |
| Fallo de auth/Member/contrato/ventas/documentos/accesos | 500 genérico, sin DTO parcial ni mensaje interno |

requireStaffOrAdmin conserva autoridad persistida por petición y precede a la validación del ID. Se prueban cero, negativos, decimales, notación exponencial, cero inicial, fuera de rango Int, entero inseguro, vacío y texto. Todos los estados controlados 200/400/401/403/404/500 conservan `Cache-Control: private, no-store`.

## DTO y privacidad

MemberOverviewDTO coincide exactamente con las interfaces documentadas en 7.6.3.1 y 7.6.3.2: se compara automáticamente la declaración completa, además del cuerpo JSON de éxito por STAFF/ADMIN. Se conservan los seis bloques identity, operational, contract, consumption, documentation y access, sus propiedades obligatorias, tipos y nullability.

El doble devuelve deliberadamente columnas privadas adicionales para comprobar que el serializer no depende de que Prisma las elimine. La whitelist excluye Member completo, contactos, DNI textual, RFID completo, commercialNotes, referencias legacy, claves/buckets/URLs, firma, tokens, relaciones y datos internos. Los campos mínimos de identidad son PII autorizada, no datos anónimos. Solo se expande el resultado explícito del helper operativo, nunca una fila Prisma.

## Sensibilidad: mutaciones solo en memoria

`scripts/test-member-overview-sensitivity.mjs` introduce 34 mutantes, cada uno en un proceso aislado y en el texto a transpilar, sin escribir fuentes. Cada mutante debe fallar en el test conductual esperado. Se rechazan falsos positivos por SyntaxError, ReferenceError, TypeError o ancla ausente. Se compara el contenido de los archivos antes/después para confirmar que no se alteró.

| Grupo | Mutantes verificados |
| --- | --- |
| Autorización (4) | requireAuth; rol JWT; omitir consulta de autoridad; aceptar desactivado |
| Cache (1) | Sustituir private/no-store por public |
| Privacidad (10) | Spread Member; DNI, RFID, commercialNotes, dos referencias legacy, teléfono y email; spread contractual; serializar objeto de referencia DNI |
| Proyecciones/coste (5) | Select Member ampliado; Product completo; documento completo; intento de descarga Storage; consulta de 100 accesos |
| Contrato (3) | Fecha ascendente; desempate id ascendente; SigningSession como contrato |
| Operativa (3) | Copia local equivalente de la composición; canWithdraw siempre true; vencimiento inclusivo |
| Consumo/periodo (4) | G literal; incluir anulaciones; mes fijo de 30 días; retirar control de no finitos |
| DNI (2) | Ignorar canónico en favor de legacy; Boolean de legacy sin validar |
| Accesos (2) | Desempate inverso; inferir isInside |

Todos los 34 mutantes fueron detectados. También siguen pasando las tres mutaciones pequeñas anteriores de normalización, clamp y mes fijo. La copia de reglas equivalente se detecta mediante observación de llamadas al helper real, aunque produzca temporalmente el mismo resultado. Las mutaciones de Storage usan un doble que registra y rechaza la llamada: no se descarga nada.

Suite integrada en `test:member-overview`, ya incluida en CI, junto a matrices funcionales, pruebas temporales y las 64 comprobaciones del motor. No se elimina ni omite ninguna suite previa.

## Paridad operativa y contrato

Matriz de 32 combinaciones: activo/bloqueado × vencimiento null/anterior/igual/posterior al reloj × contrato ausente/único histórico/límite null/múltiple. Se comparan active, expiresAt, expired, hasContract, canWithdraw y reasons con operational-status, además del límite procedente del mismo contrato.

Se observa una llamada real a getMemberOperationalFacts y composeMemberOperationalStatus por endpoint. Overview comparte un único instante entre vencimiento y periodo. getMemberOperationalFacts no cambia; se compara su declaración con HEAD en la regresión de accesos, permitiendo la nueva función de composición en el módulo.

La selección es MemberContract con signedAt DESC, id DESC y memberId. Se comprueban contratos históricos sin PDF/sesión, contrato único, empate, fecha más reciente frente a id mayor, contrato ajeno y límite null/cero. Una SigningSession PENDING de prueba no se consulta ni sustituye al contrato ausente. No se inventa vigencia contractual ni se consulta configuración actual del club para reemplazar el límite firmado.

canWithdraw sigue siendo elegibilidad básica: el agotamiento del límite mensual no modifica ese booleano. La venta valida de nuevo estado, contrato, vencimiento, producto, cantidades, stock y límites dentro del flujo del motor. No se introduce autorización universal ni cálculo de restante.

## Consumo e integridad

Se ejecutan los helpers compartidos con el motor, sin normalización alternativa: trim/mayúsculas de unidad, sumar solo G. Consulta del mes por memberId, cancelledAt null, inicio inclusivo y fin exclusivo; proyección qty/Product.unit. No se filtra por categoría, Product.active o fecha máxima now. No se truncan las filas necesarias para calcular el periodo.

Casos: mes vacío; ventas activas y anuladas; otro socio; G, ` g `, UD y unidad no reconocida; fracciones, cero, negativos históricos; suma sin redondeo monetario; límite null/cero/número y consumo superior al límite; primer instante del mes, último milisegundo, cambio de mes/año. Se verifica que ventas posteriores al instante de petición pero dentro del mes mantienen el comportamiento existente del filtro, sin añadir una regla temporal nueva.

NaN/+Infinity/-Infinity del total producen 500 genérico privado sin información parcial. El reducer conserva el tratamiento anterior de cantidades históricas y no las sanea. Las nuevas ventas siguen rechazando no finitos y valores <= 0 mediante la validación existente; no se cambia esa política para corregir datos históricos.

## Zona horaria

Se mantiene calendario local del proceso: desde día 1 a las 00:00 hasta día 1 del mes siguiente. Se prueban instantes inmediatamente anterior, igual y posterior a medianoche de cambio de mes y año; febrero bisiesto y meses de cambios DST. No se mutan entradas Date.

`scripts/test-member-overview-timezone.mjs` lanza procesos aislados con TZ=UTC y TZ=Europe/Madrid. Verifica la zona efectiva con Intl y los cortes ISO exactos de octubre de 2026:

| Runtime de prueba | Inicio inclusivo | Fin exclusivo |
| --- | --- | --- |
| UTC | 2026-10-01T00:00:00.000Z | 2026-11-01T00:00:00.000Z |
| Europe/Madrid | 2026-09-30T22:00:00.000Z | 2026-10-31T23:00:00.000Z |

Cada proceso ejecuta tres pruebas de calendario/consumo/fronteras. Esto demuestra comportamiento local bajo ambas configuraciones, no la zona del servidor desplegado. No se accedió a un despliegue. La observación local inicial de Europe/Madrid se recoge en 7.6.3.2. Confirmar zona efectiva de producción sigue pendiente; no se cambia TZ ni política temporal de la aplicación.

## DNI

Matriz de 12 combinaciones: ninguno/frontal/reverso/ambos × canónico/legacy/coexistencia. Se comprueba el origen devuelto internamente por el resolver para impedir que ambos booleanos correctos oculten una prioridad equivocada. También se prueba selección canónica por timestamp/id, exclusión de otro socio y legacy inválido por origen/socio/lado/formato.

Canónico prevalece; legacy validado solo si no hay fila canónica. Referencia canónica rota sigue siendo presencia registrada: no valida bytes ni habilita fallback. Solo dos booleanos públicos; no se infiere verificación, validez legal ni disponibilidad remota. Cero llamadas Storage en todos los casos.

## Accesos

findFirst con memberId y orden createdAt DESC, id DESC, select type/createdAt. Casos sin eventos, IN, OUT, empate y registro de otro socio. Un tipo histórico inesperado sigue siendo string, sin reconvertirlo en OUT. Serialización ISO. No existe campo isInside y la mutación que lo introduce es detectada; tampoco se admiten lecturas de 100 eventos.

## Rendimiento y consistencia temporal

| Lectura lógica | Alcance comprobado |
| --- | --- |
| AppUser | Una por petición autenticada; sin cache de autoridad |
| Member | PK, select mínimo, 404 temprano |
| MemberContract | Una fila, tres escalares, selección determinista |
| Sale/Product | Solo filas del mes y dos datos: qty/unit |
| MemberDocument frontal/reverso | Dos findFirst con metadatos seleccionados por resolver existente |
| AccessLog | Una fila y dos escalares |

Seis lecturas lógicas de dominio más autoridad. El test con 0, 1 y 1000 ventas mantiene siete llamadas a los delegates simulados y cero Storage. No es conteo de sentencias SQL: Prisma puede emitir más de una sentencia para relaciones. Complejidad de suma O(ventas del mes), payload O(1). Sin N+1, historiales completos, documentos completos, contrato completo, llamadas HTTP internas ni consultas de configuración innecesarias.

Promise.all solo reúne cinco ramas independientes después de Member: contrato, ventas, dos lados DNI y último acceso. No hay transacción en overview ni consultas concurrentes dentro de una transacción. Se mantienen los índices existentes; no se proponen optimizaciones o migraciones sin medición. La selección contractual no tiene índice compuesto memberId/signedAt en el schema: su coste real sigue sin medir.

Overview es informativo y eventualmente consistente, no snapshot transaccional. Firma, anulación o acceso pueden cambiar entre lecturas/peticiones. Reutilizar una fila contractual evita divergencias internas evitables; no congela toda la base. Se usa Product.unit actual como el motor. Las ventas siguen validándose en servidor y no consumen overview como autorización; último evento no prueba presencia física.

## Regresiones y resultados

Suite enfocada: 36 tests funcionales, 34 de sensibilidad y 2 procesos de zona; más el script de 64 comprobaciones del motor (73 tests contabilizados por Node). Resultado: todos correctos.

Regresiones adicionales ejecutadas sin base/red: core operativo (16 comprobaciones), acceso real POST y sus dependencias controladas (40), minimización contractual/autorización documental (50), consumo de firma pública (37, con su dependencia de tests de identidad), integridad contractual (89). Todas correctas tras actualizar el test histórico de alcance del core. CI aporta además operational-status/sensibilidad, RFID, documentación, listado, mutaciones e historiales.

Durante la puesta a punto se corrigieron únicamente tests: normalización CRLF de fuentes mutadas, fallo explícito al desaparecer una consulta esperada y comparación del core por declaración en lugar de archivo completo. Un error de ruta del propio test adaptado se corrigió antes de su ejecución satisfactoria. No se interpretaron fallos de sintaxis/harness como mutaciones detectadas ni como fallos productivos.

Validaciones finales solicitadas:

| Comando | Resultado |
| --- | --- |
| npm.cmd run lint | OK; también ejecutado por CI |
| npm.cmd run typecheck | OK; también ejecutado por CI |
| npm.cmd run build | OK; también ejecutado por CI, overview es ruta dinámica |
| npm.cmd run ci | OK, código 0, log local `.sprint-7.6.3.3-ci.log` |
| npx.cmd prisma validate | OK, sin cambios de esquema |
| git diff --check | OK en revisión de alcance; repetido en el cierre documental |
| git status --short / git diff --stat | Inventario completo en la entrega, sin staging/commit |

CI pasó en su primera ejecución completa de este sprint después de la puesta a punto de los tests enfocados. No se omitieron fallos: los errores iniciales del harness y de la comprobación histórica se describen arriba, y las suites afectadas se ejecutaron satisfactoriamente tras corregirlos.

## Cambios y deuda

Cambios de este sprint: ampliar test-member-overview; crear test-member-overview-sensitivity y test-member-overview-timezone; incorporar ambos a package.json/CI; adaptar la comprobación histórica de test-access-operational-status; crear este informe. Diseño/DTO/backend quedan intactos respecto al inicio de 7.6.3.3.

P1/P2: ninguno nuevo identificado; no hay correcciones productivas en este sprint. El P2 previo de serialización no finita está cubierto y sigue corregido.

P3 explícitos: medición PostgreSQL con base de pruebas segura, planes e índices a volumen representativo, concurrencia real, prueba HTTP desplegada y verificación de TZ de despliegue. Sin métricas inventadas ni garantía de snapshot. La diferencia heredada de normalización de today no se cambia y no constituye una nueva regla del overview.
