# Sprint 7.6.4.1 — Auditoría visual y arquitectónica de la ficha

Fecha: 2026-10-09. Proyecto: club-mvp. Rama inspeccionada: `sprint-7.6.4-member-header`; HEAD `6f80ead`, merge del overview de Sprint 7.6.3. Estado inicial de Git limpio.

## Alcance y evidencia

Auditoría estática del JSX, estados, estilos y contratos de API del checkout. No se ha abierto una sesión autenticada ni realizado una prueba visual en navegador: las conclusiones responsive son riesgos fundamentados en código, no capturas verificadas. No se han ejecutado mutaciones, iniciado servicios, implementado componentes, cambiado endpoints ni creado migraciones. El único entregable es este documento.

Fuentes inspeccionadas: `app/members/[id]/page.tsx`, `components/member-photo-card.tsx`, `components/member-documents-card.tsx`, `components/member-document-item.tsx`, `components/ui/page-header.tsx`, `app/layout.tsx`, `app/globals.css`, `lib/dtos/member-overview.ts`, `lib/member-operational-status.ts`, `lib/storage.ts` y las rutas de socio history, operational-status, overview, contracts, access-logs, photo, status, PATCH de socio y documentación. También se contrastaron los guards de PDF de contratos y TPV. No se escribió código Next.js; antes de la implementación habrá que leer las guías relevantes de `node_modules/next/dist/docs/`, conforme a AGENTS.md.

## 1. Estructura actual y acoplamientos

`MemberDetail` obtiene `id` con `useParams` y monta `MemberDetailContent` con `key={id}`. Es una página cliente. Todo el contenido depende de que `/history` entregue `member` y `sales`: mientras tanto muestra carga o error inicial.

Orden actual:

1. `PageHeader`: marca, título «Ficha del socio» y descripción.
2. Panel «Expediente»: tarjeta completa de fotografía, número, nombre, DNI y badges de estado, vencimiento, contrato y RFID.
3. Datos personales: teléfono, correo, alta y vencimiento.
4. Perfil comercial ADMIN: perfil, descuento y notas.
5. Operaciones: contrato/firma, TPV, historial y edición; bloque administrativo de membresía.
6. Formulario condicional de edición, incluyendo gestión RFID.
7. `MemberDocumentsCard`: DNI frontal y reverso e histórico documental.
8. Contratos firmados: contador, datos históricos, límite y PDF.
9. `#member-history`: accesos, retiradas, total acumulado y detalle de actividad/anulaciones.

### Estado React

| Grupo | Estado / referencias | Responsabilidad |
| --- | --- | --- |
| Sesión | `useSession`, `status`, `isAdmin`, `canUploadPhoto`, `authReady` | Visibilidad de controles; `canUploadPhoto` también se reutiliza para DNI |
| Lecturas | `data`, `contracts`, `accessLogs`, `initialError`, `historyRefreshError`, `contractsError`, `accessError` | Historial, datos personales y errores parciales |
| Operativo | `operational` con snapshot/loading/error; `operationalRequestRef` | Lectura independiente y descarte de respuestas antiguas |
| Edición | `editing`, `expirationEdited`, `editForm` | Número, nombre, DNI, teléfono, email, fecha, RFID y campos comerciales |
| RFID | `assigningRfid`, `rfidMessage`, `rfidInput`, `rfidProcessing`, `rfidUnassigning`, `rfidError`, `rfidBlocked` | Captura manual/lector, mensajes, bloqueos y mutación |
| Concurrencia RFID/historial | `rfidMutationRef`, `rfidVersionRef`, `historyRequestRef`, `rfidBaseRef`, `rfidBlockedRef`, `rfidRef` | Exclusión, valor esperado, recuperación 409, foco y protección frente a lecturas obsoletas |

Tres efectos en la página: carga operativa por `id` con invalidación de versión al desmontar; carga paralela de contratos/history/accesos con cancelación lógica y versiones; limpieza del mensaje RFID tras cuatro segundos. Los componentes foto/DNI mantienen sus propios estados; DNI además tiene efectos de lectura, abortos y paginación.

Acoplamientos relevantes:

