import { NextResponse } from "next/server";

// Shared transport policy only; each mutation owns its response DTO.
export function memberMutationJson(body: unknown, init: ResponseInit = {}) {
  return NextResponse.json(body, {
    ...init,
    headers: { "Cache-Control": "private, no-store" },
  });
}
