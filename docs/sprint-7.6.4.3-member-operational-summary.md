# Sprint 7.6.4.3 — Resumen operativo profesional

## Implementación

`MemberOperationalSummary` es presentacional: recibe `MemberOverviewDTO | null`, carga, error y callback de reintento. No consulta endpoints, mantiene estado local, interpreta roles ni importa reglas de negocio. Se coloca inmediatamente debajo de `MemberProfileHeader`.

`lib/member-overview-loader.ts` centraliza la lectura de `/api/members/[id]/overview`, con `cache: no-store`, validación estructural mediante Zod ya instalado y comprobación del ID solicitado. No normaliza cantidades ni recalcula hechos. Cada instancia pertenece al socio montado; la página conserva su `key` por ID.

## DTO utilizado

El contrato original `lib/dtos/member-overview.ts` no cambia:

| Bloque | Campos reales |
| --- | --- |
| identity | id, memberNumber nullable, fullName, joinedAt |
| operational | active, expiresAt nullable, expired, hasContract, canWithdraw, reasons.inactive/noContract/expired, hasRfid |
| contract nullable | id, signedAt |
| consumption | monthlyGrams, monthlyLimitG nullable, periodStart, periodEndExclusive |
| documentation | hasDniFront, hasDniBack |
| access | lastEvent nullable con type y createdAt |

La cabecera comparte identidad y hechos operativos del overview. Durante su indisponibilidad conserva la identidad de history para identificar el expediente, pero no sustituye el estado, vencimiento ni RFID con hechos de history. Un memberNumber null procedente de overview conserva el fallback al ID propio de la cabecera.

## Indicadores y semántica

1. Membresía: active, expired y vencimiento del servidor; sin comparar fechas localmente.
2. Contrato: existencia de firma y fecha, sin afirmar vigencia.
3. Consumo mensual: gramos recibidos literalmente, límite null diferenciado de cero y fechas del periodo, con extremo superior excluido. Sin redondeo, normalización, restantes ni autorización de retirada.
4. RFID: disponibilidad asignada, sin exponer ni sustituir el código usado en edición.
5. Documentación: disponibilidad frontal/reverso; aviso de que no acredita verificación. Sin URL ni referencia Storage. Las dos tarjetas grandes, previews, histórico y acciones permanecen en su sección.
6. Último acceso: solo type/createdAt del último evento, incluido un tipo desconocido sin traducirlo a presencia física. Null muestra «Sin registros de acceso».

`canWithdraw` se presenta como «Retirada · elegibilidad básica: Cumple/No cumple». Cada motivo verdadero se muestra directamente. Las comprobaciones de cada venta siguen perteneciendo al TPV; el resumen no habilita ni bloquea sus acciones.

## Integración y sincronización

La página sustituye exclusivamente su lectura de operational-status por una de overview compartida por cabecera, resumen, vencimiento visible y controles administrativos. No se elimina ni modifica ningún endpoint. History, contracts y access-logs siguen alimentando detalle, fotografía, RFID, contratos/PDF y actividad.

| Evento | Actualización |
| --- | --- |
| Montaje/cambio de socio | Una lectura overview por ciclo de montaje |
| Estado, renovación, quitar vencimiento | Nueva lectura tras PATCH confirmado, independiente de history |
| Guardar ficha/fecha | Nueva lectura y actualización de history/contratos, sin recarga global redundante |
| RFID asignada, cambiada, desasignada o conflicto 409 | Actualización tras éxito HTTP o al iniciar recuperación de 409, independiente de history; mantiene expectedRfidCode, bloqueos y versiones existentes |
| DNI | Callback onChanged tras éxito HTTP, independiente del refresco documental posterior |
| DNI con resultado incierto | Callback al detectar incertidumbre y tras reconciliar; no se repite el POST |
| Contrato o consumo desde otra pantalla | Montaje, retorno de foco/visibilidad o restauración bfcache |
| Reintento desde cabecera/resumen | Comparte la petición pendiente |

