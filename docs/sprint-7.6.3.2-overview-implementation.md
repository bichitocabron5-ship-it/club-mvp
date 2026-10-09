# Sprint 7.6.3.2 — Implementación backend de Member Overview

Fecha: 2026-10-08. Referencia: [diseño 7.6.3.1](sprint-7.6.3.1-overview-design.md), leído íntegramente antes de implementar. No se cambian decisiones del diseño y por ello no se modifica ese documento. El archivo de diseño ya estaba sin seguimiento al iniciar este sprint.

## Endpoint y alcance

Implementado `GET /api/members/[id]/overview` en `app/api/members/[id]/overview/route.ts`. Lectura informativa, sin mutaciones, frontend, Prisma, migraciones, commit, push ni merge. No sustituye las validaciones transaccionales de venta/acceso.

## DTO final

`MemberOverviewDTO` está definido en `lib/dtos/member-overview.ts` y reproduce exactamente la interfaz del diseño. No hay envelope `member` ni campos opcionales. Respuesta JSON directa:

```ts
export interface MemberOverviewDTO {
  identity: {
    id: number;
    memberNumber: string | null;
    fullName: string;
    joinedAt: string;
  };
  operational: {
    active: boolean;
    expiresAt: string | null;
    expired: boolean;
    hasContract: boolean;
    canWithdraw: boolean;
    reasons: {
      inactive: boolean;
      noContract: boolean;
      expired: boolean;
    };
    hasRfid: boolean;
  };
  contract: {
    id: number;
    signedAt: string;
  } | null;
  consumption: {
    monthlyGrams: number;
    monthlyLimitG: number | null;
    periodStart: string;
    periodEndExclusive: string;
  };
  documentation: {
    hasDniFront: boolean;
    hasDniBack: boolean;
  };
  access: {
    lastEvent: {
      type: string;
      createdAt: string;
    } | null;
  };
}
```

Fechas ISO mediante toISOString. Sin foto, restante, código RFID, DNI textual, datos de contacto, commercialNotes, información económica, URLs, claves/buckets, firma ni tokens. Los campos de identidad mínimos sí son datos personales y se protegen mediante autorización y no-store.

## Autorización y respuestas

requireStaffOrAdmin ejecuta el control existente, que relee AppUser activo y rol persistido por petición. No se modifica auth-server ni se toma la autoridad del JWT. Autorización precede a validación de id y a cualquier lectura de dominio.

| HTTP | Condición | Cuerpo |
| --- | --- | --- |
| 200 | Socio existente y actor STAFF/ADMIN activo | MemberOverviewDTO |
| 400 | Id no entero positivo canónico o fuera de PostgreSQL Int | `{ error: "ID de socio inválido" }` |
| 401 | Sin sesión, usuario desaparecido/inactivo o identidad de sesión inválida | Error del helper, UNAUTHORIZED |
| 403 | Rol persistido no admitido | Error del helper, FORBIDDEN |
| 404 | No existe Member | `{ error: "Socio no encontrado" }` |
| 500 | Excepción de lectura o composición | `{ error: "Error interno" }` |

Todas estas respuestas incluyen `Cache-Control: private, no-store`. El 500 genérico sigue el diseño: no expone errores internos ni convierte fallo de consulta en ausencia de documento/contrato/consumo. No hay logging de valores privados. Next.js instalado no cachea GET por defecto; no se añade cache ni force-static.

## Reglas compartidas y decisiones

### Operativa y contrato

getMemberOperationalFacts permanece intacto. Se extrae la composición existente de operational-status a composeMemberOperationalStatus en el mismo módulo: expired, hasContract, canWithdraw y reasons. Ambos endpoints usan esa función. El DTO público previo de operational-status conserva sus campos y semántica, incluidos los datos comerciales consumidos por TPV.

