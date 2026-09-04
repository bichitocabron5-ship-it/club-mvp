# Club MVP

Aplicación de gestión operativa para un club: socios, accesos, retiradas, caja, stock, inventario, contratos, firma digital, auditoría, tareas, compras, proveedores y catálogo tipo kiosko.

## Stack

- **Next.js 16 / App Router** con `proxy.ts` para protección optimista de páginas privadas.
- **React 19**.
- **Prisma 7** con PostgreSQL.
- **NextAuth** con credenciales y sesiones JWT.
- **Supabase Storage** para fotos, documentos y contratos.
- **Tailwind CSS 4**.
- **Zod** para validación de entradas.

## Módulos principales

- **Panel operativo**: resumen diario de ventas, caja, stock bajo, accesos, alertas y auditoría según rol.
- **Socios**: altas, edición, estado, RFID, documentos, foto, contratos y trazabilidad.
- **Acceso**: entrada/salida por chapita RFID y salida automática de socios dentro.
- **Retiradas / TPV**: carrito, límites diarios/mensuales, descuentos, stock y movimientos de caja.
- **Caja**: apertura de turno, movimientos, gastos, cierre/reapertura diaria, diferencias y reporte CSV.
- **Inventario**: conteos parciales/completos, confirmación, cancelación y ajustes.
- **Productos**: SKU, categoría, unidad, precios, stock, coste medio, imágenes y catálogo.
- **Compras y proveedores**: entradas de stock y pagos.
- **Contratos y firma**: sesiones públicas por token, plantillas y PDFs firmados.
- **Administración**: usuarios, ajustes del club y auditoría.
- **Catálogo kiosko**: vista pública protegida por contraseña para mostrar productos activos.

## Variables de entorno

Copia `.env.example` a `.env` y completa los valores reales:

```bash
cp .env.example .env
```

Variables obligatorias para ejecución normal:

- `DATABASE_URL`: conexión PostgreSQL para Prisma CLI y runtime. En Supabase
  Session Pooler (`aws-[REGION].pooler.supabase.com:5432`) debe incluir
  `sslmode=require` y `connect_timeout=30`.
- `AUTH_SECRET`: secreto JWT/NextAuth.
- `NEXTAUTH_URL`: URL base de la aplicación.
- `SUPABASE_URL`: URL del proyecto Supabase.
- `SUPABASE_SERVICE_ROLE_KEY`: service role key para operaciones de storage desde servidor.
- `STORAGE_BUCKET`: bucket de documentos/fotos/contratos. Por defecto, `club-uploads`.
- `CATALOG_PASSWORD`: contraseña de acceso al catálogo/kiosko.

## Comandos

```bash
npm run dev        # Desarrollo local
npm run lint       # ESLint
npm run typecheck  # prisma generate + next typegen + TypeScript
npm run build      # prisma generate + next build
npm run ci         # lint + typecheck + build
npm run start      # Servidor de producción tras build
```

> Nota: `next typegen` es necesario antes de `tsc --noEmit` porque Next 16 genera tipos globales para rutas, páginas, layouts y route handlers.

## Base de datos

club-mvp mantiene una sola variable de conexión:

- `DATABASE_URL`: usada por Prisma CLI (`prisma.config.ts`) y por runtime
  (`@prisma/adapter-pg` en `lib/prisma.ts`).

Para Supabase Session Pooler en puerto `5432`, guarda la URL con:

```text
?schema=public&sslmode=require&connect_timeout=30
```

El código completa `sslmode=require` y `connect_timeout=30` cuando detecta un
host `*.pooler.supabase.com`, por lo que una terminal nueva puede ejecutar
Prisma sin modificar temporalmente `$env:DATABASE_URL`. Las URLs locales como
`localhost` no se modifican. No se usa `DIRECT_URL` porque Prisma 7 lee la URL
de migraciones desde `prisma.config.ts`, y la conexión directa de Supabase puede
depender de IPv6.

Generar Prisma Client:

```bash
npx prisma generate
```

Aplicar migraciones en desarrollo:

```bash
npx prisma migrate dev
```

Aplicar migraciones en despliegue/producción:

```bash
npx prisma migrate deploy
```

## Usuarios iniciales

El repo incluye scripts para crear usuarios internos. Define las variables correspondientes en `.env` antes de ejecutarlos:

- `APP_ADMIN_NAME`, `APP_ADMIN_EMAIL`, `APP_ADMIN_PASSWORD`.
- `APP_STAFF_NAME`, `APP_STAFF_EMAIL`, `APP_STAFF_PASSWORD`.

## Seguridad y roles

- Las APIs privadas validan sesión y permisos con helpers server-side.
- `proxy.ts` redirige páginas privadas a `/login` si no hay JWT y limita `/admin/*` a usuarios con rol `ADMIN`.
- Las rutas públicas previstas son `/login`, `/catalog` y `/sign/[token]`.
- Los endpoints públicos de catálogo y firma validan contraseña/cookie o token firmado según corresponda.

## Flujo diario recomendado

1. Iniciar sesión como staff/admin.
2. Revisar panel y alertas.
3. Registrar accesos por RFID.
4. Registrar retiradas desde TPV.
5. Registrar gastos, compras o ajustes si corresponde.
6. Ejecutar conteo de inventario si toca.
7. Abrir o cerrar caja y revisar diferencias.
8. Revisar auditoría ante incidencias.