Foco, visibilitychange y pageshow comparten una marca de salida, armada también con pagehide, y solo generan una actualización por retorno. No hay polling. La vuelta fuerza una nueva generación para descartar una petición que hubiera empezado antes de abandonar la página. Cada mutación confirmada también fuerza generación nueva; una lectura anterior, tanto exitosa como fallida, no puede publicar sobre la nueva. Desmontar invalida lecturas y rechaza llamadas tardías; el montaje del efecto reactiva la instancia para soportar el ciclo de desarrollo de React.

## Estados y permisos

Carga, éxito, error, reintento y ausencia de datos son explícitos. Al iniciar una actualización se retira el snapshot anterior; un error nunca representa false, cero ni datos previos como hechos actuales. Null/204 se presentan como ausencia de datos; una estructura inválida, otro ID o un error HTTP/red se tratan como error de lectura. La API actual normalmente responde DTO o error, no 204.

El error de overview es local: no elimina fotografía, edición, documentación, contratos ni actividad. No se modifican permisos del servidor ni controles de edición existentes. STAFF y ADMIN conservan sus capacidades; la administración sigue restringida a ADMIN con sesión resuelta. 401/403 no exponen indicadores retenidos. El resumen solo introduce un botón de lectura/reintento.

## Responsive y accesibilidad

Una columna en 320/375 px, dos desde md (tablet), tres desde xl (escritorio). Grid con columnas flexibles, min-w-0, ruptura de textos arbitrariamente largos, padding compacto y sin anchos fijos ni truncados. Reintento con altura mínima de 44 px y salto de línea. Encabezado etiquetado con aria-labelledby, carga aria-busy/role=status, error role=alert y estados expresados con texto.

Las pruebas verifican la estructura responsive estática. No demuestran medidas reales de scroll horizontal, zoom, foco ni apariencia en un navegador autenticado; queda pendiente la revisión visual en 320, 375, 768, 1024 y 1440 px.

## Pruebas

`npm.cmd run test:member-operational-summary` ejecuta JSX y callbacks de producción con hooks/HTTP simulados, y el coordinador real con respuestas diferidas. Cubre seis indicadores, null/ceros, datos vacíos, carga/error/reintento, precisión recibida, hechos deliberadamente contradictorios para detectar recálculos, evento desconocido largo, permisos STAFF/ADMIN/401/403, DTO inválido/ID incorrecto, deduplicación, respuesta antigua exitosa/fallida, desmontaje, callback DNI y reconciliación incierta, retorno de foco/visibilidad, independencia de otras secciones, ausencia de fetches propios y responsive estático.

Las regresiones existentes de interfaz operativa, cabecera, preservación exacta del vencimiento e history se adaptan a overview. Mantienen cobertura de las cuatro mutaciones administrativas, edición de fecha/otros campos y concurrencia RFID/409. La suite nueva forma parte de `npm.cmd run ci`. No se cambia el motor de ventas ni sus pruebas de reglas.

También se adaptan los fixtures de la página en las pruebas documentales y sus selectores de tarjetas DNI, evitando que seleccionen los nuevos indicadores. La subida espera exclusivamente POST, overview y listado documental; sigue rechazando refrescos de history/contratos. Las 119 pruebas documentales y la prueba de sensibilidad de refresco general pasan por separado. La primera CI señaló estas expectativas antiguas y el ancla de la firma del componente; se corrigieron antes de repetir la CI completa.

## Alcance y limitaciones

Sin cambios en endpoints, DTO original, Prisma, reglas de negocio, ventas ni permisos. Sin dependencias nuevas, commit, push o merge.

- P1: ningún defecto identificado en las comprobaciones ejecutadas; CI completa correcta. Pendiente de revisión.
- P2: revisión visual autenticada pendiente; el responsive solo tiene evidencia estática. Overview agrega lecturas independientes del servidor y no promete una instantánea transaccional. Con la página continuamente activa, cambios externos no se detectan hasta volver a activarla o ejecutar una operación local; no se incorpora polling.
- P3: fecha/hora de presentación usa la zona del navegador, siguiendo la interfaz existente; los límites del periodo proceden del servidor.

