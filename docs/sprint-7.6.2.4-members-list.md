# Sprint 7.6.2.4 — GET /api/members

## Inventario previo a la implementación

Hallazgo P1: GET usa requireAuth, lee todos los escalares de Member y contratos completos; propaga ...memberData. Anula photoUrl/dniFrontUrl/dniBackUrl, pero expone commercialNotes, datos comerciales, RFID y timestamps. El esquema actual añade hasPhoto, hasContract y expired al DTO implícito.

Inventario obtenido buscando /api/members en todo el código productivo, siguiendo tipos, hooks y componentes:

| Consumidor | Campos y comportamiento |
| --- | --- |
| app/members/page.tsx | id para enlace /members/:id; fullName, memberNumber, dni, phone, active, expiresAt, expired, hasContract; rfidCode solo como booleano para el indicador de chapita. Busca nombre, número y DNI normalizado. Filtros ALL/ACTIVE/EXPIRED/BLOCKED/NO_CONTRACT. Sin paginación ni reordenación local. No usa fotografía ni campos comerciales. |
| Alta rápida en la misma página | POST y posterior GET completo para refrescar listado. Consume del POST id/fullName/dni para confirmar el alta; no necesita campos adicionales del GET. |
| hooks/use-sales-page.ts → hooks/use-sales-member.ts → components/sales/sales-member-search.tsx (app/sales/page.tsx) | fetchJson carga la lista. Usa id/fullName/dni para búsqueda y selección, memberNumber para etiqueta del seleccionado. Busca nombre y DNI; no busca número ni RFID en la lista. Sin paginación ni ordenación local. Sin fotografía ni datos comerciales del GET. |
| TPV: datos operativos y RFID | use-sales-member consulta /:id/operational-status, /today y /recent-sales. Perfil comercial se muestra en sales-member-status; discountPercent del estado operativo alimenta useSalesCart/getSalesCartTotals. RFID se resuelve por /by-rfid/:code, no por el listado. No modificar estos flujos. |
| Alta completa /members/new | Consume POST /api/members y /:id/registration; no consume GET de lista. Contratos/documentos/ficha/accesos utilizan endpoints específicos. |

Tipos anteriores: MemberListItem extiende MemberSummary, un tipo amplio también usado por SigningSessionData. Se conservará este último para no modificar contratos; la lista tendrá un tipo independiente compartido por listado y TPV.

Pruebas existentes: test-member-operational-ui ejecuta GET/core/listado, pero exige el DTO amplio y consulta include; necesita actualizar sus expectativas. test-sales-rfid ejecuta hooks reales con HTTP simulado; test-member-create cubre alta rápida/completa. Las suites de autorización existentes ejercitan requireAuth persistido. Guía local Next 16.2.4 de route handlers revisada: GET no cacheado por defecto; se añadirá igualmente cabecera HTTP explícita.

## Decisión previa

Un solo DTO para STAFF y ADMIN: id, memberNumber, fullName, dni, phone, active, expiresAt, hasRfid, hasContract, expired. Sin información comercial para ningún rol. DNI textual permanece por búsqueda/identificación, sin referencias a imágenes. hasRfid sustituye el valor secreto que solo se usaba como presencia. Select explícito de esos escalares fuente y contrato mínimo id/consumptionGrams para reutilizar el core operativo sin cambiar sus reglas. Orden createdAt desc y contrato signedAt desc/id desc con take 1 conservados.

Los consumidores operativos legítimos son STAFF/ADMIN: aplicar requireStaffOrAdmin, que consulta AppUser en cada petición y sustituye autoridad JWT por rol/active persistidos. No ampliar permisos. 401 para anónimo/inactivo/usuario inexistente; 403 para otro rol. Respuestas GET controladas 200/401/403 con private, no-store; no hay parámetros validados ni recurso individual que produzcan 400/404. Lista vacía sigue siendo 200. Sin cambios globales a errores 500 ni a POST.

## Deuda y límites

La lista completa sigue sin paginación; contiene DNI y teléfono por necesidades reales del listado actual. Una futura búsqueda en servidor podría reducir el volumen de datos, fuera de este sprint. MemberSummary amplio permanece exclusivamente fuera del contrato de esta lista. Las pruebas usan Prisma/HTTP simulados, sin integración con base de datos real ni navegador.

## Implementación y compatibilidad

Aplicada la decisión anterior: diez claves exactas, expiresAt serializado a ISO/null, consulta select explícita y autorización persistida. No se devuelve ni consulta commercialNotes para STAFF o ADMIN. No hay datos comerciales en esta lista: commercialProfile/discountPercent continúan llegando al TPV desde su estado operativo autorizado; cálculos de venta intactos. No se crean endpoints ni dependencias de history/overview. POST, contratos, documentos y esquema Prisma no se modifican.

Listado conserva orden, filtros, tarjetas, indicadores y enlaces. Solo cambia el acceso booleano rfidCode → hasRfid. Los hooks y el selector del TPV usan MemberListItem independiente; SigningSessionData conserva su tipo previo. Alta rápida sigue haciendo POST y recarga GET; alta completa sigue su flujo de registration.

