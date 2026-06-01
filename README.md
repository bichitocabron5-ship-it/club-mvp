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
- **Caja**: movimientos, gastos, cierre/reapertura diaria y diferencias.
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

- `DATABASE_URL`: conexión PostgreSQL para Prisma.
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
7. Cerrar caja y revisar diferencias.
8. Revisar auditoría ante incidencias.

## Calidad y CI

El workflow `.github/workflows/ci.yml` ejecuta en `push` a `main` y en pull requests:

1. `npm ci`.
2. `npm run lint`.
3. `npm run typecheck`.
4. `npm run build`.

Para checks de CI se usan variables dummy seguras, sin acceso a servicios reales.
