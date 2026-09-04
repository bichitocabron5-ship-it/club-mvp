export const MEMBER_IDENTITY_MAX_INPUT_LENGTH = 40;

const MEMBER_IDENTITY_PERIPHERAL_WHITESPACE = new Set([
  "\t",
  "\n",
  "\r",
  " ",
  "\u00A0",
  "\u2007",
  "\u202F",
]);
const MEMBER_IDENTITY_FORMAT_PATTERN = /[ \u00A0.-]/g;
const MEMBER_IDENTITY_ASCII_LOWERCASE_PATTERN = /[a-z]/g;

function stripPeripheralMemberIdentityWhitespace(value: string): string {
  let start = 0;
  let end = value.length;

  while (
    start < end &&
    MEMBER_IDENTITY_PERIPHERAL_WHITESPACE.has(value[start])
  ) {
    start += 1;
  }

  while (
    end > start &&
    MEMBER_IDENTITY_PERIPHERAL_WHITESPACE.has(value[end - 1])
  ) {
    end -= 1;
  }

  return value.slice(start, end);
}

export function normalizeMemberIdentity(value: string): string {
  return stripPeripheralMemberIdentityWhitespace(value)
    .replace(MEMBER_IDENTITY_FORMAT_PATTERN, "")
    .replace(MEMBER_IDENTITY_ASCII_LOWERCASE_PATTERN, (char) =>
      String.fromCharCode(char.charCodeAt(0) - 32),
    );
}