El árbol ya contenía cambios de 7.6.4.1/7.6.4.2 al comenzar: página, fotografía, package.json, pruebas de vencimiento/operativa, cabecera y documentos de diseño/implementación. Se han conservado. El diff/status final incluye esos cambios previos; no atribuirlos todos a este sprint.

## Validaciones

| Validación | Resultado |
| --- | --- |
| npm.cmd run lint | Correcto, exit 0 |
| npm.cmd run typecheck | Correcto, exit 0 |
| npm.cmd run build | Correcto, exit 0 |
| npm.cmd run ci | Correcto, exit 0 en la segunda ejecución completa; incluye nueva suite, regresiones, sensibilidad, lint, typecheck y build |
| git diff --check | Correcto, exit 0; avisos de conversión LF/CRLF del repositorio |
| git status --short | Revisado; modificaciones locales y archivos nuevos, incluidos los cambios previos |

Nueve pruebas nuevas de resumen/coordinación, 119 pruebas de interfaz documental y las regresiones focalizadas pasan. Las pruebas de estado retenido se adaptaron al comportamiento deliberado de ocultar snapshots anteriores durante carga/error. No se ha realizado QA visual autenticada ni pruebas con base de datos real en este sprint.

Archivos nuevos de este sprint: `components/member-operational-summary.tsx`, `lib/member-overview-loader.ts`, `scripts/fixtures/member-overview.mjs`, `scripts/test-member-operational-summary.mjs` y este documento. Integración/adaptaciones en la página, cabecera, tarjeta documental, package.json, arnés UI y pruebas de cabecera, operativa, vencimiento, history y documentación/sensibilidad. `components/member-photo-card.tsx` y los documentos de sprints anteriores ya estaban modificados/no seguidos y no se editaron en este sprint.

`git diff --stat` al cierre de implementación, antes de la revisión: 10 archivos seguidos, 157 inserciones y 252 eliminaciones. Incluye modificaciones previas y excluye los archivos nuevos no seguidos; no representa por sí solo el tamaño de este sprint.

SPRINT 7.6.4.3 IMPLEMENTADO — PENDIENTE DE REVISIÓN

## Revisión técnica pre-commit

Se conserva el alcance: sin funcionalidades ni cambios visuales, endpoints, DTO, Prisma, reglas o permisos. En esta revisión solo se modifican la página coordinadora, las pruebas de resumen y este documento. El resto del árbol ya estaba modificado/no seguido al comenzar.

### Hallazgos reproducidos y corregidos

| Prioridad | Reproducción antes de corregir | Corrección |
| --- | --- | --- |
| P2 | Overview indica RFID sin asignar; PATCH devuelve 409 porque cambió el valor; history falla. No se solicita overview y permanece el indicador antiguo. | Invalidar/refrescar al iniciar la recuperación 409, independientemente de history. La recuperación conserva su bloqueo y error. Mover el refresco de syncRfid a los puntos de confirmación/conflicto evita duplicarlo. |
| P2 | Al volver por bfcache, visibilitychange visible seguido de pageshow persisted y focus genera dos GET overview. | pagehide marca la salida; pageshow consume la misma marca que foco/visibilidad. Una sola consulta en ambos órdenes de retorno y también sin eventos de visibilidad. |

Las dos pruebas fallaron sobre el código previo (respectivamente ninguna consulta nueva y dos consultas en vez de una) y pasaron tras corregirlo. No se identificaron P1. No quedan P2 técnicos reproducidos pendientes. La QA visual real permanece pendiente, fuera de esta inspección estática.

P3: el loader descarta lecturas invalidadas, pero no aborta su transporte; no publican estado ni se comparten entre socios. No se incorpora una optimización de transporte sin un defecto reproducido. Las fechas siguen utilizando la zona del navegador y el overview no constituye una transacción del servidor.

