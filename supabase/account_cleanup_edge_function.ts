import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export default async (req: Request) => {
  // Verify this is called with proper authorization (e.g., via cron job with secret)
  const authHeader = req.headers.get("authorization");
  const expectedSecret = Deno.env.get("CLEANUP_SECRET");
  
  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // Step 1: Disable Free tier accounts inactive for 60+ days
    const { data: disabledAccounts, error: disableError } = await supabase.rpc(
      "disable_inactive_free_accounts"
    );

    if (disableError) {
      console.error("Error disabling accounts:", disableError);
    } else {
      console.log(
        `Disabled ${disabledAccounts?.length || 0} inactive Free accounts`
      );
    }

    // Step 2: Delete Free tier accounts inactive for 90+ days
    const { data: deletedAccounts, error: deleteError } = await supabase.rpc(
      "delete_inactive_free_accounts"
    );

    if (deleteError) {
      console.error("Error deleting accounts:", deleteError);
    } else {
      console.log(
        `Deleted ${deletedAccounts?.length || 0} inactive Free accounts`
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        disabled: disabledAccounts?.length || 0,
        deleted: deletedAccounts?.length || 0,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Cleanup job error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
