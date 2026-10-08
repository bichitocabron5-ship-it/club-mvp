# Inventario previo — 7.6.2.2

Implementación: `app/api/members/[id]/history/route.ts`. Búsqueda global de `history` y `MemberHistoryData`, incluyendo componentes, librerías y scripts: tres consumidores productivos, sin otros lectores indirectos del endpoint.

| Consumidor | Member utilizado | Sale / Product | Agregados | Necesita historial |
| --- | --- | --- | --- | --- |
| Ficha `/members/[id]` (carga, actualización, foto, estado y conciliación RFID) | id, memberNumber, fullName, dni, phone, email, photoUrl, active, joinedAt, expiresAt, rfidCode; commercialProfile, discountPercent, commercialNotes para ADMIN; dniFrontUrl/dniBackUrl como disponibilidad para MemberDocumentsCard | id, qty, totalAmount, originalAmount, discountAmount, discountReason, cancelledAt, cancelReason, createdAt; product.name/unit | totalSpent, count | Sí |
| `/members/[id]/contract` | fullName, dni, phone, email | Ninguno | Ninguno | No |
| `/members/new` (recuperación por query y conflicto RFID) | id, memberNumber, fullName, dni, phone, email, active, expiresAt, rfidCode (incluye validación del DTO) | Ninguno | Ninguno | No |

Tipos: MemberHistoryData, MemberHistorySale en lib/types.ts; CreatedMember local. Dependencias indirectas: MemberPhotoCard recibe foto; MemberDocumentsCard recibe disponibilidad DNI; fusión de respuestas preserva mutaciones RFID. AdminSigningPanel usa memberId y sus propios endpoints.

Lectores existentes: `/members` lista socios y no es una lectura puntual mínima; `/members/[id]` solo PATCH; operational-status tiene propósito operativo y carece del contacto; recent-sales lee ventas; photo solo POST. lib/member-identity normaliza documentos, no lee identidad. Se requieren lectores puntuales para identidad contractual y recuperación de alta.

Pruebas asociadas revisadas: contract-data-minimization, admin-signing-session-ui, member-create, member-dni-convergence, member-documents-ui y sensibilidad, member-operational-ui, member-expiration-preservation, sales y operational-status-hardening. Algunas caracterizan la antigua respuesta DNI y deben adaptar sus expectativas sin perder cobertura de los lectores documentales.

Antes: Member completo con foto resuelta y URLs DNI protegidas; todas las columnas Sale y Product completo. Cache privado solo en éxito. requireStaffOrAdmin ya usa autoridad persistida.

Semántica: filas incluyen anuladas, agregado y count las excluyen. El agregado usa finalAmount ?? totalAmount, la ficha mostraba totalAmount. El motor (sales-engine) persiste ambos con pricing.finalAmount; recent-sales, day-closure y dashboard-metrics prefieren finalAmount con fallback. La ficha debe usar esa misma preferencia, incluyendo cero. No cambian escrituras ni anulaciones.

Decisiones: conservar RFID usado para concurrencia y foto resuelta existente (sin añadir mecanismo de firma); sustituir URLs DNI en history por dos indicadores de disponibilidad que el consumidor convierte en los mismos enlaces autenticados. No se modifican lectores, escritores ni reglas documentales. Comercial solo ADMIN, tanto en select como en DTO. Separar identidad contractual y recuperación del alta; no crear overview ni ampliar operational-status.

Deuda: historial sigue sin límite hasta 7.6.8; foto conserva su resolución temporal existente; política de edición comercial y minimización de otros endpoints quedan fuera de este bloque.

## DTO final

- History Member: id, memberNumber, fullName, dni, phone, email, active, joinedAt, expiresAt, rfidCode, photoUrl resuelta, hasDniFront, hasDniBack. Solo ADMIN: commercialProfile, discountPercent, commercialNotes. Sin createdAt ni referencias DNI/Storage en crudo. RFID y foto se conservan porque tienen consumidores reales.
- History Sale: id, qty, totalAmount, finalAmount, originalAmount, discountAmount, discountReason, cancelledAt, cancelReason, createdAt, product. Product contiene exclusivamente name y unit. Se excluyen costes, beneficio, notas internas, IDs de operadores y demás columnas no utilizadas.
- Identity: fullName, dni, phone, email. Consumidor contractual; no ventas, agregados, RFID, foto, campos comerciales ni documentos.
- Registration: id, memberNumber, fullName, dni, phone, email, active, expiresAt, rfidCode. Recuperación de alta y conciliación tras conflicto; no ventas ni documentos.

Los tres GET conservan requireStaffOrAdmin y aplican private, no-store a 200/400/401/403/404. La autoridad de rol y estado activo se obtiene de AppUser en cada petición. No se altera el tratamiento de excepciones de infraestructura no controladas.

## Regresiones

La protección `test:history-hardening` entra en CI antes de la protección de operational-status. Incluye 33 pruebas de rutas/DTO/autorización/agregados, 20 mutaciones de sensibilidad y 10 pruebas de consumidores renderizados mediante el harness de hooks existente. Comprueba Member/Sale/Product completos, referencias DNI, datos comerciales hacia STAFF, RFID innecesario en identidad, ventas en identity/registration, retorno de contrato/alta a history, autorización y cache de los tres GET, anuladas y cero final. Las dobles Prisma devuelven campos extra deliberadamente para verificar que el DTO protege independientemente del select. Todas las mutaciones se aplican solo en memoria; las de retorno a history ejercitan las aserciones sobre el código del consumidor, y las de rutas ejecutan los handlers reales con dobles.

