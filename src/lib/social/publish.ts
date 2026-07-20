// Publish orchestration: fan a rendered video out to selected connected
// accounts, recording one `social_posts` row per destination. Publishing is
// deliberately manual (build-spec constraint: human approval before
// publishing — nothing auto-publishes) and runs in-request like rendering.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { tokenExpired } from "@/lib/social/config";
import { publishLinkedInVideo } from "@/lib/social/linkedin";
import { publishFacebookVideo, publishInstagramVideo } from "@/lib/social/meta";

type Supabase = SupabaseClient<Database>;

export interface PublishOutcome {
  accountName: string;
  platform: string;
  ok: boolean;
  message: string;
}

/**
 * Publish one rendered video to each selected account. Failures are isolated
 * per destination — one platform erroring never blocks the others — and every
 * attempt lands in `social_posts` (published or error) so the history is the
 * audit trail.
 */
export async function publishVideoToAccounts(
  supabase: Supabase,
  orgId: string,
  videoId: string,
  accountIds: string[],
  caption: string,
): Promise<PublishOutcome[]> {
  const { data: video } = await supabase
    .from("videos")
    .select("id, title, status, output_path")
    .eq("id", videoId)
    .single();
  if (!video?.output_path || video.status !== "ready") {
    return [
      {
        accountName: "",
        platform: "",
        ok: false,
        message: "Render the video first — only a finished MP4 can be published.",
      },
    ];
  }

  const { data: accounts } = await supabase
    .from("social_accounts")
    .select(
      "id, platform, external_id, display_name, access_token, token_expires_at, metadata",
    )
    .in("id", accountIds);
  if (!accounts || accounts.length === 0) {
    return [
      {
        accountName: "",
        platform: "",
        ok: false,
        message: "Pick at least one connected account.",
      },
    ];
  }

  // One signed URL shared by every platform fetch. Long TTL: Instagram can
  // take minutes to pull + process, and the URL must outlive that.
  const { data: signed, error: signError } = await supabase.storage
    .from("renders")
    .createSignedUrl(video.output_path, 3600);
  if (signError || !signed) {
    return [
      {
        accountName: "",
        platform: "",
        ok: false,
        message: `Could not sign the video URL: ${signError?.message ?? "failed"}`,
      },
    ];
  }
  const videoUrl = signed.signedUrl;

  // Publish sequentially — platform polling dominates the time anyway, and
  // sequential keeps the signed-URL fetches and error reporting simple.
  const outcomes: PublishOutcome[] = [];
  for (const account of accounts) {
    outcomes.push(
      await publishToAccount(supabase, orgId, videoId, account, videoUrl, caption),
    );
  }
  return outcomes;
}

type AccountRow = {
  id: string;
  platform: string;
  external_id: string;
  display_name: string;
  access_token: string;
  token_expires_at: string | null;
  metadata: unknown;
};

async function publishToAccount(
  supabase: Supabase,
  orgId: string,
  videoId: string,
  account: AccountRow,
  videoUrl: string,
  caption: string,
): Promise<PublishOutcome> {
  const base = { accountName: account.display_name, platform: account.platform };

  const { data: postRow } = await supabase
    .from("social_posts")
    .insert({
      org_id: orgId,
      video_id: videoId,
      account_id: account.id,
      platform: account.platform,
      account_name: account.display_name,
      caption,
    })
    .select("id")
    .single();

  const fail = async (message: string): Promise<PublishOutcome> => {
    if (postRow) {
      await supabase
        .from("social_posts")
        .update({ status: "error", error: message })
        .eq("id", postRow.id);
    }
    return { ...base, ok: false, message };
  };

  if (tokenExpired(account.token_expires_at)) {
    return fail(
      `The ${account.platform} connection has expired — reconnect it on the Social accounts page.`,
    );
  }

  try {
    let result: { postId: string; postUrl: string };
    if (account.platform === "linkedin") {
      result = await publishLinkedInVideo({
        accessToken: account.access_token,
        memberId: account.external_id,
        caption,
        videoUrl,
      });
    } else if (account.platform === "facebook") {
      result = await publishFacebookVideo({
        pageId: account.external_id,
        pageToken: account.access_token,
        videoUrl,
        description: caption,
      });
    } else if (account.platform === "instagram") {
      result = await publishInstagramVideo({
        igUserId: account.external_id,
        accessToken: account.access_token,
        videoUrl,
        caption,
      });
    } else {
      return fail(`Unknown platform: ${account.platform}`);
    }

    if (postRow) {
      await supabase
        .from("social_posts")
        .update({
          status: "published",
          external_post_id: result.postId,
          post_url: result.postUrl,
          published_at: new Date().toISOString(),
        })
        .eq("id", postRow.id);
    }
    return { ...base, ok: true, message: `Published to ${account.display_name}.` };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Publish failed.");
  }
}