canWithdraw sigue siendo active && !expired && hasContract; los controles adicionales del motor se mantienen. expiresAt null no vence y la igualdad exacta con now tampoco; la comparación sigue siendo estricta `<`. RFID usa Boolean(rfidCode), incluso si el valor es una cadena de espacios. La asignación no valida evidencia RFID presentada.

Se consulta MemberContract una sola vez, con signedAt DESC e id DESC, select id/signedAt/consumptionGrams. No había un helper de lectura de contrato reutilizable: se mantiene el patrón de selección existente en operational-status y motor, sin crear una abstracción adicional. La misma fila alimenta facts, contract y monthlyLimitG. Ninguna consulta SigningSession, plantilla o ClubSetting. Un contrato histórico no necesita sesión/PDF; una sesión pendiente no satisface hasContract. null en límite se conserva, al igual que cero si existe históricamente.

### Consumo

getMonthRange y getMonthlyGramTotal se mueven del motor a `lib/sales-rules.ts`; tanto sales-engine como overview los importan. El rango admite now explícito, lo clona y conserva los mismos setters de calendario local. El motor sigue invocándolo sin argumentos en su punto original; no se adelanta su reloj operativo ni se cambia su transacción.

La suma conserva `normalizeUnit(product.unit) === "G"`, que usa trim/mayúsculas. Se filtra Sale por memberId, cancelledAt null y createdAt >= inicio / < fin. Solo se proyectan qty y product.unit. No se cargan registros completos, importes ni productos completos. No se añade filtro por categoría, producto activo o now, ni se redondea como moneda. Se incluyen todas las ventas del periodo necesarias para el total, sin truncarlo. Se conserva la unidad actual de Product, como hace el motor.

No se usa SUM con unit literal G porque perdería la normalización existente. El coste es O(ventas del mes); se mantiene la agregación canónica en memoria con la proyección mínima acordada. `/today` permanece sin cambios: su comparación literal de G ya difería del motor y su convergencia necesita un bloque separado. No se introduce una tercera normalización.

### Documentos y acceso

resolveMemberDni se reutiliza una vez por lado. MemberDocument más reciente por createdAt/id prevalece; solo sin fila canónica se usa parseLegacyDniRef. Se mantienen los metadatos mínimos que ya selecciona el resolver, pero ninguno llega al JSON. No se llama a memberDniUrls, lector de bytes ni servicios de Storage. Fila canónica rota sigue indicando presencia registrada y no habilita fallback legacy. Los booleanos no certifican identidad, validez, integridad ni disponibilidad remota.

AccessLog.findFirst obtiene solo type/createdAt, con orden createdAt DESC e id DESC. No se leen los 100 accesos ni se infiere presencia física. type es string conforme al modelo; no se convierte un tipo inesperado a OUT. Ausencia real produce lastEvent null.

## Consultas y rendimiento

| Paso | Consulta / proyección | Dependencia |
| --- | --- | --- |
| 1 | AppUser mediante requireStaffOrAdmin | Sesión verificada |
| 2 | Member por PK: id, memberNumber, fullName, joinedAt, active, expiresAt, rfidCode, dniFrontUrl, dniBackUrl | Autorización e id válido |
| 3a | MemberContract.findFirst: id, signedAt, consumptionGrams | Member existente |
| 3b | Sale del mes: qty y relación Product.unit | Member y periodo |
| 3c/3d | MemberDocument.findFirst para cada lado, a través de resolveMemberDni | Member y referencias internas legacy |
| 3e | AccessLog.findFirst: type, createdAt | Member existente |

Seis lecturas lógicas de dominio más una de autoridad, además del coste propio de sesión. Cinco ramas independientes en Promise.all después del Member/404. No se abre transacción ni se paralelizan operaciones dentro de una; no hay consulta por fila, llamadas HTTP a endpoints propios ni red a Storage. El número de sentencias SQL de las relaciones depende de Prisma y no se confunde con este conteo lógico. La respuesta es constante en tamaño y no necesita paginación.

