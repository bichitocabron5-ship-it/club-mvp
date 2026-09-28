# Sprint 7.4.7.3: ContractTemplate, revisión antes de migrar

Estado: SQL preparado, NO aplicado. No se ha consultado ni modificado producción.
La información de producción (legacy 1 y vigente 2 activas) procede del operador.
El checkout incluye el merge de 7.4.7.2 (`dd19606`, PR #72); esto no prueba qué SHA
está desplegado. El writer y los resolvers no se modifican en este sprint.

## Migración y garantía

`20260928120000_contract_template_single_active/migration.sql` ejecuta, en una
transacción explícita READ COMMITTED: advisory lock `(1129598288, 1)`, bloqueo
SHARE ROW EXCLUSIVE de ContractTemplate, relectura y ranking de activas,
desactivación de posiciones mayores que uno e índice único parcial
`ContractTemplate_single_active_key` sobre `active` con `WHERE active = true`.

Ganadora: `createdAt DESC, id DESC`. Nunca se ordena por snapshot ni se fijan IDs.
Con cero activas no se activa ninguna; con una se conserva; con varias se conserva
una. El índice excluye todas las inactivas, por lo que admite cualquier número de
ellas y cero activas. No requiere snapshot. Solo cambia `active` de las perdedoras;
no hay DELETE, backfill, cambio de relaciones, sesiones, contratos, snapshot o PDF.
La legacy sigue disponible por ID mediante `resolveContractTemplateForContract`,
que no filtra por active en su búsqueda histórica.

El advisory lock coordina writers cooperantes. El bloqueo de tabla impide DML
concurrente incluso sin ese protocolo durante limpieza e indexación, dejando
SELECT ordinarios disponibles. READ COMMITTED relee los commits de quienes
terminaron mientras esperábamos. Ambos locks duran hasta COMMIT/ROLLBACK.
Orden obligatorio: advisory ANTES de tabla/filas. Tomar la tabla primero y esperar
el advisory puede formar un ciclo con el writer actual. El writer active=false
no toma advisory, termina su INSERT y libera el bloqueo que espera la migración.
No cambiar el protocolo ni ejecutar DDL competidor durante esta ventana.

Después del commit, el índice impide dos true incluso ante SQL defectuoso o
concurrente que omita advisory. Una operación que colisiona espera o falla con
SQLSTATE 23505; nunca quedan dos activas confirmadas. Dos activaciones cooperantes
pueden ambas tener éxito secuencialmente: la última reemplaza la anterior.
Esto garantiza como máximo una, no exige que siempre exista alguna.

## Fallos

`lock_timeout=15s` y `statement_timeout=60s` locales limitan las esperas y el trabajo
de cada sentencia. Si un timeout, el UPDATE o CREATE INDEX falla, PostgreSQL aborta
la transacción; no se confirma el saneamiento sin índice. No hay CONCURRENTLY,
IF NOT EXISTS ni captura que oculte errores. Un nombre de índice ya ocupado falla.
Al desconectar se revierte una transacción abortada. No reactivar perdedoras ni
borrar el índice como rollback normal. Revisar causa, datos e historial de Prisma.
Si Prisma registra una migración fallida, comprobar primero que el SQL se revirtió;
solo después, con revisión operativa, marcarla rolled-back y reintentar deploy.
Si hubo pérdida de conexión alrededor del COMMIT, comprobar índice y datos antes
de resolver el historial: no asumir rollback ni marcar applied a ciegas.

## Prisma

Decisión final B: índice DB-managed exclusivamente en migration.sql, sin activar
`partialIndexes`. Prisma y @prisma/client instalados: ambos 7.8.0; motor
`3c6e192761c0362d496ed980de936e2f3cebcd3a`. La opción A es sintácticamente válida
en esta versión y genera el predicado esperado, pero el writer no la necesita
para UPDATE/INSERT. B evita introducir preview para una garantía que ya aplica
PostgreSQL. No se sustituye por unicidad total del booleano.

Evidencia del motor exacto: `apply_partial_index_feature_gating` marca los índices
parciales cuando la preview está apagada; `created_indexes` y `dropped_indexes`
excluyen los marcados `is_stripped_partial`. Para este schema sin otros índices
en active, no se programa DROP/CREATE por omitir la declaración parcial.
Es inspección del código del motor, NO una ejecución contra PostgreSQL.

- `migrate status` compara historial local con `_prisma_migrations`; no verifica
  que el índice exista, ni su predicado ni drift físico.
- `migrate deploy` aplica SQL pendiente, incluida esta transacción explícita; no
  sincroniza schema.prisma ni elimina un índice por faltar en él, ni detecta drift.
- `migrate dev` reproduce el SQL en shadow DB. Con la versión/configuración actual,
  el diff omite la gestión de este índice parcial; su ausencia o un cambio de
  predicado tampoco quedan garantizados por la detección de drift.
- `migrate diff` basado solo en schema.prisma NO crea este índice. Para reconstruir
  la DB hay que reproducir las migraciones. Un diff vacío no prueba su existencia.
- Revisar manualmente el índice tras cambios de tabla, upgrades de Prisma o una
  futura activación de partialIndexes/db pull; no asumir el mismo comportamiento
  en otra versión. No ejecutar db push/migrate dev/db pull en producción.

`prisma validate` sigue siendo correcto sin modelar el índice: valida el schema,
no la garantía DB. Replay/drift real sigue sin probarse por falta de PostgreSQL
aislado. No se afirma «sin drift».

Fuentes fijadas al motor instalado:
[feature gating](https://github.com/prisma/prisma-engines/blob/3c6e192761c0362d496ed980de936e2f3cebcd3a/schema-engine/connectors/sql-schema-connector/src/lib.rs),
[exclusión de índices parciales del diff](https://github.com/prisma/prisma-engines/blob/3c6e192761c0362d496ed980de936e2f3cebcd3a/schema-engine/connectors/sql-schema-connector/src/sql_schema_differ/table.rs),
[ejecución de migraciones](https://github.com/prisma/prisma-engines/blob/3c6e192761c0362d496ed980de936e2f3cebcd3a/schema-engine/connectors/sql-schema-connector/src/flavour/postgres/connector/native/mod.rs),
[bloqueos PostgreSQL](https://www.postgresql.org/docs/17/explicit-locking.html).

El motor envía las sentencias por separado sobre la misma conexión. La atomicidad
depende del BEGIN/COMMIT de este SQL, no de una envoltura automática de Prisma.
Usar conexión directa o pooler de sesión autorizado para Prisma Migrate, con rol
propietario/DDL y visibilidad de todas las filas. No un pooler de transacciones.

## Cobertura y PostgreSQL aislado

`npm.cmd run test:contract-template-migration` comprueba el contrato SQL mediante
read/assert, siguiendo el patrón existente de tests del snapshot: orden de locks,
transacción, ranking, único parcial, exclusión de inactivas, ausencia de IDs fijos,
solo active modificado, lista cerrada de sentencias y resolución histórica por ID.
Se ejecuta también en npm run ci y en GitHub Actions. Es cobertura estática,
no una simulación presentada como prueba PostgreSQL.

No se encontraron psql/postgres/initdb/docker en PATH, binarios en las ubicaciones
habituales de Program Files ni servicios PostgreSQL/Docker. El repositorio no
aporta un servidor de test: CI solo configura una URL dummy. No se reutiliza
DATABASE_URL ni se intenta conectar a ella. PostgreSQL real aislado: NO probado.

Límite de evidencia, no un defecto reproducido del SQL. La verificación real del
predeploy será controlada y no incluirá carreras ni datos de prueba en producción.
Si se habilita una instancia desechable, ejecutar allí esta matriz con datos
sintéticos, reiniciando el fixture entre casos:

| Caso | Resultado esperado |
| --- | --- |
| 0 activas | 0; índice creado |
| 1 activa | misma fila y todas sus columnas intactas |
| 2 activas con fechas distintas | gana fecha mayor, aunque tenga ID menor |
| Empate de fechas | gana ID mayor |
| Varias inactivas más activas | inactivas intactas, solo perdedoras cambian active |
| Segunda INSERT/UPDATE a true tras migrar | 23505; rollback de la operación |
| Nuevas INSERT a false | todas permitidas |
| Ganadora sin snapshot | conserva esa ganadora; snapshot no influye |
| Nombre de índice ocupado o UPDATE que falla | rollback íntegro de saneamiento |
| Writer cooperante antes/después del lock | espera sin ciclo, resultado <=1 activa |
| Writer sin advisory durante/después del saneamiento | espera por tabla; luego respeta índice |

Comparar cada fila antes/después excluyendo únicamente active, y comprobar que
otras tablas permanecen intactas. Verificar también replay e introspección del
índice en esta instancia. No ejecutar estos fixtures contra producción.

## Predeploy de producción: plan exacto, NO ejecutado

1. Confirmar en la plataforma que el deployment saludable de main contiene
   `dd19606`/7.4.7.2. Confirmar que el artefacto a migrar incluye esta migración
   revisada. Reservar una ventana sin activaciones administrativas/bootstrap ni
   otros despliegues; así la ganadora revisada no cambia entre preflight y lock.
2. Como admin, hacer GET `/api/contract-templates` con sesión autenticada. Guardar
   IDs, active, createdAt y documentSnapshotId (no URLs firmadas en tickets/logs).
   Filtrar todas las active=true y ordenar createdAt DESC, id DESC: debe ganar 2
   con los datos conocidos. Si gana otra, faltan filas o cambian los datos, DETENER
   y revisar; nunca modificar SQL para forzar 2. Confirmar que 1 está presente.
3. Confirmar snapshot válido de la ganadora: ID no nulo, registro existente y
   bytes comprobados con `verifyContractDocumentSnapshot` del helper actual
   (longitud, SHA-256, tamaño y PDF válido), mediante herramienta administrativa
   de lectura con acceso autorizado. No basta el ID devuelto por GET. No crear ni
   reparar snapshot en este paso; no exportar bytes/documentos a logs. Si no se
   puede verificar, detener. SQL de lectura para listar candidatas y metadatos:

   ```sql
   SELECT t."id", t."active", t."createdAt", t."documentSnapshotId",
          s."sha256", s."byteLength", octet_length(s."bytes") AS stored_length
   FROM "ContractTemplate" t
   LEFT JOIN "ContractDocumentSnapshot" s ON s."id" = t."documentSnapshotId"
   WHERE t."active" = true
   ORDER BY t."createdAt" DESC, t."id" DESC;
   ```

4. En entorno operativo autorizado, con destino comprobado y credenciales de
   migración (conexión directa/pooler de sesión, rol DDL con visibilidad completa),
   ejecutar `npx.cmd prisma migrate status`. La única pendiente esperada
   es `20260928120000_contract_template_single_active`. Si hay fallidas, divergencia
   u otras pendientes, detener: deploy aplica TODAS las pendientes.
5. Tras aprobación final, ejecutar `npx.cmd prisma migrate deploy` una vez. No
   lanzar la aplicación nueva si falla. Revisar timeouts/fallos según sección anterior.
6. Ejecutar `npx.cmd prisma migrate status`: todo aplicado, sin fallidas. Verificar
   además la definición y validez del índice (status no prueba el constraint):

   ```sql
   SELECT c.relname, i.indisunique, i.indisvalid, pg_get_indexdef(i.indexrelid)
   FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
   WHERE i.indrelid = '"ContractTemplate"'::regclass
     AND c.relname = 'ContractTemplate_single_active_key';
   ```

7. Repetir GET `/api/contract-templates`: exactamente una activa y el mismo ID
   ganador revisado (2 para los datos actuales); mismos snapshot y provenance.
8. Confirmar legacy 1 presente, active=false, documentSnapshotId=null; sus
   referencias históricas por ID siguen intactas. Comparar la lista pre/post.
9. No crear/reemitir SigningSession para probar. Durante la siguiente operación
   legítima, comprobar template/snapshot de la vigente y verificar la firma real
   resultante. Si no existe esa operación, omitir y anotarlo.
10. Revisar logs de migración y aplicación: timeouts, deadlocks, 23505/P2002,
    errores de snapshot y rutas de contratos/firmas. Cerrar ventana de activaciones
    solo tras verificar. No producir una segunda activa como test en producción.

## P1 / P2 / P3 y deuda fuera de alcance

- P1: ninguna incidencia de implementación identificada. Bloquear despliegue si
  la ganadora difiere de la validada, su snapshot falla o hay estado inesperado.
- P2 del diff: ninguna incidencia reproducible pendiente. PostgreSQL real y los
  checks de producción son límites de evidencia/pasos predeploy, no pruebas pasadas.
- P2 deuda externa al diff: idempotencia POST (reintentos pueden crear otra plantilla) y audit de
  activación (trazabilidad del cambio de vigente).
- P3 deuda: errores JSON uniformes, UI de templates y paginación del listado.
  Ninguna de estas cinco deudas se implementa en este sprint.
