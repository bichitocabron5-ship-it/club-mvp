# Sprint 7.6.3.1 — Auditoría y diseño del overview del socio

Fecha: 2026-10-08. Proyecto: club-mvp. Estado: propuesta pendiente de revisión.

Alcance: diseño de `GET /api/members/[id]/overview`. Este sprint crea únicamente este documento; no implementa endpoint, componentes, helpers, cambios Prisma ni migraciones. No ejecuta CI ni realiza commit/push/merge. Las decisiones y extracciones descritas abajo son trabajo futuro.

## 1. Evidencia y fuentes reales

Fuentes inspeccionadas: `prisma/schema.prisma`, `lib/member-operational-status.ts`, `lib/sales-engine.ts`, `lib/sales-rules.ts`, `lib/club-settings.ts`, `lib/member-dni.ts`, `lib/member-document-reader.ts`, `lib/auth-server.ts`, `lib/access.ts`, rutas citadas a continuación y `app/members/[id]/page.tsx`. Consultada la guía instalada `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`: GET no se cachea por defecto; aun así la respuesta privada debe declarar explícitamente no-store. No se consultaron datos personales de la base de datos ni se midieron tiempos en producción.

En la tabla, las rutas abreviadas parten de `/api/members/[id]`. Costes estimados de operaciones lógicas, no latencias ni garantía del número de sentencias SQL emitidas por Prisma. La autorización tiene su propia lectura de AppUser.

| Dato | Modelo y campos reales | Helper / endpoint actual | Regla y autorización actual | Coste y reutilización propuesta |
| --- | --- | --- | --- | --- |
| Identidad | Member.id, memberNumber, fullName, joinedAt, photoUrl | `/identity`, `/registration`, `/history`; member-identity normaliza DNI, no construye cabecera | STAFF/ADMIN. memberNumber nullable; no sustituir el valor persistido por id | Una lectura Member por PK compartida. Select mínimo; no reutilizar respuesta completa de history |
| Activo | Member.active | getMemberOperationalFacts; `/operational-status`; PATCH `/status` | Lectura STAFF/ADMIN; cambio de estado ADMIN. Activo no equivale a no vencido | Incluido en la misma lectura Member; reutilizar facts |
| Vencimiento | Member.expiresAt | getMemberOperationalFacts; `/operational-status`; PATCH `/api/members/[id]` | Lectura STAFF/ADMIN; expired usa comparación estricta con now, null no vence | Sin consulta adicional; serializar Date a ISO |
| Operativo | Member + MemberContract | getMemberOperationalFacts; `/operational-status`; sales-engine y access/toggle consumen facts | STAFF/ADMIN en operational-status. No hay estado operativo persistido | Member y un contrato; composición pura compartible |
| Contrato | MemberContract.id, signedAt, consumptionGrams | `/contracts`; selección en operational-status, today y sales-engine | STAFF/ADMIN para listado. Último signedAt DESC, id DESC | findFirst, una fila; no descargar PDF ni listar históricos |
| Consumo mensual | Sale.qty, createdAt, cancelledAt + Product.unit | `/today`; funciones privadas getMonthRange/getMonthlyGramTotal en sales-engine | today usa requireAuth; motor aplica reglas en transacción. Solo ventas no anuladas del mes y gramos | Una lectura acotada al mes, O(ventas del mes); extraer funciones del motor, no llamar HTTP a today |
| RFID | Member.rfidCode | getMemberOperationalFacts; `/registration`, `/history`; PATCH `/rfid` | STAFF/ADMIN; Boolean(rfidCode) expresa asignación, no validación de evidencia presentada | Campo interno en la lectura Member; devolver solo hasRfid |
| DNI frontal/reverso | MemberDocument y Member.dniFrontUrl/dniBackUrl legacy | resolveMemberDni / parseLegacyDniRef; `/documents?side=front|back`, `/member-documents`, `/history` | STAFF/ADMIN. Canónico más reciente por lado prevalece; legacy solo en ausencia de canónico | Dos findFirst y parseo local; cero descargas Storage para presencia |
| Último acceso | AccessLog.memberId, type, createdAt, id | `/access-logs`; `lib/access.ts`; `/api/access/toggle` | access-logs usa requireAuth; toggle STAFF/ADMIN. Tipo almacenado String, escritores IN/OUT | Un findFirst por socio con desempate id; no reutilizar lista de 100 ni getCurrentInsideMembers |

