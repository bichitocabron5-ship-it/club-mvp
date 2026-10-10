# Sprint 7.6.4.2 — Cabecera profesional del socio

## Alcance

Se extrae la cabecera de `app/members/[id]/page.tsx` a `components/member-profile-header.tsx`. Referencia: `docs/sprint-7.6.4.1-member-header-design.md`. Se leyó la guía local de Next.js 16.2.4 sobre Server y Client Components antes de implementar. El componente pertenece al árbol cliente de la página; no necesita declarar una nueva frontera cliente.

Sin integración de `/overview`, cambios de endpoints, esquema Prisma, permisos, reglas operativas ni flujos de contratos, RFID o DNI. No hay dependencias nuevas ni commit/push/merge. El documento 7.6.4.1 ya estaba sin seguimiento al comenzar este bloque y se conserva sin modificar.

## Componente y props

`MemberProfileHeader` es presentacional, sin hooks, fetches, sesión propia ni mutaciones. Su interfaz exportada `MemberProfileHeaderProps` recibe:

| Prop | Fuente / responsabilidad |
| --- | --- |
| `memberId`, `memberNumber`, `fullName` | `data.member` de history; número con fallback nullish a id, conservando ceros iniciales |
| `photo: ReactNode` | Slot con la única instancia de `MemberPhotoCard`, configurada por la página |
| `operational` | Snapshot existente de operational-status: member.active/expiresAt, expired, hasContract; null antes de una lectura válida |
| `loading`, `error` | Estado operativo de la página, sin copia local |
| `hasRfid` | Presencia del código confirmado en history; no se envía el código a la cabecera |
| `editing`, `onToggleEdit` | Estado y callback originales de edición |
| `onRetry` | Callback al refresco operativo original |

Mantiene ACTIVO/BLOQUEADO y MEMBRESÍA CADUCADA según los booleanos del servidor. No compara fechas para calcular caducidad. Presenta la fecha de vencimiento incluso cuando está caducada; null se muestra como «Sin vencimiento». Los badges de contrato y RFID siguen disponibles. No presenta DNI completo, contacto ni condiciones comerciales.

## Integración y acciones

La página conserva todos los fetches, estados, refs, efectos, validación del snapshot, permisos, mutaciones y coordinación de callbacks. La carga inicial sigue dependiendo de history y no cambia su mensaje de error. El padre sigue pasando a foto `canUpload`, `onUploaded={refreshMember}` y una key equivalente a la original por id y URL.

Las cuatro acciones principales aparecen una sola vez en la cabecera, con prioridad visual para Editar, Contrato y TPV:

| Acción | Comportamiento conservado |
| --- | --- |
| Editar socio / Editando socio | `changeEditing(!editing)`; `aria-expanded` refleja el estado |
| Contrato / Firma | `/members/[id]/contract` |
| Ir al TPV | `/sales`, sin añadir preselección ni reglas |
| Ver historial | `#member-history`, ancla conservada |
| Reintentar | Refresco operativo desde la página |

Se retira la antigua botonera del cuerpo y su envoltorio vacío; administración sigue en el cuerpo bajo el mismo guard `authReady && isAdmin`. Activar/Bloquear usa ahora el mismo snapshot que el badge, evitando contradicciones cuando history y operational-status divergen. Mientras no existe snapshot no se inventa la acción inversa: se muestra «Estado no disponible» y permanece el reintento operativo de la cabecera. Con snapshot conservado, la acción y el badge siguen mostrando el último estado confirmado. Renovar y Quitar vencimiento mantienen sus callbacks y permisos originales.

El DNI que antes estaba en cabecera se traslada a Datos personales para conservar su consulta sin sobrecargar la identidad principal. Formulario, perfil comercial, RFID, documentación, contratos e historial mantienen sus contenidos y flujos. No se refactoriza la página completa.

## Permisos

La cabecera no interpreta roles. Las cuatro acciones principales conservan su disponibilidad anterior dentro de la ficha. La página sigue calculando ADMIN y STAFF para fotografía y documentación; mientras la sesión carga no muestra controles de subida. Los tres controles de administración siguen siendo ADMIN. El formulario conserva sus reglas actuales, incluida la edición de fecha por STAFF y los campos comerciales exclusivos de ADMIN.

No se modifica autorización servidor. No se añade un permiso nuevo ni se amplía una acción a otro rol.

## Fotografía

`MemberPhotoCard` incorpora `variant?: "card" | "profile"`, con `card` como valor predeterminado. La variante profile reduce decoración y textos auxiliares, acota el retrato cuadrado a 192 px y coloca los controles bajo la foto. Mantiene formatos/tamaño, selector, botón Subir/Reemplazar, Abrir foto, estado Subiendo, bloqueo durante subida, errores y callback.

El flujo sigue usando el POST original, FormData `image`, URL devuelta y refresco del padre. No se modifica storage, backend ni caducidad. La imagen sigue usando la URL existente y `object-cover`.

Nuevo fallback local: `failedPhotoUrl` registra exclusivamente la URL cuya imagen falló; se retira el `<img>` roto y se muestra «Foto no disponible / No se pudo cargar la imagen». No se elimina la URL ni se confunde el fallo con «Sin foto», que mantiene su fallback. Abrir/Reemplazar continúan disponibles con la política original. Una subida correcta limpia ese error visual y usa la nueva URL; el remontaje por id/URL también reinicia el estado local. No hay renovación automática, polling ni peticiones adicionales al fallar la imagen.

