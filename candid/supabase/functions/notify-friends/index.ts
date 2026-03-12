import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const { photoId, sharerId } = await req.json();
  if (!photoId || !sharerId) {
    return new Response(JSON.stringify({ error: "missing params" }), { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Get sharer's username
  const { data: sharer } = await supabase
    .from("users")
    .select("username")
    .eq("id", sharerId)
    .single();

  // Get accepted friendships for the sharer
  const { data: friendships } = await supabase
    .from("friends")
    .select("user_id, friend_id")
    .eq("status", "accepted")
    .or(`user_id.eq.${sharerId},friend_id.eq.${sharerId}`);

  if (!friendships?.length) {
    return new Response(JSON.stringify({ sent: 0 }), { headers: corsHeaders });
  }

  const friendIds = friendships.map((f) =>
    f.user_id === sharerId ? f.friend_id : f.user_id
  );

  // Get push tokens for all friends
  const { data: friends } = await supabase
    .from("users")
    .select("push_token")
    .in("id", friendIds)
    .not("push_token", "is", null);

  const tokens = (friends ?? []).map((f) => f.push_token).filter(Boolean);

  if (!tokens.length) {
    return new Response(JSON.stringify({ sent: 0 }), { headers: corsHeaders });
  }

  // Expo Push API accepts up to 100 messages per request
  const messages = tokens.map((to) => ({
    to,
    title: "candid",
    body: `${sharer?.username ?? "someone"} just shared a photo`,
    sound: "default",
    data: { type: "friend_shared", photoId },
  }));

  await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(messages),
  });

  return new Response(JSON.stringify({ sent: tokens.length }), { headers: corsHeaders });
});
