// app/api/products/route.ts
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const products = await prisma.product.findMany({
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(products);
}

export async function POST(req: Request) {
  const body = await req.json();

  const product = await prisma.product.create({
    data: {
      name: body.name,
      unit: body.unit,
      price: Number(body.price),
      stock: Number(body.stock || 0),
    },
  });

  return NextResponse.json(product);
}