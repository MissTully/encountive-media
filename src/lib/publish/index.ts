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

import type { PublishVideoInput } from "./shared";
import { publishVideoToInstagram } from "./instagram";
import { publishVideoToFacebook } from "./facebook";
import { publishVideoToLinkedIn } from "./linkedin";

export type { PublishVideoInput } from "./shared";

const VIDEO_PUBLISHERS: Record<
  SocialPlatform,
  (input: PublishVideoInput) => Promise<PublishResult>
> = {
  instagram: publishVideoToInstagram,
  facebook: publishVideoToFacebook,
  linkedin: publishVideoToLinkedIn,
};

/** Publish a rendered MP4 to one platform (Reel / Page video / video post). */
export function publishVideoTo(
  platform: SocialPlatform,
  input: PublishVideoInput,
): Promise<PublishResult> {
  const publisher = VIDEO_PUBLISHERS[platform];
  if (!publisher) throw new Error(`Unsupported platform: ${platform}`);
  return VIDEO_PUBLISHERS[platform](input);
}
