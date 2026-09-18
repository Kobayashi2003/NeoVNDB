/** How much of a work's own content a reader has asked to see.
 *
 *  vndb scores every image on two independent axes -- sexual and violent --
 *  from the votes it collects, and a reader's tolerance for one says nothing
 *  about the other. One "explicit" switch would have to pick a side; two
 *  three-step scales let a reader ask for gore without nudity, or the reverse. */

export type SexualLevel = "safe" | "suggestive" | "explicit"
export type ViolenceLevel = "tame" | "violent" | "brutal"

/** How much of the story a reader is willing to have given away: none, the
 *  minor turns, or everything. Unlike the two above it is also a per-section
 *  control, because a spoiler warning belongs where the spoilers are -- this
 *  is only where each section starts. */
export type SpoilerLevel = 0 | 1 | 2

/** Whether an image's votes put it past what the reader asked for.
 *
 *  A null score means nobody voted, which is not the same as safe -- an
 *  unrated image is treated as the worst case so a reader is never shown
 *  something they asked not to see merely because it went unvoted. */
export function shouldBlur(
  sexual: number | null,
  violence: number | null,
  sexualLevel: SexualLevel,
  violenceLevel: ViolenceLevel,
): boolean {
  const s = sexual ?? 2
  const v = violence ?? 2
  const tooSexual = (sexualLevel === "safe" && s > 0.5) || (sexualLevel === "suggestive" && s > 1.5)
  const tooViolent = (violenceLevel === "tame" && v > 0.5) || (violenceLevel === "violent" && v > 1.5)
  return tooSexual || tooViolent
}
