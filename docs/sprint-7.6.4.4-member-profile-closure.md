# Sprint 7.6.4.4 — Revisión integrada y cierre

Fecha: 2026-10-10. Proyecto: club-mvp. Revisión del árbol de trabajo completo respecto a `main`, incluidos los archivos nuevos sin seguimiento. No hay commits en `main..HEAD` al comenzar la revisión. Sin commit, push ni merge.

## Alcance final y documentación

El sprint extrae la cabecera, adapta la presentación de la fotografía e incorpora el resumen operativo con el overview existente. Incluye coordinación, pruebas y documentación. No modifica endpoints, DTO del servidor, Prisma, dependencias, reglas operativas, ventas ni permisos. No se identifican archivos accidentales ni código muerto nuevo en el diff inspeccionado. El adaptador `operationalStatus` se deriva del overview durante render, sin otro estado React ni otra consulta.

Se revisaron los documentos 7.6.4.1, 7.6.4.2 y 7.6.4.3. Son registros de cada fase: las referencias de 7.6.4.2 a operational-status, retención de snapshot y recarga global describen aquella implementación, sustituida en 7.6.4.3. La propuesta de diseño no es el contrato final. Este cierre prevalece para el estado integrado: overview compartido, retirada de indicadores durante carga/error y refresco después de editar sin recarga global. Las menciones históricas a QA pendiente quedan actualizadas por la confirmación del usuario recogida aquí; no se reescribe esa evidencia histórica.

## Arquitectura, componentes y fuentes

| Elemento | Responsabilidad y fuente |
| --- | --- |
| `app/members/[id]/page.tsx` | Sesión, permisos de presentación, estado, coordinación y mutaciones; remonta el contenido mediante key por ID. |
| `MemberProfileHeader` | Presentación de identidad, slot de foto, número, estado, vencimiento y acciones. Sin fetch, hooks ni reglas de negocio. |
| `MemberOperationalSummary` | Presentación del DTO existente, carga/error/vacío y reintento. Sin consultas, estado propio ni autorización de venta. |
| `createMemberOverviewLoader` | Una instancia por ficha; GET overview con no-store, validación Zod e ID, promesa compartida y generaciones. |
| `/overview` | Identidad de cabecera, hechos operativos, membresía, contrato, consumo, disponibilidad RFID/DNI y último evento. Fuente compartida con vencimiento visible y acción Activar/Bloquear. |
| `/history` | Datos personales, foto, código RFID, borrador inicial y retiradas; identidad de respaldo si overview no está disponible. No sustituye hechos operativos ausentes. |
| `/contracts`, `/access-logs` | Colecciones de contratos/PDF y actividad; no se sustituyen por los indicadores del resumen. |
| Componentes foto y DNI | Conservan sus flujos específicos. DNI carga actuales e histórico bajo demanda; notifica cambios al coordinador. |

Se conservan cuatro lecturas iniciales de la página: overview, history, contracts y access-logs, además de los recursos/documentos de sus componentes. No se consulta operational-status desde esta ficha ni se duplica overview en cabecera/resumen. Las réplicas preexistentes entre history, borrador RFID y refs de concurrencia tienen responsabilidades distintas; no se introduce otro snapshot operativo.

Se consultaron las guías locales Next.js de `use client` y `useParams`. Los componentes pertenecen al árbol cliente existente y no introducen una nueva frontera servidor/cliente.

## Cabecera y resumen

La cabecera conserva identidad, número con fallback nullish al ID, foto, badges y acciones Editar, Contrato/Firma, TPV e Historial con los destinos anteriores. El DNI textual permanece en datos personales. Estado y caducidad proceden del servidor, sin reloj cliente para decidirlos. Se conserva el vencimiento nullable y se muestra también cuando ha caducado. La foto mantiene subida/reemplazo, apertura, permisos, errores y callback; diferencia ausencia de imagen y fallo de carga sin borrar su URL.

El loader y el componente se contrastaron con `lib/dtos/member-overview.ts`: identity; operational con reasons y hasRfid; contract nullable; consumption con periodo y límite nullable; documentation; access.lastEvent nullable. No se amplía el DTO ni se muestran códigos RFID, URLs privadas o nuevos datos sensibles en el resumen. Zod valida la estructura y retira campos desconocidos; no recalcula hechos.