- Identidad, foto, formulario, RFID y retiradas dependen del mismo `data` de history. El `Promise.all` inicial espera también contratos y accesos, aunque sus errores se aíslan como `null`.
- El formulario y las mutaciones siguen en la página junto con toda la presentación. `changeEditing` repone solo vencimiento y su indicador: no reconstruye todo el borrador al cancelar.
- La subida de foto invoca `refreshMember`, que relee history y después contratos, aunque no cambia el contrato.
- `saveMember` normalmente recarga toda la ventana. Si cambió la fecha y falla el refresco operativo, conserva el snapshot y usa `refreshMember`.
- RFID sincroniza `data.member.rfidCode` y `editForm.rfidCode`; `mergeMemberHistory` conserva escrituras confirmadas frente a history antiguo. Esta protección no debe perderse en una extracción visual.
- Cambiar el estado dispara una lectura operativa independiente y otra de history; el fallo de history no impide refrescar el badge.

## 2. Fuentes y duplicaciones

Todas las rutas de esta tabla son relativas a `/api/members/[id]`, salvo indicación contraria.

| Dato / uso actual | Fuente actual | Uso posible de overview |
| --- | --- | --- |
| Número, nombre, alta | GET `/history`, `member`; número con fallback `memberNumber ?? id` | `identity.memberNumber`, `fullName`, `joinedAt`, `id` |
| Foto | `history.member.photoUrl`; POST `/photo` devuelve la nueva URL | No contiene foto ni indicador de foto |
| DNI, teléfono, correo, perfil comercial | `/history`; comerciales solo ADMIN | No existen en el DTO |
| Badge activo/bloqueado | GET `/operational-status`, `member.active` | `operational.active` |
| Vencimiento visible y caducidad | `/operational-status`, `member.expiresAt` y `expired` | `operational.expiresAt`, `expired` |
| Botón Activar/Bloquear y fecha inicial de edición | `/history`, `member.active`, `expiresAt` | Puede unificarse la lectura operativa; conservar borrador separado |
| Badge contrato | `/operational-status.hasContract` | `operational.hasContract` |
| Histórico contractual, condiciones, PDF | GET `/contracts`; PDF en `/api/contracts/[contractId]/pdf` | Solo último contrato: id y signedAt |
| RFID badge y editor | `/history.member.rfidCode`, actualizado con PATCH del socio | Solo `operational.hasRfid`, nunca el código ni el valor esperado |
| DNI disponible | history `hasDniFront/Back` para fallback; GET `/member-documents?view=current` como listado actual | `documentation.hasDniFront/Back`, solo disponibilidad |
| Actividad | `/history` (sales/count/totalSpent), GET `/access-logs` | Consumo mensual y último acceso, no histórico completo |

La ficha NO hace GET `/overview` actualmente. Realiza cuatro lecturas iniciales en la página y una de documentos al montar ese componente; imágenes y previsualizaciones generan peticiones de recursos adicionales. El histórico documental se carga al abrirlo, con `view=all&limit=20` y cursor. No se usan `/identity`, `/registration`, `/today` ni `/rfid` desde esta página.

Duplicaciones y diferencias semánticas:

- Activo y vencimiento existen en history y operational-status. Badge y botón administrativo pueden discrepar si solo una lectura se refresca. La fecha del formulario puede quedar antigua tras renovar/quitar vencimiento.
- Vencimiento aparece tanto en badges como en datos personales. Debe tener una fuente compartida aunque se conserve una repetición contextual.
- Contrato disponible e histórico son lecturas distintas; un error del listado no significa «sin contrato». Overview tampoco sustituye el listado ni prueba validez jurídica.
- RFID está replicado en datos confirmados y borrador, con protección deliberada. No reemplazarlo por `hasRfid` ni actualizar el valor esperado desde ese booleano.
- La foto se almacena localmente en `MemberPhotoCard`; la key incluye `id:photoUrl`, por lo que una URL firmada nueva puede remontar la tarjeta.
- DNI tiene disponibilidad de history, lista actual y, en el futuro, overview. No permitir que un overview antiguo sobrescriba el resultado documental reciente.
- El contador de accesos es `accessLogs.length`, con un máximo de 100 por API: no es total histórico. Las retiradas y el total monetario no equivalen a gramos mensuales.