El consumidor actual carga history, contracts, access-logs y operational-status por separado. Overview será una lectura inicial para la futura cabecera/resumen; no sustituirá las lecturas de detalle ni la autorización de mutaciones.

## 2. Identidad mínima

Incluir id, memberNumber y fullName para identificar al socio y navegar a sus secciones. Incluir joinedAt como fecha de alta del resumen (ya visible en la ficha). active y expiresAt se ubican exclusivamente en operational para no duplicarlos.

Evaluación de photoUrl: Member.photoUrl guarda una referencia; history usa resolveStorageUrlForResponse y POST photo genera URL firmada. No debe copiarse el valor persistido al DTO. Para esta propuesta mínima se omite photoUrl: evita referencias/URLs Storage y dependencia de firma remota. La cabecera puede usar iniciales. Si 7.6.4 requiere foto, deberá acordarse su entrega protegida por separado; no existe aquí una nueva ruta GET de foto implementada ni se presupone su existencia.

No incluir DNI textual, teléfono, email, dirección, fecha/lugar de nacimiento, datos comerciales, createdAt, displayNumber duplicado ni RFID completo. La UI puede representar `memberNumber ?? String(id)` sin otro campo del servidor. joinedAt es alta registrada, no fecha de primera firma.

## 3. Core operativo 7.3

`getMemberOperationalFacts(member, currentContract, now)` en `lib/member-operational-status.ts` es el core puro reutilizable:

- active: Member.active.
- expiresAt: Member.expiresAt.
- expired: expiresAt distinto de null y `expiresAt.getTime() < now.getTime()`. Igualdad exacta no está vencida. No redondear al día ni inferir una fecha de vencimiento.
- hasContract: contrato seleccionado distinto de null.
- currentContractId y monthlyLimitG: id y consumptionGrams del mismo contrato.
- hasRfid: Boolean(member.rfidCode), sin normalización adicional.

Actualmente canWithdraw y reasons NO están dentro del helper. El endpoint operational-status compone `facts.active && !facts.expired && facts.hasContract` y `{ inactive: !facts.active, noContract: !facts.hasContract, expired: facts.expired }`.

Para no duplicar lógica, 7.6.3.2 debe extraer esa composición exacta a una función compartida y hacer que operational-status y overview la usen, preservando el contrato actual. No invocar el handler HTTP desde otro handler. No reconstruir una política distinta en el frontend. Mantener los campos expired/hasContract y reasons pedidos, aunque los motivos reflejen hechos ya presentes; no añadir un segundo status textual.

canWithdraw es elegibilidad básica, no permiso universal para vender ni autorización final de acceso. El motor vuelve a verificar estado, contrato y vencimiento, límites diarios G/UD, límite mensual, producto activo, unidades y stock, entre otras condiciones. RFID presentado se comprueba en el flujo de acceso. Los cambios posteriores a esta lectura se validan en las mutaciones.

## 4. Contrato canónico

La fuente es MemberContract. Selección de referencia: `where: { memberId }`, `orderBy: [{ signedAt: "desc" }, { id: "desc" }]`, `findFirst`. Coincide con operational-status, today, contracts y sales-engine. En access/toggle basta existencia y se usa findFirst sin orden; no copiar esa selección para el límite del overview.

Todos los MemberContract existentes se tratan como firmados, incluidos históricos sin signingSessionId, plantilla, snapshot o signedPdfUrl: así lo declara y protege PATCH `/api/contracts/[id]`, que devuelve SIGNED_CONTRACT_IMMUTABLE. No exigir PDF, sesión o plantilla activa para reconocer un contrato histórico. Existencia no acredita validez jurídica ni integridad de sus archivos.