Se adaptan expectativas DNI y el ancla de sensibilidad documental a indicadores de disponibilidad; no se eliminan pruebas del lector legacy, foto, carga documental ni firma. El inventario cerrado de rutas de member-document-core reconoce explícitamente los dos nuevos lectores.

La validación usa dobles en memoria y compilación de producción; no constituye una prueba contra PostgreSQL/Storage reales ni un recorrido manual en navegador.

## Riesgos pendientes por prioridad

- P1 fuera del alcance: PATCH `/api/members/[id]` sigue devolviendo Member completo (también en la rama RFID), por lo que su respuesta aún puede exponer commercialNotes y referencias internas a STAFF. Este sprint garantiza la minimización de los GET tratados; no una garantía global sobre todas las respuestas de Member. Requiere un bloque propio de minimización de mutaciones, sin confundirlo con cambiar permisos de edición.
- P2: número de filas y coste de history siguen creciendo; paginación diferida expresamente a 7.6.8.
- P3: foto conserva la resolución temporal existente y disponibilidad DNI conserva el lector protegido actual. Separar estas lecturas requiere el bloque funcional correspondiente; no se introducen nuevos mecanismos de firma de URLs.

## Validación inicial

2026-10-08: lint, typecheck, build, prisma validate y git diff --check correctos. CI completa con código 0: 401 pruebas, cero fallos. Ejecución adicional de consumidores, alta, ficha, operational status, acceso, ventas/RFID, minimización contractual, sesiones, firma pública e integridad/snapshots contractuales: 26 entradas del runner correctas (varias ejecutan baterías internas).

La primera CI detectó el ancla documental antigua, corregida. Una ejecución posterior completó todas las etapas pero PowerShell convirtió stderr informativo de Prisma en NativeCommandError al redirigir; repetida con captura nativa en cmd confirmó código 0.

Sin commit, push, merge ni cambios de esquema/migraciones. El estado de Git conserva los cambios para revisión.

## Revisión pre-commit del diff

La búsqueda global de rutas, cadenas fetch, history y MemberHistoryData, incluyendo hooks/helpers, confirma un único consumidor productivo actual de history: la ficha. Contrato usa identity y alta usa registration en sus dos lecturas, sin fallback a history. El nombre local `history` en la conciliación del alta es una variable de la respuesta registration, no una petición al endpoint anterior.

| Campo de history Member | Consumidor y motivo de conservación |
| --- | --- |
| id | Comparación de identidad al fusionar respuestas y fallback del número visible |
| memberNumber | Número visible, formulario y confirmación de operación RFID |
| fullName | Cabecera, formulario y confirmación RFID |
| dni | Identificación visible y formulario |
| phone | Contacto visible y formulario |
| email | Contacto visible y formulario |
| active | Acción actual de activar/bloquear en la ficha; no se modifica ese flujo |
| joinedAt | Fecha de alta visible |
| expiresAt | Inicialización y preservación de fecha en el formulario |
| rfidCode | Chapita visible, asignación/desasignación y precondición de concurrencia |
| photoUrl | MemberPhotoCard y su remount al actualizar; resolver existente devuelve URL temporal o null, nunca la referencia cruda |
| hasDniFront | Disponibilidad booleana convertida en enlace autenticado frontal para MemberDocumentsCard |
| hasDniBack | Disponibilidad booleana convertida en enlace autenticado reverso para MemberDocumentsCard |

Los tres campos comerciales alimentan exclusivamente la sección/formulario ADMIN de la ficha. STAFF no los necesita en history: el envío de edición comercial también está condicionado a ADMIN. El TPV obtiene sus condiciones del lector operativo existente; no se amplía ni modifica aquí.

Identity no necesita id ni memberNumber: el panel de firma recibe el mismo memberId de la ruta. Registration conserva los nueve campos de CreatedMember que el flujo existente valida; id, memberNumber, fullName y rfidCode también se consumen en la presentación, firma y conciliación. No existen estados nominales CREATE/FORMALIZE/EDIT en esta página: permanecen sus estados y pasos actuales.

Los tipos de history e identity están separados en lib/types.ts; registration utiliza el tipo local independiente CreatedMember. No se añaden casts amplios ni as any. Fechas se serializan como strings y los campos anulables conservan null. P3 preexistente: memberNumber admite number/undefined y joinedAt admite null en los tipos de cliente, más ampliamente que el esquema actual; no causa regresión y no se estrecha durante una revisión limitada a P1/P2.

Los 500 no controlados por fallos de infraestructura se delegan al framework en los tres GET; no se garantiza aquí Cache-Control en esos fallos. P3 de uniformidad, sin cambio respecto a history anterior. El consumidor contractual trata 500 con el mismo error genérico que 401/403/404 y mantiene AdminSigningPanel. Las pruebas confirman propagación sin fabricar DTO de éxito.

Cambios durante la revisión: solo pruebas de sensibilidad/casos de error y esta documentación. No se ha encontrado un P1/P2 nuevo reproducible en el código productivo del diff. La deuda PATCH preexistente queda expresamente excluida de esta revisión y la cantidad de ventas se mantiene como P2 aceptado para 7.6.8.

Validación pre-commit: protección history 63/63; 17 suites adicionales de firma pública/administrativa, creación, RFID, ficha, autorización y minimización contractual correctas; CI completa 413/413 y código 0, incluidas las suites DNI/documentales afectadas. lint, typecheck, build y prisma validate ejecutados también por separado y correctos. git diff --check correcto. Sin commit/push/merge. Dictamen del diff dentro del alcance acordado: apto para commit; las deudas expresamente diferidas no son hallazgos nuevos bloqueantes.