## 3. Inventario de acciones y permisos

La visibilidad cliente no sustituye autorización servidor. Algunos enlaces y el botón Editar carecen de guard específico en JSX; la lectura principal exige STAFF/ADMIN.

| Acción disponible | Destino / comportamiento | STAFF | ADMIN |
| --- | --- | --- | --- |
| Contrato / Firma | `/members/[id]/contract` | Acceso al flujo | Acceso al flujo |
| Ir al TPV | `/sales`, sin preselección del socio en la URL | Sí | Sí |
| Ver historial | Ancla `#member-history` | Sí | Sí |
| Editar socio / Editando socio | Alterna formulario | Sí | Sí |
| Guardar cambios / Cancelar | PATCH `/api/members/[id]` / cerrar edición | Datos básicos, número y fecha | También comerciales |
| Activar / Bloquear | PATCH `/status` | No | Sí |
| Renovar 1 año / Quitar vencimiento | PATCH `/status` | No | Sí |
| Reintentar estado operativo | GET `/operational-status` | Sí | Sí |
| Guardar RFID manual | PATCH socio con `rfidCode` y `expectedRfidCode` | Sí | Sí |
| Asignar / Cambiar chapita RFID | Abre captura; Enter envía PATCH | Sí | Sí |
| Cancelar lectura / Cerrar aviso RFID | Estado local | Sí | Sí |
| Desasignar RFID | Confirmación con socio/código; PATCH con null y valor esperado | Sí | Sí |
| Subir / Reemplazar foto | Selector y POST `/photo`, campo `image` | Sí | Sí |
| Abrir foto | URL firmada en pestaña nueva; inhabilitado sin URL | Sí | Sí |
| Actualizar documentación / Reintentar | Relee actuales; reconcilia resultado incierto | Sí | Sí |
| Incorporar frontal / reverso / nueva versión | Selecciona tipo y archivo | Sí | Sí |
| Incorporar documento | POST `/member-documents`, `type` y `file` | Sí | Sí |
| Abrir / Descargar DNI actual o histórico | Endpoint protegido de contenido inline/attachment | Sí | Sí |
| Abrir DNI anterior | `/documents?side=front|back` | Sí | Sí |
| Ver / Cerrar histórico documental | Expande y carga bajo demanda | Sí | Sí |
| Reintentar histórico / Cargar más | GET paginado; reintento también tras fallo de página | Sí | Sí |
| Ver contrato firmado / Generar PDF firmado | `/api/contracts/[contractId]/pdf`, pestaña nueva | Sí | Sí |

Matices de permisos: PATCH general permite a STAFF modificar `expiresAt`; los tres controles dedicados de estado usan una ruta ADMIN. No homogeneizar estas políticas por intuición. Perfil comercial, descuento y notas se muestran/editan solo como ADMIN y history minimiza esos campos. `/access-logs` usa `requireAuth`, más amplio que el guard STAFF/ADMIN de history, overview, contratos, fotos y documentos. El PDF exige STAFF/ADMIN; su opción forzada requiere ADMIN, pero la ficha no la solicita. No hay botones de borrar socio, eliminar foto, eliminar DNI, editar contrato firmado ni anular una retirada en esta ficha; las anulaciones se muestran como información. El flujo interno de firma y TPV no se rediseña en este sprint.

## 4. Fotografía: conservar el flujo

`MemberPhotoCard` recibe `memberId`, `initialPhotoUrl`, `canUpload`, `onUploaded`. Sus estados son `photoUrl`, `uploading`, `error` y una referencia al input. No realiza GET propio. Acepta selección JPG/JPEG/PNG/WEBP; el texto anuncia 5 MB y el servidor valida el archivo mediante `validateImageFile`.

POST guarda una referencia de storage, actualiza el socio, intenta retirar la foto anterior, registra auditoría y devuelve URL firmada. El componente muestra la URL devuelta antes de esperar `onUploaded`; el callback refresca history y contratos. Si ese refresco falla, puede mostrarse «No se pudo subir la foto» aunque la escritura ya haya ocurrido. No cambiar este comportamiento dentro de la extracción visual.