SigningSession es el proceso de firma, con status PENDING/SIGNED/CANCELLED, createdAt, expiresAt y signedAt nullable. Su expiresAt caduca la sesión, no el contrato ni la membresía. Una sesión pendiente no es un MemberContract ni satisface hasContract. La ruta `/api/signing-sessions/[token]` crea MemberContract durante la finalización; obtiene consumptionGrams de getPersistedMonthlyLimitG. La configuración actual del club no sustituye el límite ya firmado.

Fechas disponibles: MemberContract.signedAt (no nullable); no hay expiresAt ni createdAt contractual en ese modelo. Fechas de sesión y captura del snapshot pertenecen a otras entidades. El overview solo necesita signedAt. Los contratos anteriores siguen siendo históricos; no inventar estados ACTIVE/EXPIRED/REVOKED ni interpretar «de referencia» como estado persistido.

contract será null sin fila; con fila llevará id y signedAt. El límite irá exclusivamente en consumption. No exponer signatureImage, signedPdfUrl, documento snapshot, token, PII contractual o plantilla completa.

## 5. Consumo, límite y periodo

El motor contiene getMonthRange y getMonthlyGramTotal, privados de `lib/sales-engine.ts`; no existe hoy un servicio mensual exportado que reúna consulta y cálculo. `/today` tiene otro cálculo local.

Regla efectiva del motor: sumar Sale.qty donde memberId coincide, cancelledAt es null y createdAt está en `[monthStart, monthEnd)`, contando únicamente ventas cuyo `normalizeUnit(product.unit) === "G"`. normalizeUnit aplica trim y mayúsculas y reconoce G/UD. Se usa la unidad actual de Product; Sale no tiene snapshot de esa unidad. No filtrar categoría, Product.active, SaleOperation.status ni añadir una fecha máxima now: no forman parte de ese cálculo.

`/today` compara `product.unit === "G"` sin normalizar. Para datos `"g"` o espacios diverge del motor. La propuesta adopta la regla del motor que autoriza ventas, documenta esa diferencia y requiere compartir su implementación, no un tercer cálculo. La convergencia de today debe acordarse expresamente; no cambiar su comportamiento incidentalmente.

Periodo: primer día del mes a las 00:00 locales del proceso, fin exclusivo primer día del mes siguiente. Se construye con Date.setHours/setDate/setMonth. No hay zona IANA explícita en estas reglas; la búsqueda en lib/app y .env.example no encontró Europe/Madrid, timeZone ni TZ que establezca ese periodo. La zona del ordenador del auditor no demuestra la zona del despliegue. Mantener semántica local del servidor y devolver los límites ISO calculados; no cambiar silenciosamente a UTC/Madrid ni a 30 días móviles. Una futura extracción recibirá un único now por petición y conservará esos setters locales.

monthlyLimitG es consumptionGrams del mismo MemberContract seleccionado. null significa ausencia de límite numérico contractual (o ausencia de contrato, distinguible mediante operational.hasContract); no significa cero ni se debe mostrar «ilimitado». El motor omite esa comparación mensual con null pero conserva el resto de controles. No aplicar DEFAULT_CLUB_SETTINGS ni el límite actual del club como fallback.

Cantidad restante puede derivarse de límite menos consumo cuando hay límite, pero no existe helper canónico de restante. Se omite del DTO mínimo para evitar redundancia y decisiones nuevas sobre clamp a cero, negativos o redondeo. Antes de mostrarla en 7.6.4 habrá que decidir su representación; nunca sería autorización de venta. monthlyGrams conserva la suma numérica sin redondeo monetario. No devolver importes, beneficios, totalSpent o descuentos.

## 6. RFID y documentación

hasRfid se ubica en operational; indica asignación únicamente. El código completo sigue en registration/history y en el flujo específico de gestión/lectura RFID que lo requiera. No exponerlo por conveniencia en overview.

