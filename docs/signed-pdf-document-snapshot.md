# PDF firmado desde snapshot contractual — 7.4.4.4

`ensureSignedContractPdf` se invoca desde GET `/api/contracts/[id]/pdf` y
desde el POST/replay de firma pública después de persistir la firma.

Para un PDF todavía no publicado y `MemberContract.documentSnapshotId != null`,
el generador carga exclusivamente ese ID persistido. Exige que la plantilla
asociada exista, coincida con `contractTemplateId` y apunte al mismo snapshot.
El helper productivo verifica tamaño, SHA-256, bytes y PDF válido de al menos
tres páginas. Su copia verificada es exactamente la entrada del renderer.
Ausencia, corrupción o incoherencia producen un error controlado 409 sin upload.
No hay selección activa, snapshot recibido del cliente ni descarga de `fileUrl`.
Cambiar o eliminar el objeto original de Storage no afecta esta generación.

Con `signedPdfUrl` publicado se reutiliza esa referencia antes de comprobar
provenance; no se lee el snapshot ni se valida la plantilla. Se mantienen el
bloqueo de sustitución por `force`, `upsert:false`, CAS con `signedPdfUrl:null`,
relectura del ganador concurrente y recuperación ante fallos de URL. Los objetos
huérfanos no se adoptan ni se sobrescriben. El modo de emergencia sigue vigente.

Solo el null explícito de `documentSnapshotId` permite el comportamiento legacy:
descargar `fileUrl` de la plantilla ya asociada. Esto no prueba los bytes
originalmente aceptados. No se asigna un snapshot, no se hace backfill y no se
busca una plantilla actual. Sin plantilla histórica resoluble se rechaza.

La firma dibujada sigue siendo `MemberContract.signatureImage` persistida; no
se modifica ningún DTO, endpoint de firma, esquema ni migración.

## Verificación

`node scripts/test-signed-contract-integrity.mjs` ejecuta rutas, generador,
verificador de snapshot y pdf-lib productivos con Prisma/Storage simulados.
Cubre bytes exactos, Storage cambiado/eliminado, snapshot ausente/corrupto,
hash/longitud/PDF/ID inválidos, asociaciones incoherentes, published/replay,
CAS concurrente, legacy explícito y firma persistida. Conserva los casos 7.2.10
de fallos, recuperación, no sobrescritura y force. No prueba PostgreSQL ni
Storage reales. El fixture compartido de signing refleja ahora la asociación
template/snapshot y el null histórico explícito.