TTL predeterminado: `STORAGE_SIGNED_URL_TTL_SECONDS = 15 * 60`; la caché servidor deja 60 segundos de margen. Releer history puede resolver otra URL, pero la tarjeta no tiene temporizador, renovación al recuperar foco ni manejador `onError` de imagen. Una URL no nula presenta «FOTO ADJUNTADA» aunque falle el recurso. El fallback «Sin foto» solo depende de ausencia de URL. Una imagen ya cargada puede seguir visible tras caducar la URL; una nueva apertura o recarga puede fallar. No confundir esa situación con ausencia de fotografía.

La imagen es cuadrada, `object-cover`, y puede recortar bordes. En móvil ocupa el ancho de la tarjeta y precede al nombre, con abundante texto intermedio. Desde `md`, su grid interno fija 180 px para imagen mientras la página también cambia a fila: riesgo de competir con identidad. «Abrir foto» está dentro del bloque `canUpload`; conservar la política actual. Mantener estados, reset del input, errores y callback al ajustar únicamente presentación futura.

## 5. DTO overview: contrato exacto y límites

| Bloque | Campos reales |
| --- | --- |
| identity | `id: number`, `memberNumber: string | null`, `fullName: string`, `joinedAt: string` |
| operational | `active: boolean`, `expiresAt: string | null`, `expired: boolean`, `hasContract: boolean`, `canWithdraw: boolean`, `reasons: { inactive: boolean; noContract: boolean; expired: boolean }`, `hasRfid: boolean` |
| contract | `{ id: number; signedAt: string } | null` |
| consumption | `monthlyGrams: number`, `monthlyLimitG: number | null`, `periodStart: string`, `periodEndExclusive: string` |
| documentation | `hasDniFront: boolean`, `hasDniBack: boolean` |
| access | `{ lastEvent: { type: string; createdAt: string } | null }` |

Cabecera: identidad, active, expiresAt y expired. Resumen separado: hasContract, contrato y firma, hasRfid, canWithdraw/reasons, gramos/límite/periodo, disponibilidad DNI y último evento. `type` de acceso es string: contemplar un valor desconocido, sin asumir unión IN/OUT en el DTO.

No hay foto, DNI personal, contacto, código RFID, URL de documentos/PDF, permisos, perfil comercial, lista contractual, lista de ventas, saldo restante, presencia actual en el club ni total histórico de accesos. Un null en límite no equivale a cero ni prueba «ilimitado»; mostrar «Sin límite informado». Null de contrato significa ausencia en esa lectura. Null de evento significa «Sin accesos registrados», no error. Ausencia del DTO por fallo significa «No disponible», no todos los booleanos en false.

El endpoint reutiliza `getMemberOperationalFacts`, `composeMemberOperationalStatus`, `getMonthRange`, `getMonthlyGramTotal` y `resolveMemberDni`. No recalcular caducidad, elegibilidad, límites o consumo en React. `canWithdraw` es elegibilidad básica, no autorización final del TPV ni garantía de cuota. La disponibilidad DNI no implica validación ni obligatoriedad. No deducir denegación por no tener RFID/DNI. El overview combina lecturas independientes, no una instantánea transaccional.

## 6. Propuesta visual acotada

Conservar `PageHeader`, fondo arena, paneles claros, color burdeos, tipografía y botones existentes. La cabecera debe priorizar nombre y número, con estado y fecha claramente etiquetados. No encerrar nombre largo en una línea con elipsis.

Esquema orientativo de escritorio, no componente implementado:

```text
┌──────────────────────────────────────────────────────────────┐
│ Fotografía     Nombre completo del socio                     │
│ y controles    Socio nº 00123                                │
│ existentes     [Activo / Bloqueado]  Vencimiento: fecha       │
│                                                              │
│ [Contrato / Firma] [Ir al TPV] [Ver historial] [Editar socio]  │
└──────────────────────────────────────────────────────────────┘
┌ Resumen operativo ───────────────────────────────────────────┐
│ Elegibilidad básica y motivos                                │
│ Contrato / firma       Consumo mensual / límite / periodo     │
│ RFID asignado          DNI frontal y reverso disponibles      │
│ Último acceso          Estado de actualización / reintentar   │
└──────────────────────────────────────────────────────────────┘
Datos personales · Perfil comercial ADMIN · Administración
Formulario y RFID · Dos tarjetas DNI · Contratos · Actividad
```