## Pruebas y sensibilidad

- test-members-list-hardening: ejecuta GET y auth-server reales con Prisma/session simulados. Whitelist exacta para ambos roles, select exacto con relación mínima y ordenación, ausencia de todos los secretos y de un futuro campo privado, estados 200/401/403, lista vacía, cache, JWT discrepante, cambio de rol y desactivación entre peticiones.
- test-members-list-sensitivity: catorce mutaciones deben provocar fallos de aserción (no errores de sintaxis): spread memberData, consulta Member completa, commercialNotes, ambas referencias DNI, Storage/foto, timestamp interno, RFID, requireAuth, pérdida de cache, select ampliado, RFID vacío, confusión entre contrato y permiso operativo, y vencimiento inclusivo.
- test-member-operational-ui: GET/core/listado reales; casos de caducidad y contratos, reloj cliente divergente, filtros, RFID booleano, búsqueda por nombre/DNI/número, navegación y recarga tras alta rápida con DTO real.
- test-sales-rfid: fixture de GET reducido a las diez claves; hooks reales, selección manual/RFID, búsqueda, perfil/descuento desde estado operativo, cálculo y transacciones existentes.
- test-member-create: regresión de alta rápida/completa y errores existentes.
- Integración: npm run test:members-list-hardening dentro de npm run ci y paso explícito del workflow GitHub Actions.

## Clasificación de revisión

- P1 original corregido: no hay propagación de Member ni notas comerciales en GET; roles restringidos mediante autoridad persistida.
- P2: no se identificaron bloqueantes nuevos en el alcance revisado. No se afirma una auditoría global de otros endpoints.
- P3/deuda: lista sin paginación y tipo histórico MemberSummary amplio fuera de este endpoint; no se amplía el sprint para resolverlos.

## Validación final

Validación inicial, 2026-10-08: npm.cmd run lint, npm.cmd run typecheck, npm.cmd run build, npm.cmd run ci, npx.cmd prisma validate y git diff --check completados correctamente. CI se repitió con captura explícita de $LASTEXITCODE por un código ambiguo de PowerShell al redirigir stderr; resultado confirmado CI_NATIVE_EXIT=0. La suite inicial terminó con 21 entradas del runner, cero fallos.

git status --short: diez archivos modificados y tres nuevos (este documento y las dos suites nuevas). git diff --stat de archivos rastreados: 10 files changed, 92 insertions(+), 35 deletions(-); los tres nuevos no aparecen en ese comando hasta incorporarlos al índice. No se ha hecho staging, commit, push ni merge.

## Revisión pre-commit

Sin P1/P2 reproducibles en el diff revisado; no se modifica código productivo durante la revisión. Solo se añaden regresiones necesarias y esta precisión documental:

- hasContract: conserva la existencia del último MemberContract por signedAt desc/id desc. El flujo de firma crea esa fila al firmar; una SigningSession pendiente, cancelada o incluso marcada SIGNED sin MemberContract no cuenta. Un contrato histórico/legacy sin enlace a sesión sigue contando, igual que antes y que operational-status. No implica validez jurídica ni permiso suficiente para operar: canWithdraw añade activo y no caducado, y ventas verifica sus propias restricciones. No se introducen reglas contractuales nuevas.
- hasRfid: Boolean(rfidCode), igual al indicador anterior. null y cadena vacía dan false; códigos normalizados no vacíos, incluidos ceros iniciales, dan true. La desasignación vuelve a false en la siguiente lectura. No valida evidencia RFID ni cambia normalización, asignación o concurrencia.
- expired: fuente única getMemberOperationalFacts; null da false y se compara el instante con `< now`. En el instante exacto no está vencido. Se conservan milisegundos y offsets equivalentes; expiresAt se serializa a ISO UTC, igual que la serialización JSON anterior de Date. No se aplican cortes de día ni reglas horarias del cliente.
- TPV: la lista sirve para identidad/selección. Estado, perfil, descuento y límite contractual proceden de operational-status; today aporta consumos/límites adicionales. Se conservan carga por selección, invalidación de respuestas antiguas y refrescos existentes tras operaciones; no se añade sincronización en tiempo real. La autorización definitiva de ventas sigue en el servidor.

La suite específica revisada pasa 28 entradas del runner, cero fallos, con 14 mutaciones detectadas. Nuevas regresiones explícitas: sesiones sin contrato, contrato histórico con socio bloqueado/caducado, RFID vacío/desasignado y fronteras temporales con offsets. Los dobles de Prisma prueban consultas y DTO; no sustituyen una integración real con PostgreSQL.

Validación pre-commit, 2026-10-08: lint, typecheck, build (BUILD_EXIT=0), CI completa (CI_NATIVE_EXIT=0), prisma validate y git diff --check correctos. Revisado git status --short: los mismos diez archivos modificados y tres nuevos; sin staging, commit, push ni merge. La revisión solo modifica los dos archivos nuevos de pruebas y este documento; no añade cambios al diff productivo.