Sin nuevos índices: se mantienen los índices documentados de Sale/AccessLog/MemberDocument. La selección de MemberContract no dispone del compuesto memberId/signedAt en el schema. Medir planes y volúmenes reales en 7.6.3.3 antes de plantear una migración. No se afirma un SLA.

## Consistencia y zona horaria

Un now por overview compartido por vencimiento y rango mensual. Las consultas independientes dan una lectura informativa eventualmente consistente, no un snapshot transaccional. La selección contractual única evita discrepancias internas entre contrato, límite y hechos operativos. Peticiones separadas pueden ver cambios de datos o de reloj; el TPV debe seguir autorizando en el motor al ejecutar la venta.

La comprobación local con Node el 2026-10-08 devolvió `Intl.DateTimeFormat().resolvedOptions().timeZone = "Europe/Madrid"`, variable TZ no definida y offset GMT+0200. Esa es la zona efectiva del runtime de validación; no prueba la configuración del servidor desplegado, al que no se ha accedido.

La regla permanece local del runtime: desde el día 1 a las 00:00 hasta el día 1 siguiente, fin exclusivo. Para octubre de 2026 en este runtime Madrid, los límites ISO son 2026-09-30T22:00:00.000Z y 2026-10-31T23:00:00.000Z (cambio DST). Un servidor UTC produciría 2026-10-01T00:00:00.000Z y 2026-11-01T00:00:00.000Z; cerca del cambio de mes incluso podría elegir un mes distinto al calendario de Madrid. Se devuelven los límites efectivos en el DTO; no se fija zona nueva ni se realiza migración temporal. Verificar el despliegue antes de etiquetar su periodo como Madrid.

## Pruebas

Añadido `scripts/test-member-overview.mjs`: inicialmente 24 tests Node, ampliados a 28 en revisión pre-commit, que ejecutan el handler y helpers de producción con Prisma/sesión simulados. Se ejecutan auth-server, core, composición, cálculo, resolveMemberDni y parseStorageUrl reales; cualquier llamada a Supabase/Storage o fetch está prohibida por el harness. Las pruebas no sustituyen PostgreSQL ni validación de planes SQL.

Cobertura: autorización STAFF/ADMIN, JWT discordante, desactivación y cambio de rol entre peticiones; DTO exacto común sin datos extra incluso si el mock retorna columnas privadas; select mínimo, conteo lógico y ausencia de Storage; desempate contractual y contrato histórico, null sin contrato; matriz de paridad con operational-status, vencimiento exacto, límites null/cero y RFID Boolean; gramos normalizados, anulaciones, ventas de otro socio y fronteras del mes; DNI canónico roto y legacy válido/inválido por socio/lado; último acceso con empate y tipo inesperado; 400/401/403/404/500 y no-store en todas las ramas probadas.

Se añade `npm run test:member-overview` a CI, con los tests de overview y el script existente test-sales-operational-status (64 comprobaciones del motor SINGLE/BULK, contrato, límites y operativa). Se adaptan los dos tests de sensibilidad de canWithdraw existentes para mutar su nueva ubicación compartida; no se reduce su cobertura ni se inicia la batería exhaustiva de sensibilidad de overview prevista para 7.6.3.3. El inventario cerrado de rutas de test-member-document-core se amplía únicamente con overview; conserva sus comprobaciones de modelos y exposición documental.

La primera ejecución enfocada conjunta pasó: 54 tests Node (incluye el script de 64 comprobaciones como un test), cero fallos. La primera CI se detuvo en el inventario de rutas de test-member-document-core por no incluir la nueva ruta; se corrigió esa expectativa explícita, sin cambiar comprobaciones productivas. Sus nueve comprobaciones pasaron después de la corrección. La segunda ejecución completa de CI terminó con código 0, incluidos lint, tipos y build. El build identifica overview como ruta dinámica.