En móvil: identidad primero en el orden de lectura, estado/fecha debajo, fotografía y sus controles a continuación, acciones apiladas a ancho completo. No usar una barra fija que tape contenido ni esconder las cuatro acciones en un menú. Mantener un único ejemplar de cada botón principal: trasladar los existentes a la cabecera, dejando administración y formulario en el cuerpo.

Para compactar fotografía sin duplicar imágenes, proponer una variante exclusivamente presentacional de `MemberPhotoCard`: conservar la instancia, sus props de flujo y todas sus acciones; adaptar distribución y tamaño, sin nuevos fetches ni modificar carga, storage, caducidad o recuperación. Revisar esta variante en 7.6.4.2 antes de aprobarla. No limitar por CSS el ancho de la tarjeta actual sin adaptar su grid de 180 px.

El resumen no añade una segunda botonera ni sustituye secciones. Mostrar texto además de color; distinguir «Activo» de «Puede retirar: elegibilidad básica». Mostrar fecha también cuando esté caducada. Los errores/carga permanecen visibles con `role=status`/`alert` y reintento; datos conservados se identifican como último estado confirmado. La administración sigue fuera de las acciones principales.

## 7. Componentes y propiedad de datos

| Pieza propuesta | Props conceptuales | Estado y responsabilidad |
| --- | --- | --- |
| `MemberProfileHeader` | identidad mínima; active/expiresAt/expired; loading/error; `editing`; permisos explícitos; callbacks editar/reintentar; slot de foto | Presentación, semántica y distribución. Sin fetches, reglas de negocio ni copia local de datos |
| `MemberProfileActions` (solo si simplifica la cabecera) | `memberId`, `editing`, `canEdit`, `onToggleEdit` | Cuatro acciones existentes, mismas rutas/ancla. Sin estado ni consultas |
| `MemberOperationalSummary` | bloques operational/contract/consumption/documentation/access del DTO; loading/error; indicador de dato conservado; `onRetry` | Presenta datos y motivos ya calculados. Sin cargar overview ni interpretar permisos |
| `MemberPhotoCard` existente | props actuales; posible variante de presentación | Mantiene subida, URL y errores locales; no duplicar como avatar más segunda tarjeta |
| `MemberDocumentsCard` existente | props actuales y permiso STAFF/ADMIN | Mantiene tarjetas, lecturas, versiones, preview e histórico; fuera de la cabecera |
| Página coordinadora existente | id y sesión | Dueña de lecturas compartidas, formulario, mutaciones, versiones RFID y callbacks |

7.6.4.2 usa las fuentes actuales pasadas por props. 7.6.4.3 incorpora una única lectura de overview en la página (o un hook pequeño dedicado a esa lectura) y retira allí la lectura de operational-status. La misma respuesta alimenta cabecera y resumen; nunca ambos hacen fetch por separado. Otros consumidores de operational-status no se cambian.

En 7.6.4.3, identidad visible de cabecera y estado/fecha proceden de overview; history sigue abasteciendo foto, datos personales, formulario, RFID e historial. No hacer fallback operativo silencioso a history. Si falla overview, conservar solo su último dato confirmado o mostrar no disponible. Usar secuencia/abortos por id y no dejar que respuestas anteriores a mutaciones sobrescriban el estado posterior. La key por id se conserva.

Invalidación propuesta: estado/fecha actualizan overview independientemente del resultado de history; RFID refresca overview después de sincronizar su escritura confirmada, sin tocar la recuperación 409; guardar identidad conserva inicialmente la recarga actual. Foto mantiene su callback actual. Contrato/TPV mantienen su navegación: al volver a montar se relee overview. No introducir polling. Si se muestra disponibilidad DNI en resumen, añadir en 7.6.4.3 un callback de cambio confirmado/reconciliado desde el componente documental hacia el coordinador para invalidar overview, sin mover sus consultas al padre. No repetir POST ante incertidumbre. Al recuperar foco, una eventual política de refresco debe centralizarse y deduplicarse.

