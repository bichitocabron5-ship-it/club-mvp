const MEMBER_IDENTITY_FORMAT_PATTERN = /[ \u00A0.-]/g;
const MEMBER_IDENTITY_ASCII_LOWERCASE_PATTERN = /[a-z]/g;

export function normalizeMemberIdentity(value: string): string {
  return value
    .replace(MEMBER_IDENTITY_FORMAT_PATTERN, "")
    .replace(MEMBER_IDENTITY_ASCII_LOWERCASE_PATTERN, (char) =>
      String.fromCharCode(char.charCodeAt(0) - 32),
    );
}
