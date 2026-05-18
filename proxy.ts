// proxy.ts
import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";

const protectedPaths = [
  "/",
  "/access",
  "/admin",
  "/cash",
  "/expenses",
  "/members",
  "/products",
  "/purchases",
  "/sales",
  "/stock",
  "/suppliers",
];

const adminPaths = [
  "/cash",
  "/expenses",
  "/purchases",
  "/stock",
  "/suppliers",
  "/admin",
];

const publicPaths = [
  "/login",
  "/sign",
];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isPublic = publicPaths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );

  if (isPublic) {
    return NextResponse.next();
  }

  const isProtected = protectedPaths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );

  if (!isProtected) {
    return NextResponse.next();
  }

  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET,
  });

  if (!token) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const isAdminPath = adminPaths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );

  if (isAdminPath && token.role !== "ADMIN") {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/access/:path*",
    "/admin/:path*",
    "/cash/:path*",
    "/expenses/:path*",
    "/members/:path*",
    "/products/:path*",
    "/purchases/:path*",
    "/sales/:path*",
    "/stock/:path*",
    "/suppliers/:path*",
  ],
};