## 8. Compatibilidad funcional obligatoria

La propuesta conserva edición y sus campos; contratos/firma/PDF; enlace al TPV sin cambiar su selección; RFID manual, lector, confirmación de desasignación, bloqueos y recuperación; estados y permisos; foto con su flujo; documentación; ancla e historial completo actual.

DNI es una restricción de diseño: conservar las DOS tarjetas grandes anverso/reverso, previews de imagen y representación PDF, badges INCORPORADO/ANTERIOR/SIN DOCUMENTO, fallback anterior y acciones Abrir/Descargar/Incorporar nueva versión. Mantener histórico paginado, errores y reconciliación. Las previews actuales tienen altura 256 px (288 desde sm); la cuadrícula pasa a dos columnas en md. Los indicadores compactos del resumen son adicionales, nunca una sustitución por lista genérica. No se altera esa presentación validada en Sprint 7.5.

## 9. Responsive: auditoría estática y aceptación futura

El shell añade 16 px laterales y el main otros 16 px en móvil. A 375 px quedan aproximadamente 311 px antes del panel; a 320 px, 256 px. Cabecera resta unos 40 px más; tarjetas anidadas del cuerpo pueden restar otros 40 px por nivel. Estos cálculos son aproximados, sin medición de navegador.

| Ancho | Hallazgo / riesgo actual | Criterio para la cabecera y resumen |
| --- | --- | --- |
| Escritorio 1280–1440 | Main max-w-7xl; foto completa dentro de fila md compite con nombre; cuatro acciones solo desde xl | Identidad con min-width:0, foto acotada con grid compatible, acciones visibles y envolventes |
| Tablet 768–1024 | Cambian simultáneamente fila de cabecera, grid interno de foto a 180 px y DNI a dos columnas | Preferir cabecera apilada hasta lg si falta espacio; resumen dos columnas solo cuando quepa; comprobar 768 y 1024 |
| Móvil 375 | Foto y textos preceden al nombre; acciones quedan debajo de datos personales/comerciales | Nombre y estado al inicio; acciones en una columna; textos completos y scroll vertical natural |
| Móvil 320 | Poco ancho por padding acumulado; RFID actual sin break, etiquetas largas y botones dentro de paneles overflow-hidden pueden desbordar o recortarse | min-w-0, ruptura de identificadores largos, botones con salto de línea y ancho completo; no ocultar overflow para disimular |

Protecciones existentes: nombre/DNI/contacto con `break-words`, acciones principales min-h-12 y grid de una columna, entradas con min-width:0 global, DNI con min-w-0 y nombres de archivo `overflow-wrap:anywhere`. Persisten riesgos en número de socio largo, código RFID y mensajes, notas comerciales con cadenas sin espacios, nombres de plantilla contractual, cantidades grandes y botones con padding anidado. `overflow-hidden` en varios paneles puede recortar contenido desbordado y foco. No se ha demostrado un overflow real en ejecución.

Validación futura obligatoria en 1440, 1024, 768, 375 y 320 px: nombre de varias líneas, identificadores largos, sin foto, foto rota/caducada, carga/error con y sin snapshot, sesión pendiente, STAFF/ADMIN, formulario abierto, lector RFID, ausencia de contrato, DNI imagen/PDF/legacy y errores. Comprobar ancho de documento sin scroll horizontal, tabulación y foco visibles, zoom 200%, etiquetas sin truncado, objetivos táctiles de al menos 44 px y acceso a las cuatro acciones sin menús. La auditoría del shell/navegación global no equivale a un rediseño de esos elementos.

## 10. Riesgos y dependencias

P1 indica incoherencia operativa o pérdida funcional que debe impedir aceptar la implementación; P2, mejora o limitación visual/técnica que debe quedar trazada.

