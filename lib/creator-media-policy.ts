export const CREATOR_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export function isCreatorImageFolder(path: string) {
  return /^(?:challenges\/(?:drafts|host-drafts|hybrid-drafts)\/[^/]+\/(?:banner|gallery)|tournaments\/drafts\/[^/]+\/cover|live-events\/(?:drafts|hybrid-drafts)\/[^/]+\/media\/[^/]+)$/.test(path);
}