Limitación conservada: si la escritura de foto tiene éxito pero falla `onUploaded`, el mensaje puede atribuir el fallo a la subida. No se cambia ese flujo en este sprint. Las URLs firmadas siguen caducando según el backend (15 minutos por defecto).

## Responsive y accesibilidad

| Tamaño | Estructura preparada |
| --- | --- |
| Escritorio desde xl (1280 px) | Foto a la izquierda, identidad/estado en centro flexible y acciones a la derecha |
| Tablet desde md (768 px) | Foto e identidad en dos columnas; acciones debajo a todo el ancho, en dos columnas |
| Móvil 375/320 px | Identidad primero, foto acotada, cuatro acciones en una columna sin ocultarlas |

La identidad usa `overflow-wrap:anywhere` para cadenas largas y columnas `minmax(0,1fr)`/`min-w-0`. Nombre y número no tienen elipsis. Botones principales de al menos 48 px; foto y reintento, 44 px. No se introduce barra fija, menú de acciones ni librería visual. Se conservan colores arena/burdeos, panel, tipografía y estilos de botones existentes. Se añaden foco visible en acciones, navegación con etiqueta, `time` para la fecha y mensajes `status`/`alert`.

La revisión responsive es estructural y estática. No se usó navegador real: no se afirma ausencia medida de overflow ni validación visual a estos anchos. Queda pendiente QA autenticada en 1440, 1024, 768, 375 y 320 px, con nombres/códigos largos, zoom 200%, teclado, foto ausente/rota, carga/error y ambos roles. El resto de la ficha conserva sus riesgos responsive preexistentes; no se rediseña.

## Pruebas y regresiones

Nuevo `scripts/test-member-profile-header.mjs`, ejecutable con `npm.cmd run test:member-profile-header` e integrado al principio de CI. Usa el harness existente, JSX/callbacks productivos con hooks y HTTP simulados; no es un navegador.

18 casos cubren identidad y fallback del número, slot de foto, rutas, callbacks, estado de edición, activo/bloqueado, caducidad independiente del reloj cliente, contrato/RFID, fecha/null, carga/error/reintento y snapshot conservado. También comprueban acciones visibles y estructura responsive junto con comportamiento, ausencia de fetches/estado/política propia, fallback de imagen en ambas variantes, permisos de foto, POST/pending/reset/callback, recuperación y errores HTTP/red/callback.

La integración ejecuta la página real para ADMIN, STAFF y sesión cargando: verifica cuatro lecturas iniciales sin overview, permisos de administración/foto/DNI, coherencia entre snapshot y acción aunque history discrepe, DNI fuera de cabecera, ancla de historial, edición/cancelación y acceso a Guardar RFID.

Se adaptan dos harness antiguos para recorrer el componente extraído, sin sustituir su implementación por mocks. La fixture de preservación de fecha devuelve ahora un operational-status válido. Las pruebas operativas verifican expresamente badge y acción con la misma fuente y mantienen cobertura de refresco, respuestas fuera de orden, error/reintento y RFID con valor esperado/409. Las aserciones de fecha usan el elemento `time` en lugar del texto antiguo «VÁLIDA HASTA».

Regresiones focalizadas verificadas: 32 comprobaciones operativas, 38 de preservación de fecha y 119 casos de UI documental en la ejecución inicial. Las dos tarjetas grandes de DNI, previews, badges, Abrir/Descargar, versiones e histórico permanecen intactos: no se modifica ni `member-documents-card.tsx` ni `member-document-item.tsx`. Contratos/PDF, TPV, navegación, acciones ADMIN e historial siguen cubiertos por las pruebas nuevas y existentes, con las limitaciones de simulación indicadas.

## Riesgos P1 / P2 / P3

- P1: ninguno identificado en la revisión y CI completo. La coherencia de badge/acción se corrige usando la fuente existente, sin duplicar reglas.
- P2: pendiente verificación visual real, accesibilidad con teclado/zoom y prueba autenticada de subida; el fallback no renueva URLs. Permanecen las limitaciones preexistentes de refresco de foto y snapshots sin actualización en tiempo real.
- P3: se mantiene el refresco de contratos tras subir foto y la recarga global tras guardar edición; optimizarlos queda fuera del bloque. Integrar overview corresponde a 7.6.4.3.

## Validaciones

- `npm.cmd run lint`: correcto.
- `npm.cmd run typecheck`: correcto tras ajustar la prop de número para aceptar undefined como el tipo actual de history.
- `npm.cmd run build`: correcto.
- `npm.cmd run ci`: correcto, exit 0; incluye las 18 pruebas nuevas, las 47 de sensibilidad documental y todas las suites existentes, además de lint, typecheck y build.
- `git diff --check`: correcto; los archivos nuevos también se revisaron explícitamente sin whitespace al final de línea.
- `git status --short`: cinco archivos seguidos modificados, tres archivos nuevos de este bloque y el documento previo de 7.6.4.1 sin seguimiento. No hay cambios en endpoints, Prisma ni componentes DNI.

Archivos del bloque: página de socio, nueva cabecera, tarjeta de fotografía, package.json, nuevo test de cabecera, dos pruebas adaptadas y este documento. El documento 7.6.4.1 es previo y no se ha editado.

SPRINT 7.6.4.2 IMPLEMENTADO — PENDIENTE DE REVISIÓN
