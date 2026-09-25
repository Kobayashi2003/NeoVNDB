-- The images table read whole, for the crawler that mirrors ahead of readers.
-- name: ImageRefs :many
-- Every image vndb records, for the image crawler; newest first.
SELECT kind, num
  FROM images
 WHERE kind IN ('cv', 'ch', 'sf')
 ORDER BY num DESC;