Los seis indicadores respetan los valores recibidos: contrato firmado no significa vigencia, disponibilidad DNI no significa verificación, último evento no significa presencia física. Consumo y límite se presentan sin redondeos ni cálculos comerciales propios; null y cero son distintos. `canWithdraw` se identifica como elegibilidad básica y no habilita, bloquea ni autoriza ventas: el TPV y el servidor conservan sus comprobaciones.

## Sincronización y errores

| Escenario | Comportamiento revisado |
| --- | --- |
| Carga y reintento | Cabecera/resumen comparten petición pendiente. No hay polling. |
| Mutación confirmada | Estado, renovación, fecha, edición y RFID fuerzan generación nueva; el refresco overview no depende del éxito de history. |
| DNI | Notificación después de éxito HTTP, resultado incierto y reconciliación; no se repite POST automáticamente. |
| Respuesta overview obsoleta | Versión comprobada en éxito, error y finally; no publica ni termina la carga de una generación nueva. |
| Cambio de socio/desmontaje | Key por ID, invalidación del loader y retirada de listeners; las respuestas del overview anterior no afectan al nuevo socio. |
| Retorno desde TPV/contratos | Montaje o recuperación de foco/visibilidad/bfcache fuerza lectura nueva. pagehide y marca de salida deduplican los eventos de retorno. |
| Conflicto RFID | Invalida overview incluso si falla history; conserva expectedRfidCode, bloqueo, recuperación y protección de escrituras confirmadas frente a history antiguo. |
| Error HTTP/red/DTO/ID | Snapshot operativo retirado, mensaje y reintento; no se presenta false/cero como sustituto de error ni se eliminan las demás secciones. |

Las garantías de generaciones pertenecen al overview; no se afirma consistencia transaccional entre endpoints ni actualización en tiempo real de todas las colecciones. El retorno actualiza el resumen; los listados históricos mantienen su ciclo previo de carga. Una navegación con montaje nuevo vuelve a consultar las colecciones.

## Permisos y regresiones

STAFF y ADMIN conservan edición básica, RFID, contrato, TPV, fotografía y documentación. Las acciones administrativas de estado/renovación y los campos comerciales mantienen sus guards ADMIN; foto/DNI requieren sesión resuelta para mostrar controles de subida. La cabecera no interpreta roles. Se contrastaron los guards del servidor, sin modificarlos: overview, edición, foto, documentos, contratos/PDF y ventas exigen STAFF/ADMIN; status exige ADMIN. La interfaz no sustituye esas autorizaciones.

Deuda existente explícita: **STAFF puede editar `expiresAt` mediante PATCH general**, aunque los controles dedicados de membresía sean ADMIN. Esta política no se modifica ni se amplía aquí.

Se conservan datos personales, administración, formulario, RFID y sus conflictos, contratos/PDF, fotografía, historial, actividad, navegación y estados de error. El diff de DNI se limita al callback de sincronización: permanecen las dos tarjetas grandes frontal/reverso, previews imagen/PDF, badges, Abrir/Descargar, incorporación y consulta de versiones e histórico paginado. `member-document-item.tsx` no cambia.

## Responsive y QA manual

Revisión estructural: 320 y 375 px usan una columna en cabecera y resumen, foto acotada, textos con ruptura y acciones visibles. Desde md la cabecera distribuye foto/identidad y acciones debajo; el resumen tiene dos columnas. Desde xl la cabecera tiene tres zonas y el resumen tres columnas. Se revisaron min-w-0, minmax, saltos de texto y alturas de botones.

El usuario confirmó QA manual correcta en escritorio y móvil, sin overflow horizontal, con acciones conservadas, actualizaciones correctas y documentación DNI intacta; también comunicó revisión visual/funcional correcta de 7.6.4.2 y 7.6.4.3. **Codex no realizó pruebas de navegador en este cierre.** No se atribuyen a esa confirmación medidas exactas en cada ancho, teclado o zoom que el usuario no haya detallado. La evaluación específica de tablet, 375 y 320 px de esta revisión es estática.

## Pruebas y validaciones

Se revisó la cobertura acumulada: 18 casos de cabecera/foto y 13 de resumen/coordinación, más las suites de overview, UI operativa, preservación de vencimiento, mutaciones/RFID, history y documentación/sensibilidad integradas en CI. Cubren identidad/acciones, permisos ADMIN/STAFF, foto ausente/rota/subida/error, DNI y versiones, reintentos, errores HTTP, estructura inválida, cambio de socio, respuestas fuera de orden, mutaciones y retorno externo.