Por cada lado, resolveMemberDni busca MemberDocument tipo ID_FRONT o ID_BACK con orden createdAt DESC, id DESC. Si encuentra una fila, la devuelve sin verificar archivo remoto. Solo si no existe fila analiza la referencia legacy con parseLegacyDniRef, restringiendo origen, buckets y patrones al socio/lado correspondiente. Una referencia legacy inválida equivale a ausencia para ese resolver. No basta Boolean(dniFrontUrl).

Una fila canónica con referencia rota sigue siendo presencia registrada en overview. La lectura de contenido puede fallar con DOCUMENT_UNAVAILABLE/503; nunca retrocede a legacy cuando falla el canónico. Si no se resuelve documento, el contenido devuelve 404; Storage deshabilitado devuelve 503. No transformar fallos de base de datos en hasDni=false.

Presente significa fila canónica o referencia legacy aceptada por el resolver. Verificación técnica de bytes ocurre en readVerifiedMemberDocument: descarga, tamaño, MIME soportado y SHA-256; no es validación de identidad ni validez legal. MemberDocument no contiene verifiedAt, verifiedBy, validUntil ni estado de verificación. No añadirlos ni inferirlos. Overview no descarga, firma URLs ni comprueba existencia remota.

Reutilizar resolveMemberDni dos veces con Promise.all y convertir a booleanos. No usar memberDniUrls para serializar URLs innecesarias; no cargar listMemberDocuments completo. Sus storageBucket, storageKey, sha256 y demás metadatos quedan internos, nunca se expanden en el DTO.

## 7. Último acceso

AccessLog tiene id, memberId, type String y createdAt DateTime. Obtener una sola fila con `findFirst`, filtro memberId, orden `[{ createdAt: "desc" }, { id: "desc" }]`, select type/createdAt. id solo desempata; no hace falta exponerlo.

`/access-logs` obtiene hasta 100 registros ordenados solo por createdAt. `getCurrentInsideMembers` lee muchos socios y clasifica por último IN, también sin desempate id. Ninguno es un helper adecuado para este resumen.

Los escritores usan IN y OUT, pero Prisma no impone enum. El DTO conserva type como string (sin inventar UNKNOWN ni convertir otros valores a OUT). La UI mostrará Entrada/Salida para los valores conocidos y una etiqueta neutral de evento para un valor distinto. lastEvent null solo cuando no existe ningún registro; errores de consulta no equivalen a ausencia. No incluir isInside/presencia física ni deducirla del último evento; una salida también puede proceder del flujo de auto-checkout.

## 8. DTO exacto propuesto

Contrato JSON de éxito directo, sin envolver Member ni copiar modelos completos. Todas las propiedades son obligatorias; nullable solo donde se declara. Fechas string en ISO 8601 con instante, serializadas con toISOString. Interfaz únicamente documental:

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

