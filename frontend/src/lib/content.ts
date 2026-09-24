/** Content levels. vndb votes images on two independent axes, so sexual and
 *  violent content are separate three-step scales. */

export type SexualLevel = "safe" | "suggestive" | "explicit"
export type ViolenceLevel = "tame" | "violent" | "brutal"

/** How much the reader lets be spoiled. Also a per-section control; this is
 *  only where each section starts. */
export type SpoilerLevel = 0 | 1 | 2

/** Whether an image exceeds the reader's level. An unvoted image (null) is
 *  treated as the worst case, not as safe. */
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