| Validación solicitada | Resultado |
| --- | --- |
| npm.cmd run lint | OK |
| npm.cmd run typecheck | OK |
| npm.cmd run build | OK |
| npm.cmd run ci | OK tras actualizar inventario de rutas |
| npx.cmd prisma validate | OK, sin modificar schema |
| git diff --check | OK en revisión; se repite tras cerrar este documento |
| git status --short / git diff --stat | Alcance revisado; salida final en la entrega |

Archivos productivos: nueva ruta overview y DTO; modificación de operational-status, member-operational-status, sales-rules y sales-engine para compartir reglas. Configuración: package.json incorpora la suite a CI. Pruebas: nuevo test-member-overview y adaptación de test-operational-status-hardening, test-operational-status-sensitivity y test-member-document-core. Documentación: solo se crea este informe en el sprint 7.6.3.2. El diseño 7.6.3.1 permanece sin seguimiento como al inicio, sin editarlo.

## Riesgos y seguimiento

- P1: ninguno abierto identificado tras las pruebas enfocadas de permisos, privacidad y reglas compartidas. No se usa el DTO como autorización universal.
- P2 bloqueante: ninguno identificado. La diferencia heredada de today, la consistencia eventual y el uso de unidad actual se conservan de forma explícita conforme al diseño; no se corrigen incidentalmente.
- P3 / seguimiento 7.6.3.3: medir SQL/latencia con datos representativos y revisar necesidad de índice contractual; verificar zona efectiva del despliegue y fronteras DST en ese entorno; ampliar sensibilidad y pruebas concurrentes. La zona local observada no se presenta como evidencia de producción.

Sin frontend ni cambios de reglas de negocio. Diseño 7.6.3.1 sin modificaciones; decisiones de foto/restante/PII confirmadas por la petición de implementación.

## Revisión pre-commit 7.6.3.2

Inventario completo del diff revisado, incluidos nuevos archivos. DTO idéntico al diseño; ninguna prueba previa eliminada. Las dos funciones extraídas conservan normalización, suma, periodo local, punto de invocación y comportamiento en el motor. getMemberOperationalFacts permanece intacto y la composición compartida reproduce la anterior del endpoint. Transacción Serializable, orden de locks, idempotencia, filtros de anulaciones y validaciones de venta no se modifican. No se toca today.

P2 reproducido y corregido: un total mensual NaN o infinito se serializaba como monthlyGrams null con HTTP 200, incumpliendo el DTO no nullable. La reproducción usa el handler real y datos simulados en la frontera Prisma; no se afirma que existan esos datos en producción. Ahora overview comprueba Number.isFinite sobre el resultado canónico y devuelve el mismo 500 genérico/no-store. No convierte a cero, no limita negativos y no cambia el helper ni las restricciones de ventas.

Cuatro tests adicionales: cantidades históricas fraccionarias/cero/negativas/no finitas y unidades no reconocidas; error 500 del DTO ante total no finito; calendario local en febrero bisiesto, meses de cambios DST y cambio de año; sensibilidad mínima que detecta tres mutaciones en memoria (comparación literal G, clamp de negativos y mes de 30 días). La suma histórica conserva su semántica sin saneamiento; las nuevas ventas siguen rechazando cantidades no finitas o no positivas en la validación existente. Las pruebas de calendario usan la zona del proceso y no acreditan por sí solas la zona desplegada.

Resultado enfocado de revisión: 28 tests de overview y 64 comprobaciones del motor, todos correctos (29 tests para Node al contar el script del motor como uno). Sin P1 ni P2 pendientes identificados. P3: planes SQL/latencia y concurrencia real de PostgreSQL no se simulan; persisten las limitaciones informativas y de zona de despliegue ya documentadas. Cambios durante esta revisión limitados a la guardia de serialización del endpoint, tests de regresión/sensibilidad y este informe.

Cierre de revisión el 2026-10-09: lint, typecheck, build, CI completa y prisma validate correctos; todos con código 0. CI de revisión registrada en `.sprint-7.6.3.2-precommit-ci.log` (log local). Comprobaciones finales de diff y estado en la entrega. No se ha realizado commit, push ni merge.