| Campo | Fuente | Tipo / nullability | Justificación y consumidor previsto en 7.6.4 |
| --- | --- | --- | --- |
| identity.id | Member.id | number no null | Enlaces de ficha y secciones |
| identity.memberNumber | Member.memberNumber | string o null | Número visible de cabecera; fallback visual a id |
| identity.fullName | Member.fullName | string no null | Nombre e iniciales de cabecera |
| identity.joinedAt | Member.joinedAt | ISO string no null | Fecha de alta en resumen |
| operational.active | facts.active | boolean no null | Indicador de activo/inactivo, independiente del vencimiento |
| operational.expiresAt | facts.expiresAt | ISO string o null | Fecha de vencimiento registrada; null sin fecha |
| operational.expired | facts.expired | boolean no null | Aviso operativo sin recalcular en cliente |
| operational.hasContract | facts.hasContract | boolean no null | Indicador contractual de elegibilidad |
| operational.canWithdraw | Composición existente de operational-status | boolean no null | Indicador básico informativo, no habilitación final de venta |
| operational.reasons.inactive | !facts.active | boolean no null | Motivo de impedimento en resumen operativo |
| operational.reasons.noContract | !facts.hasContract | boolean no null | Motivo de impedimento en resumen operativo |
| operational.reasons.expired | facts.expired | boolean no null | Motivo de impedimento en resumen operativo |
| operational.hasRfid | facts.hasRfid | boolean no null | Indicador de chapita asignada |
| contract | MemberContract de referencia | objeto o null | Tarjeta de contrato; null solo si no hay contrato |
| contract.id | MemberContract.id | number no null dentro del objeto | Identificar contrato de referencia en sección contractual |
| contract.signedAt | MemberContract.signedAt | ISO string no null dentro del objeto | Fecha de firma del resumen |
| consumption.monthlyGrams | Suma del motor sobre Sale.qty/Product.unit | number no null, cero sin ventas computables | Métrica mensual en gramos |
| consumption.monthlyLimitG | facts.monthlyLimitG | number o null | Límite firmado; no duplicarlo en contract |
| consumption.periodStart | Inicio del mes de la regla del motor | ISO string no null | Identificar corte del resumen |
| consumption.periodEndExclusive | Fin del mes de la misma regla | ISO string no null | Explicitar fin exclusivo del periodo |
| documentation.hasDniFront | Boolean(resolveMemberDni(front)) | boolean no null | Presencia registrada de frontal |
| documentation.hasDniBack | Boolean(resolveMemberDni(back)) | boolean no null | Presencia registrada de reverso |
| access.lastEvent | AccessLog seleccionado | objeto o null | Mostrar un evento o «sin accesos registrados» |
| access.lastEvent.type | AccessLog.type | string no null dentro del objeto | Etiqueta del evento; IN/OUT conocidos |
| access.lastEvent.createdAt | AccessLog.createdAt | ISO string no null dentro del objeto | Fecha/hora del último evento |

Bloques identity, operational, consumption, documentation y access nunca son null. No se publican currentContractId duplicado, status contractual, displayNumber, restante, contadores históricos ni colecciones. La redundancia limitada de hasContract con contract y de reasons con hechos se conserva para cumplir la semántica operativa solicitada; ambos deben proceder de la misma lectura, nunca de consultas separadas.

## 9. Autorización, privacidad y errores

Rol mínimo STAFF, también ADMIN: usar requireStaffOrAdmin antes de consultar al socio. El helper valida identidad de sesión y relee AppUser activo/rol en base de datos en cada petición; no confiar solo en rol del token. Usuario sin sesión o desactivado: 401; rol no autorizado: 403. No se necesita ninguna columna ADMIN-only para el DTO común.

Validar id con patrón entero positivo canónico, Number.isSafeInteger y máximo PostgreSQL Int 2_147_483_647, como identity/history/registration. 400 para id inválido, 404 para socio inexistente, 500 genérico ante fallo de lectura/composición. Cabecera `Cache-Control: private, no-store` en éxito y errores controlados, incluidos 401/403/400/404/500. Sin caches compartidas de autoridad ni de PII.

Select explícito del Member: id, memberNumber, fullName, joinedAt, active, expiresAt, rfidCode, dniFrontUrl y dniBackUrl. Los tres últimos son entradas internas para facts/resolver y se excluyen del JSON. No seleccionar dni, phone, email, photoUrl, commercialProfile, discountPercent o commercialNotes. Contrato: id, signedAt, consumptionGrams. No spreads del Member/contrato/documento. No registrar códigos RFID, referencias o PII en errores.

Los permisos amplios de today/access-logs no se heredan. Los errores no se degradan a datos falsos ni a canWithdraw=true. No añadir resultados parciales ni nuevos estados «unknown» sin un contrato específico. Los detalles permanecen en endpoints separados con sus permisos existentes.

## 10. Rendimiento y consistencia

Plan mínimo: autorización (una lectura AppUser más el coste propio de sesión), validación id, lectura Member por PK y 404 temprano. Después Promise.all de contrato de referencia, ventas del mes, dos resoluciones DNI y último acceso. Son seis operaciones lógicas de datos de dominio más una de autoridad: Member + contrato + ventas + frontal + reverso + acceso. El SQL real puede variar por carga de relaciones de Prisma.