## Calidad y CI

El workflow `.github/workflows/ci.yml` ejecuta en `push` a `main` y en pull requests:

1. `npm ci`.
2. `npm run lint`.
3. `npm run typecheck`.
4. `npm run build`.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Sprint 2A Operational Readiness

Sprint 2A adds non-destructive operational indexes for frequent dashboard,
audit, access, sales, stock, cash, signing-session, inventory-count, and purchase
queries.

The migration is:

```bash
prisma/migrations/20260601210000_add_operational_indexes/migration.sql
```

Production deployments must apply Prisma migrations with:

```bash
npx prisma migrate deploy
```

## Sprint 2B Public Security And Document Privacy

Sprint 2B hardens the public catalog/kiosko and public signing endpoints without
adding external infrastructure.

### Rate limiting MVP

The app includes an in-memory defensive rate limiter for public-sensitive routes:

- Catalog login: `10` attempts per IP every `10` minutes.
- Catalog products API: `120` requests per IP per minute.
- Catalog logout: `60` requests per IP per minute.
- Public signing session GET: `120` requests per IP per minute and `120` per token per minute.
- Public signing session POST: `12` requests per IP every `10` minutes and `5` per token every `10` minutes.

When the limit is exceeded the API returns `429` with a generic error and a
`Retry-After` header. This limiter is intentionally simple for MVP: it is local
to the current Node.js process and is not global across serverless instances,
regions, deployments, or restarts. For production with multiple instances,
replace `lib/rate-limit.ts` with a shared Redis/Upstash-backed counter using the
same namespace/key/window model.

### Public signing hardening

`/sign/[token]` and `/api/signing-sessions/[token]` now validate public signing
sessions more strictly:

- Tokens must be 48 hex characters.
- Expired sessions are rejected.
- Cancelled or unknown sessions return generic unavailable errors.
- Signing POST only accepts sessions in `PENDING` state and does not accept
  already signed sessions as a mutation target.
- The JSON body is limited to `768 KB` before parsing.
- `signatureImage` must be `data:image/png;base64,...`.
- The decoded signature PNG is limited to `512 KB`.
- Form fields have defensive length limits and generic validation errors.
- Public responses expose only the fields required by the signing UI, not the
  full member record.

Do not log catalog passwords, signing tokens, signature images, DNI images, PDF
URLs, or signed URL values. Audit metadata should record actions and booleans,
not document paths or document contents.

### Document privacy and Supabase Storage

Sensitive documents should live in private Supabase Storage buckets. The storage
helpers can parse both legacy public Supabase URLs and stable `bucket/path`
references, then return temporary signed URLs for client display.

Current signed URL TTL is `15` minutes. Existing data is not migrated, and Sprint
2B does not delete existing files. Replacing photos, DNI files, product images,
or PDFs may leave old objects in storage until a future explicit cleanup task is
implemented.

Recommended Supabase buckets:

- `member-documents`: private bucket for DNI/front/back documents.
- `signed-contracts`: private bucket for generated signed PDFs.
- `contract-templates`: private bucket for base contract PDFs.
- `STORAGE_BUCKET` (default `club-uploads`): private bucket if used for member
  photos, legacy DNI uploads, and product images. Product/catalog APIs now return
  signed image URLs, so this bucket does not need to be public for the app UI.

Required Vercel/Supabase environment configuration remains:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STORAGE_BUCKET`
- `CATALOG_PASSWORD`
- `AUTH_SECRET`
- `NEXTAUTH_URL`

No new environment variables are required for Sprint 2B.

## Sprint 3 Daily Operations And Closing Workflow

Sprint 3 improves daily club operations around cash opening, guided closing,
daily reporting, and basic inventory-count context.

### Apertura de turno/dia

- `/cash` now shows the day state clearly: pending opening, open, closed, or reopened.
- Admin users can open the day once and record `openingCash` as the initial cash.
- The existing unique `DayClosure.day` key prevents duplicate opening/closing rows for the same date.
- Legacy closure rows are treated as `CLOSED` by the migration.

### Cierre diario guiado

- The close flow recalculates sales, cash expenses, cash income, manual cash
  movements, discounts, expected cash, counted cash, and difference on the server.
- A closing note is required when the cash difference is at least `1 EUR` or
  when closing a previously reopened day.
- The close record stores the closing user and timestamp when available.

### Reporte diario CSV

- JSON report: `GET /api/day-closure/report`
- CSV export: `GET /api/day-closure/report?format=csv`
- Historical day: `GET /api/day-closure/report?day=YYYY-MM-DD&format=csv`

The report includes date, sales, expenses, opening cash, expected cash, counted
cash, difference, ticket count, discounts, cash income/expense, top withdrawn
products, closing responsible user, linked inventory count, and closure state.

### Inventario guiado basico

If inventory counts exist for the current day, `/cash` lists open and confirmed
counts as closure options with counted/total line context. Confirmed or open
counts can be linked to the closure using the existing `inventoryCountId` field.
No lots, advanced waste handling, or purchase traceability changes are included.

### Migracion

Sprint 3 adds:

```bash
prisma/migrations/20260719090000_add_day_closure_opening_workflow/migration.sql
```

Apply migrations in deployment/production with:

```bash
npx prisma migrate deploy
```

No new environment variables are required for Sprint 3.