| Prioridad | Riesgo | Tratamiento previsto |
| --- | --- | --- |
| P1 | Badge activo y botón de estado con fuentes divergentes | Compartir fuente operativa al integrar overview; no decidir desde un snapshot antiguo sin indicarlo |
| P1 | Reescribir fecha por extracción del formulario | Conservar `expirationEdited` y omisión de fecha no editada; respetar política STAFF real |
| P1 | Perder concurrencia RFID o usar hasRfid como código | Mantener refs, valor esperado y 409; refrescar indicador aparte |
| P1 | Ocultar DNI o sustituir tarjetas validadas | Mantener componentes y dos tarjetas; regresión visual explícita |
| P1 | Convertir error en false/0 o canWithdraw en permiso definitivo | Estado desconocido explícito; reglas servidor intactas |
| P1 | Overview obsoleto tras mutaciones/documentos | Un propietario, invalidación y descarte de respuestas antiguas |
| P2 | Foto caducada/rota y error de callback atribuido a subida | Documentado como deuda preexistente; no reparar flujo en sprint visual |
| P2 | Foto sobredimensionada y padding excesivo en 320/tablet | Variante de presentación revisada; medición real antes de aceptar |
| P2 | Consulta de contratos tras foto y recarga global tras editar | Conservar inicialmente; optimización aparte, sin expansión de alcance |
| P2 | Botones de guardar/estado sin estado pending dedicado | Riesgo de envíos repetidos preexistente; no introducir nuevos controles duplicados |
| P2 | Total accesos limitado a 100 y confusión de métricas | No reutilizarlo como total global ni como consumo mensual |
| P2 | Fallo de overview afecta todos sus bloques y mezcla lecturas no transaccionales | Error de lectura explícito; evitar promesas de consistencia fuerte |

Dependencias: DTO de 7.6.3 disponible; políticas actuales de sesión; conservación del flujo foto/RFID; pruebas existentes operativas y de DNI; entorno autenticado con datos de prueba para QA visual futura. No se requiere endpoint, esquema ni migración nuevos.

## 11. Plan de implementación propuesto

### 7.6.4.2 — Cabecera profesional

Leer guías Next.js locales aplicables. Extraer solo cabecera y, si aporta claridad, acciones principales. Mantener coordinación y fuentes actuales. Reordenar identidad/foto/estado/fecha y elevar las cuatro acciones conservando destinos y callbacks. Proponer variante presentacional de foto sin cambios de flujo. Dejar datos personales, administración, edición/RFID, DNI, contratos y actividad en sus secciones.

Aceptación: revisión visual en los cinco anchos, teclado/zoom y ambos roles; mismas acciones y número de lecturas de negocio; ni duplicación de imagen ni pérdida de errores/reintento. Ejecutar comprobaciones relevantes de UI operativa, preservación de fecha, RFID y DNI según los scripts existentes, además de lint/typecheck/build apropiados a la implementación. No trasladar toda la página a otro componente.

### 7.6.4.3 — Resumen operativo conectado a overview

Depende de la cabecera revisada. Incorporar un único propietario de overview; sustituir la lectura operativa de esta página y compartirla entre cabecera y resumen. Usar el DTO exacto, sin nuevas reglas. Conservar history para detalle/foto/RFID, contracts para histórico/PDF y access-logs para actividad. Añadir invalidaciones tras cambios confirmados, incluyendo documentación si se muestra su disponibilidad. No ampliar endpoints.

Aceptación: una consulta overview compartida por ciclo; sin consulta operational-status redundante en la ficha; errores y reintento independientes de history; resultados antiguos descartados; ninguna mutación pierde sus garantías. Verificar ausencia de contrato, vencimiento null/caducado, límite null/0, consumo cero, último evento null/desconocido, DNI parcial y cambios RFID. Ejecutar regresiones de overview, operativa, history, RFID y DNI pertinentes y QA responsive. Las reglas finales de ventas/accesos siguen en servidor.

## 12. Validación del bloque de auditoría

Solo se crea `docs/sprint-7.6.4.1-member-header-design.md`. No se ejecutan tests/build porque no hay cambios ejecutables. Validaciones de cierre: `git diff --check` y `git status --short`; el documento nuevo, aún no seguido por Git, debe aparecer como única entrada. `git diff --check` no inspecciona archivos no seguidos, por lo que se revisa además su whitespace explícitamente. No commit, push ni merge.

SPRINT 7.6.4.1 AUDITADO — PENDIENTE DE REVISIÓN