Dependencias: facts y su composición esperan Member/contrato; límite e indicador contractual usan exactamente esa misma fila. Parseo legacy necesita Member; consumo numérico necesita ventas y periodo; construcción final espera todas las ramas. Capturar un now por petición y compartirlo entre vencimiento y periodo. No cinco llamadas HTTP a endpoints ni repetición de requireAuth por sección.

Select mensual mínimo qty y product.unit, con filtro memberId/cancelledAt/rango. Coste O(n) en ventas del mes, payload final O(1). No todos los históricos ni Producto completo. No proponer SUM con filtro literal unit=G que cambie normalizeUnit. Mantener consulta con relación proyectada, sin bucle de consultas por producto. Dos consultas de DNI son constantes, no N+1; no reutilizar este diseño por cada socio de un listado.

Índices reales: Member PK; Member.memberNumber/dni/rfidCode únicos. Sale tiene (memberId, createdAt), (productId, createdAt), saleOperationId y createdAt. AccessLog tiene (memberId, createdAt) y createdAt; el desempate id no está incluido en el compuesto. MemberDocument tiene (memberId, createdAt), sin type/id en ese índice. MemberContract no tiene índice por memberId/signedAt en el schema: tiene signingSessionId único y documentSnapshotId indexado, además de PK. PostgreSQL no crea automáticamente un índice del lado referenciante de cada FK. ClubSetting tiene PK, pero no hace falta leerlo aquí.

No se afirma latencia ni se propone migración: medir plan/volumen de MemberContract, ventas y documentos antes de justificar índices nuevos. No cache, materialización, límite truncado de ventas ni optimización especulativa. La respuesta singular no necesita paginación; los historiales/documentos completos siguen en sus secciones. El cálculo debe incluir todas las ventas del periodo, aunque luego se decida optimizar su agregación.

Promise.all no proporciona una instantánea transaccional: puede coincidir con firma, anulación, alta documental o acceso. Propuesta inicial: lectura informativa con consistencia eventual, sin bloquear ventas; misma fila contractual reutilizada evita incoherencias evitables entre bloques. Si se exige snapshot de base de datos habrá que aprobar explícitamente aislamiento y coste. Ningún snapshot vuelve válido el overview para autorizar una mutación posterior.

## 11. Riesgos antes de implementar

| Prioridad | Riesgo observado | Tratamiento / criterio de cierre |
| --- | --- | --- |
| P1 | Duplicar composición operativa o interpretar canWithdraw como permiso universal | Extraer composición exacta y demostrar paridad con operational-status; ventas conservan todas sus validaciones |
| P1 | Mostrar consumo distinto al aplicado por ventas | Compartir funciones del motor, probar normalización y anulación; no copiar cálculo literal de today |
| P1 | Fuga de PII, referencias o códigos por spreads o reutilización de history/contracts | Allowlist de select/DTO y pruebas de claves ausentes para STAFF y ADMIN |
| P1 | Usar sesión pendiente como contrato o aplicar límite actual del club a firma histórica | Un MemberContract de referencia determinista; sin SigningSession ni ClubSetting para overview |
| P1 | Cambiar corte mensual con una zona horaria asumida | Mantener local del runtime y límites ISO; verificar configuración del despliegue antes de dar etiqueta de zona |
| P2 | Presentar DNI registrado como verificado o accesible | Booleanos de resolución únicamente; archivo canónico roto no cae a legacy |
| P2 | Empates de acceso/contrato/documento o valores de type ajenos a IN/OUT | Orden con id y representación neutral de type, sin inferir presencia |
| P2 | Contratos sin índice útil y meses con muchas ventas | Medir número de consultas/volumen y plan; no prometer tiempos sin datos |
| P2 | Lecturas concurrentes y cambios de Product.unit alteran resumen | Documentar consistencia eventual y unidad actual, como el motor; no inventar snapshot histórico |
| P2 | Cabecera necesita foto pero overview mínimo la omite | Revisar consumidor 7.6.4; entrega protegida separada si se requiere |

