import { supabaseAdmin } from "@/lib/supabase-admin";

const STORAGE_PUBLIC_PREFIX = "/storage/v1/object/public/";

type StorageObjectRef = {
  bucket: string;
  path: string;
  publicUrl: string;
};

function buildPublicUrl(bucket: string, path: string) {
  const baseUrl = process.env.SUPABASE_URL;

  if (!baseUrl) {
    throw new Error("SUPABASE_URL no configurada");
  }

  const normalizedBase = baseUrl.replace(/\/+$/, "");
  return `${normalizedBase}${STORAGE_PUBLIC_PREFIX}${bucket}/${path}`;
}

export function parseAllowedStorageRef(fileUrl: string): StorageObjectRef | null {
  const value = fileUrl.trim();

  if (!value) {
    return null;
  }

  let storagePath = "";

  if (!value.includes("://")) {
    if (value.startsWith("/")) {
      if (!value.startsWith(STORAGE_PUBLIC_PREFIX)) {
        return null;
      }

      storagePath = value.slice(STORAGE_PUBLIC_PREFIX.length);
    } else {
      storagePath = value;
    }
  } else {
    const baseUrl = process.env.SUPABASE_URL;

    if (!baseUrl) {
      return null;
    }

    let parsedValue: URL;
    let parsedBase: URL;

    try {
      parsedValue = new URL(value);
      parsedBase = new URL(baseUrl);
    } catch {
      return null;
    }

    if (parsedValue.origin !== parsedBase.origin) {
      return null;
    }

    if (!parsedValue.pathname.startsWith(STORAGE_PUBLIC_PREFIX)) {
      return null;
    }

    storagePath = parsedValue.pathname.slice(STORAGE_PUBLIC_PREFIX.length);
  }

  const [bucket, ...pathParts] = storagePath.split("/").filter(Boolean);
  const path = pathParts.join("/");

  if (!bucket || !path) {
    return null;
  }

  return {
    bucket,
    path,
    publicUrl: buildPublicUrl(bucket, path),
  };
}

export async function downloadAllowedStorageObject(fileUrl: string) {
  const ref = parseAllowedStorageRef(fileUrl);

  if (!ref) {
    throw new Error("La plantilla debe estar en Supabase Storage del proyecto");
  }

  const download = await supabaseAdmin.storage.from(ref.bucket).download(ref.path);

  if (download.error || !download.data) {
    throw new Error("No se pudo cargar la plantilla PDF");
  }

  return {
    ref,
    bytes: Buffer.from(await download.data.arrayBuffer()),
  };
}
