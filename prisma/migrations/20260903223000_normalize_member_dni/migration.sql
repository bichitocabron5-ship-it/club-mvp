BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.normalize_member_identity(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT translate(
    translate(
      value,
      ' ' || chr(160) || '.-',
      ''
    ),
    'abcdefghijklmnopqrstuvwxyz',
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  );
$function$;

LOCK TABLE "Member" IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Member"
    WHERE pg_temp.normalize_member_identity(dni) = ''
  ) THEN
    RAISE EXCEPTION 'Member.dni normalization would create empty identities';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT pg_temp.normalize_member_identity(dni) AS normalized_dni
      FROM "Member"
    ) normalized_members
    GROUP BY normalized_dni
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Member.dni normalization would create duplicate identities';
  END IF;
END $$;

WITH normalized_members AS (
  SELECT
    id,
    pg_temp.normalize_member_identity(dni) AS normalized_dni
  FROM "Member"
)
UPDATE "Member" member
SET dni = normalized_members.normalized_dni
FROM normalized_members
WHERE member.id = normalized_members.id
  AND member.dni IS DISTINCT FROM normalized_members.normalized_dni;

DROP FUNCTION pg_temp.normalize_member_identity(text);

COMMIT;