## 12. Decisiones pendientes de revisión

1. Ratificar omisión de foto y restante, inclusión de joinedAt y ubicación única del límite en consumption.
2. Ratificar extracción de composición operativa y funciones mensuales en 7.6.3.2 sin cambios de reglas; decidir si convergencia de today queda en otro bloque. El diseño recomienda mantenerla fuera de la implementación mínima.
3. Confirmar zona efectiva del despliegue. Una política explícita Europe/Madrid sería cambio de negocio separado, no parte de este diseño.
4. Ratificar lectura informativa eventualmente consistente y type string fiel al modelo; no añadir estados inventados para anomalías.
5. Fijar datos representativos y presupuesto de latencia para 7.6.3.3 con medición real; no declarar ahora un SLA ni exigir un índice sin evidencia.

Estas decisiones no impiden documentar una propuesta exacta, pero deben revisarse antes de implementar sus dependencias. No se ha pedido ni ejecutado su implementación en este sprint.

## 13. Plan de implementación

### 7.6.3.2 — Backend mínimo

Revisar decisiones; extraer composición operativa exacta para compartir con operational-status. Extraer rango mensual y suma del motor a helper reutilizable sin alterar normalización, filtro ni zona; el motor debe seguir consumiéndolo. Añadir GET overview, autorización persistida, validación estricta, selects mínimos, DTO explícito y private/no-store. Resolver ambos DNI con helpers existentes; consultar un acceso; seleccionar un contrato una sola vez. No componentes, nuevas reglas, Prisma ni migraciones por defecto. Mantener contratos actuales de los demás endpoints.

### 7.6.3.3 — Seguridad, consistencia y rendimiento

Pruebas enfocadas futuras: 401/403/usuario desactivado/cambio de rol, id inválido/404/500 y cache headers en todas las ramas; DTO idéntico mínimo STAFF/ADMIN, sin PII extra, tokens, firma, URLs o claves. Matriz active/expiresAt null/igual/anterior/posterior y contrato ausente/presente; paridad con core/composición existente. Contrato histórico sin PDF/sesión, sesión pendiente y empate signedAt. Consumo G/UD/unidades normalizadas, anulaciones, límites null y cero persistido sin reinterpretarlos, fronteras del mes/año y zona/DST del runtime. DNI canónico frente a legacy válido/inválido, ambos lados, empate y canónico remoto roto sin descarga/fallback. Último acceso con cero eventos, IN/OUT, empate y type inesperado.

Medir consultas reales y proyecciones con datos representativos, ausencia de llamadas Storage y consultas por fila; asegurar que solo se lee un acceso y no se cargan históricos completos. Probar errores de cada rama sin falsear ausencia; revisar carreras esperables de firma/anulación. Tests de sensibilidad para detectar duplicación de reglas y regresiones en el motor por la extracción. Ejecutar entonces checks apropiados a los cambios productivos, no en este sprint documental.

### 7.6.4 — Cabecera y resumen visual

Consumir overview para identidad, estado básico, firma, gramos, chapita, presencia de DNI y último evento. Cargar secciones específicas bajo demanda. Mostrar ausencia de límite/fecha sin inferir autorizaciones ni validez, y distinguir error de carga de ausencia real. Actualizar tras mutaciones relevantes y evitar presentar un snapshot antiguo como recién confirmado. Resolver foto/restante solo si se acuerda su alcance. No calcular políticas de elegibilidad en componentes.

## 14. Validación de este sprint

Validación prevista y limitada a `git diff --check` y `git status --short`. El resultado efectivo se informa en la entrega. Único archivo creado por este trabajo: `docs/sprint-7.6.3.1-overview-design.md`. Sin cambios productivos, componentes, Prisma, migraciones, pruebas ejecutadas, commit, push ni merge.
