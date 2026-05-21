const MAX_RFID_LENGTH = 64;

export function normalizeRfidCode(input: string): string {
  const value = String(input ?? "");
  const withoutWhitespace = value.replace(/[\s\u00A0]+/g, "");
  const printableChars = Array.from(withoutWhitespace).filter((char) => {
    const code = char.charCodeAt(0);
    return code >= 32 && code !== 127;
  });

  return printableChars.join("").slice(0, MAX_RFID_LENGTH);
}