### Matriz de concurrencia y cobertura

| Caso | Evidencia automatizada |
| --- | --- |
| A: dos cargas simultáneas | Misma promesa y un único GET mientras está pendiente |
| B: cambio de socio | Página remonta por key; resolución/rechazo tardío del socio anterior no altera nombre, consumo ni estado del nuevo; cero actualizaciones tardías |
| C: respuesta antigua después de nueva | Éxito/error antiguo no reemplaza consumo nuevo ni limpia el estado de la generación actual |
| D: mutación durante petición | Fuerza generación nueva y oculta snapshot anterior; respuesta previa no se publica |
| E: HTTP y reintento | 401/403/500, DTO inválido e ID incorrecto muestran error; reintento recupera datos |
| F: desmontaje | No publica peticiones pendientes ni quedan listeners disparando consultas del socio anterior |
| G: dos mutaciones rápidas | Lectura pendiente, renovación y quitar vencimiento producen tres generaciones; solo la última puede publicar y las anteriores no terminan la carga |
| H: retorno del TPV | Montaje/foco/visibilidad y bfcache actualizan consumo; un GET por retorno, incluidos ambos órdenes de eventos |

Se añaden cuatro pruebas concretas (13 en total en la suite de resumen): B/F; H; conflicto RFID con history fallido; D/G. Cubren las dos correcciones y las lagunas de regresión sobre cambio de socio/mutaciones rápidas. No son pruebas de navegador ni de base de datos real.

### Resultado de la inspección

- Componente: props tipadas con DTO real, seis indicadores, null/ceros, carga/error/vacío/reintento; sin I/O, reglas duplicadas, restantes, presencia física, verificación documental o vigencia contractual inferida.
- Loader: propietario por montaje/ID, deduplicación de reintentos, versiones en éxito/error/finally, limpieza y error independiente. No necesita cambios de implementación en esta revisión.
- Integración: cabecera y resumen comparten overview; history, contracts y access-logs conservan sus consumidores. Las mutaciones fuerzan actualización y retiran indicadores antiguos. Se conserva el fallback de identidad a history durante indisponibilidad, sin fallback de hechos operativos.
- Mutaciones: edición, vencimiento, activar/bloquear, asignar/desasignar RFID, conflictos, subida/reconciliación DNI y retorno de contrato/TPV. Sin polling ni decisiones de venta en frontend.
- DNI: dos tarjetas, previews imagen/PDF, badges, abrir/descargar, versiones, subida y errores intactos; callback overview independiente de las lecturas documentales. No se modifica la tarjeta en esta revisión.
- Permisos: STAFF/ADMIN y controles ADMIN existentes; overview/DNI usan requireStaffOrAdmin y status usa requireAdmin en backend. Sin nuevos datos personales, URLs Storage o acciones habilitadas por canWithdraw.
- Responsive estático: grid de una columna a 320/375, dos desde md, tres desde xl; min-w-0 y overflow-wrap:anywhere en tarjetas, sin anchos fijos o truncados. No se declara medición de overflow, zoom, foco ni QA visual real.

Validaciones de esta revisión: `npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd run build` y `npm.cmd run ci` completados con exit 0. La CI incluye las 13 pruebas del resumen, cabecera, overview, mutaciones, historial, reglas operativas y las regresiones documentales/de sensibilidad. `git diff --check` correcto (solo avisos LF/CRLF), `git status --short` inspeccionado. No commit, push o merge.

`git diff --stat` tras la revisión: 10 archivos seguidos, 162 inserciones y 252 eliminaciones. Incluye el trabajo previo y excluye archivos no seguidos (entre ellos pruebas de resumen y este informe). Se mantienen los mismos 19 paths modificados/no seguidos que al iniciar la revisión; únicamente se editaron página, pruebas de resumen y este documento.

SPRINT 7.6.4.3 REVISADO — PENDIENTE DE QA VISUAL