Los tests ejecutan JSX/callbacks y loader reales con hooks/HTTP simulados; las suites de servidor simulan sus dependencias. No son E2E de navegador ni pruebas contra base de datos real. Los enlaces conservan destinos y callbacks; la simulación de retorno no sustituye un recorrido autenticado de firma o TPV. No se añaden tests en este cierre porque no se ha identificado un nuevo P1/P2 reproducible que los requiera.

| Comando | Resultado |
| --- | --- |
| `npm.cmd run lint` | Correcto, exit 0 |
| `npm.cmd run typecheck` | Correcto, exit 0 |
| `npm.cmd run build` | Correcto, exit 0 |
| `npm.cmd run ci` | Correcto, exit 0; suites completas, lint, typecheck y build |
| `npx.cmd prisma validate` | Correcto, exit 0 |
| `git diff --check` | Correcto; solo avisos LF/CRLF, sin errores de whitespace. Archivos nuevos comprobados también por separado. |
| `git status --short` | 10 archivos seguidos modificados y 10 nuevos sin seguimiento; sin cambios accidentales ni archivos añadidos al índice. |

## Hallazgos, riesgos P3 y deuda pendiente

- P1: ninguno identificado en la revisión integrada.
- P2: ningún nuevo defecto reproducible identificado. Las correcciones RFID/409 y doble retorno bfcache de la revisión 7.6.4.3 permanecen y tienen regresiones automatizadas.
- P3: el loader invalida resultados pero no aborta el transporte; no hay polling para cambios externos mientras la ficha permanece activa.
- P3: overview agrega lecturas no transaccionales; las colecciones históricas pueden corresponder a otro instante. Las fechas se presentan en la zona del navegador.
- Deuda preexistente: permisos de expiresAt de STAFF, mensaje de error de foto si falla su callback tras subida correcta, renovación de URLs firmadas y refresco de contratos tras foto. El fallback de foto no renueva credenciales.
- Deuda preexistente: borrador general retenido al cancelar, ausencia de pending dedicado en guardar/estado y límites del contador de accesos. No se convierten en nuevas funcionalidades de este sprint ni se declara una corrección de estos flujos.
- Límite de evidencia: accesibilidad exhaustiva, zoom y cada viewport exacto no se han verificado en navegador por Codex.

## Cambios durante esta revisión e inventario

En 7.6.4.4 solo se crea este documento. No se modifica código de producto ni tests; se preserva todo el trabajo previo. El log local `.sprint-7.6.4.4-ci.log` es evidencia de ejecución, no parte del entregable versionado.

Archivos seguidos modificados acumulados: `app/members/[id]/page.tsx`, `components/member-documents-card.tsx`, `components/member-photo-card.tsx`, `package.json`, `scripts/fixtures/member-document-ui-harness.mjs`, `scripts/test-history-consumers.mjs`, `scripts/test-member-documents-ui-sensitivity.mjs`, `scripts/test-member-documents-ui.mjs`, `scripts/test-member-expiration-preservation.mjs` y `scripts/test-member-operational-ui.mjs`.

Archivos nuevos acumulados: `components/member-operational-summary.tsx`, `components/member-profile-header.tsx`, `lib/member-overview-loader.ts`, `scripts/fixtures/member-overview.mjs`, `scripts/test-member-operational-summary.mjs`, `scripts/test-member-profile-header.mjs` y los cuatro documentos `docs/sprint-7.6.4.1-member-header-design.md`, `docs/sprint-7.6.4.2-member-header.md`, `docs/sprint-7.6.4.3-member-operational-summary.md`, `docs/sprint-7.6.4.4-member-profile-closure.md`.

`git diff --stat` y `git diff --stat main` de archivos seguidos: 10 archivos, 162 inserciones y 252 eliminaciones. Excluyen los nuevos sin seguimiento; el inventario completo es 20 paths. No se han añadido al índice ni creado commits.

## Conclusión

Revisión técnica integrada y validaciones completas correctas, sin P1/P2 reproducibles pendientes dentro del alcance. QA manual confirmada por el usuario con los límites de evidencia indicados. Sin cambios de producto durante el cierre y sin commit, push ni merge.

SPRINT 7.6.4 VALIDADO — APTO PARA COMMIT
