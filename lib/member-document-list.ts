import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { MEMBER_DOCUMENT_TYPE_VALUES, type MemberDocumentListResponse, type MemberDocumentType } from "@/lib/types";

export class MemberDocumentListInputError extends Error {}

type Position = { createdAt: Date; id: number };
type ListOptions = { view: "all" | "current"; limit: number; cursor: Position | null };
const MAX_INT = 2_147_483_647;

function invalid(): never { throw new MemberDocumentListInputError(); }

function signCursor(payload: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("Cursor signing unavailable");
  return createHmac("sha256", secret).update("member-document-list:v1:").update(payload).digest("hex");
}

function encodeCursor(memberId: number, row: Position) {
  const payload = Buffer.from(JSON.stringify([1, memberId, row.createdAt.toISOString(), row.id])).toString("base64url");
  return `${payload}.${signCursor(payload)}`;
}

function decodeCursor(value: string, memberId: number): Position {
  if (value.length > 256 || !/^[A-Za-z0-9_-]+\.[a-f0-9]{64}$/.test(value)) return invalid();
  const [payload, signature] = value.split(".");
  // Missing server configuration is a 500, not a client input error.
  if (!timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(signCursor(payload), "hex"))) return invalid();
  try {
    const decoded: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!Array.isArray(decoded) || decoded.length !== 4) return invalid();
    const [version, owner, date, id] = decoded;
    if (version !== 1 || owner !== memberId || typeof date !== "string" ||
        !Number.isInteger(id) || id < 1 || id > MAX_INT) return invalid();
    const position = { createdAt: new Date(date), id: id as number };
    if (!Number.isFinite(position.createdAt.getTime()) || encodeCursor(memberId, position) !== value) return invalid();
    return position;
  } catch { return invalid(); }
}

export function parseMemberDocumentListOptions(url: URL, memberId: number): ListOptions {
  const query = url.searchParams;
  for (const key of ["view", "limit", "cursor"]) if (query.getAll(key).length > 1) invalid();
  const view = query.get("view") ?? "all";
  if (view !== "all" && view !== "current") return invalid();
  if (view === "current" && (query.has("limit") || query.has("cursor"))) return invalid();
  const rawLimit = query.get("limit") ?? "50";
  const limit = Number(rawLimit);
  if (!/^[1-9]\d*$/.test(rawLimit) || !Number.isInteger(limit) || limit > 100) return invalid();
  const cursor = query.has("cursor") ? decodeCursor(query.get("cursor")!, memberId) : null;
  return { view, limit, cursor };
}

export async function listMemberDocuments(memberId: number, options: ListOptions): Promise<MemberDocumentListResponse> {
  // Consistency within this response only; subsequent pages are fresh reads.
  return prisma.$transaction(async tx => {
    const scope = { memberId, type: { in: [...MEMBER_DOCUMENT_TYPE_VALUES] } };
    // At most six results per aggregation, not an in-memory DISTINCT over history.
    const dates = await tx.memberDocument.groupBy({
      by: ["type"], where: scope, _max: { createdAt: true },
    });
    if (dates.length === 0) return { items: [], nextCursor: null };
    // Max ID must be restricted to the winning date, never independently maximized.
    const winners = await tx.memberDocument.groupBy({
      by: ["type"],
      where: { ...scope, OR: dates.map(row => ({ type: row.type, createdAt: row._max.createdAt! })) },
      _max: { id: true },
    });
    const currentIds = winners.map(row => row._max.id!);
    const rows = await tx.memberDocument.findMany({
      where: {
        ...scope,
        ...(options.view === "current" ? { id: { in: currentIds } } : {}),
        ...(options.cursor ? { OR: [
          { createdAt: { lt: options.cursor.createdAt } },
          { createdAt: options.cursor.createdAt, id: { lt: options.cursor.id } },
        ] } : {}),
      },
      // Same canonical ordering as resolveMemberDni in 7.5.5.
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: options.view === "current" ? MEMBER_DOCUMENT_TYPE_VALUES.length : options.limit + 1,
      select: { id: true, type: true, originalName: true, mimeType: true, byteLength: true, createdAt: true },
    });
    const hasMore = options.view === "all" && rows.length > options.limit;
    const page = hasMore ? rows.slice(0, options.limit) : rows;
    return {
      items: page.map(row => ({
        id: row.id, type: row.type as MemberDocumentType, originalName: row.originalName,
        mimeType: row.mimeType, byteLength: row.byteLength, createdAt: row.createdAt.toISOString(),
        isCurrent: currentIds.includes(row.id),
      })),
      nextCursor: hasMore ? encodeCursor(memberId, page[page.length - 1]) : null,
    };
  }, { isolationLevel: "RepeatableRead" });
}
