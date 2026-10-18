/** Stored draft DTOs contain null placeholders for optional request fields.
 * Omit those placeholders when rebuilding a request so the existing schema can
 * apply its defaults. The persisted draft is not mutated or deleted; both save
 * and publication retain server-owned records through their existing merge.
 * Preserve meaningful false, zero, empty strings and arrays exactly.
 */
export function liveEventDraftClientFields(draft:Record<string,unknown>){
  return Object.fromEntries(Object.entries(draft).filter(([,value])=>value!==null&&value!==undefined));
}
