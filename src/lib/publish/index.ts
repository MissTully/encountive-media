// Direct-to-platform publishing — the last mile after human approval.
// Each platform module takes the same input (public image URLs + a caption +
// the connected account) and returns the platform's post id and permalink.
// All three follow the platforms' official HTTP APIs directly; there is no
// third-party scheduler in between.

import type { SocialPlatform } from "@/types";
import type { PublishInput, PublishResult } from "./shared";
import { publishToInstagram } from "./instagram";
import { publishToFacebook } from "./facebook";
import { publishToLinkedIn } from "./linkedin";

export type { PublishInput, PublishResult } from "./shared";

const PUBLISHERS: Record<
  SocialPlatform,
  (input: PublishInput) => Promise<PublishResult>
> = {
  instagram: publishToInstagram,
  facebook: publishToFacebook,
  linkedin: publishToLinkedIn,
};

export function publishTo(
  platform: SocialPlatform,
  input: PublishInput,
): Promise<PublishResult> {
  const publisher = PUBLISHERS[platform];
  if (!publisher) throw new Error(`Unsupported platform: ${platform}`);
  if (input.imageUrls.length === 0) {
    throw new Error("Nothing to publish — no rendered slides.");
  }
  return publisher(input);
}
