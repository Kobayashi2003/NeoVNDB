-- vn.c_released, c_languages, c_platforms, c_developers and chars.c_lang.
-- Adapted from vndb sql/func.sql: update_vncache() and the c_lang trigger.
-- The `hidden` conditions are dropped because hidden entries never reach the
-- dump; everything else is unchanged.
--
-- The four vn columns are computed as grouped aggregates and applied in one
-- UPDATE. Written as correlated subqueries instead, this scans the release
-- tables once per VN and takes forty minutes rather than seconds.
WITH released AS (
    -- Earliest official, dated, non-trial release. A partial release counts;
    -- an unofficial one does not.
    SELECT rv.vid, MIN(r.released) AS val
      FROM releases r
      JOIN releases_vn rv ON rv.id = r.id
     WHERE rv.rtype <> 'trial' AND r.released <> 0 AND r.official
     GROUP BY rv.vid
), languages AS (
    -- Machine translations do not count, and neither does anything unreleased.
    -- Unlike c_released this does not require official, so fan translations
    -- are included.
    SELECT rv.vid, array_agg(DISTINCT rt.lang ORDER BY rt.lang) AS val
      FROM releases_titles rt
      JOIN releases r ON r.id = rt.id
      JOIN releases_vn rv ON rv.id = r.id
     WHERE rv.rtype <> 'trial'
       AND NOT rt.mtl
       AND r.released <= to_char(now(), 'YYYYMMDD')::int
     GROUP BY rv.vid
), platforms AS (
    SELECT rv.vid, array_agg(DISTINCT rp.platform ORDER BY rp.platform) AS val
      FROM releases_platforms rp
      JOIN releases r ON r.id = rp.id
      JOIN releases_vn rv ON rv.id = r.id
     WHERE rv.rtype <> 'trial'
       AND r.released <= to_char(now(), 'YYYYMMDD')::int
     GROUP BY rv.vid
), developers AS (
    SELECT rv.vid, array_agg(DISTINCT rp.pid ORDER BY rp.pid) AS val
      FROM releases_producers rp
      JOIN releases r ON r.id = rp.id
      JOIN releases_vn rv ON rv.id = r.id
     WHERE rp.developer AND r.official
     GROUP BY rv.vid
)
UPDATE vn
   SET c_released   = COALESCE(released.val, 0),
       c_languages  = COALESCE(languages.val, '{}'),
       c_platforms  = COALESCE(platforms.val, '{}'),
       c_developers = COALESCE(developers.val, '{}')
  FROM (SELECT id FROM vn) v
  LEFT JOIN released   ON released.vid   = v.id
  LEFT JOIN languages  ON languages.vid  = v.id
  LEFT JOIN platforms  ON platforms.vid  = v.id
  LEFT JOIN developers ON developers.vid = v.id
 WHERE vn.id = v.id;

-- A character's name language: among the VNs it appears in, the one whose
-- olang matches a language this character actually has a name in. Ties break
-- on the earliest released VN, so c_released above has to be settled first.
-- Characters with no match keep the default.
UPDATE chars SET c_lang = x.lang
  FROM (
    SELECT DISTINCT ON (cv.id) cv.id, cn.lang
      FROM chars_vns cv
      JOIN chars_names cn ON cn.id = cv.id
      JOIN vn v ON v.id = cv.vid
     WHERE v.olang = cn.lang
     ORDER BY cv.id, v.c_released
  ) x
 WHERE chars.id = x.id AND chars.c_lang <> x.lang;
