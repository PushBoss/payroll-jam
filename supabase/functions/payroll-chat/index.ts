// @ts-ignore: Deno remote import
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore: Deno remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// @ts-ignore: Deno global
declare const Deno: any;

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
    // 1. CORS Preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        // 2. Parse Request
        const rawBody = await req.text();
        if (!rawBody) throw new Error("Request body is empty");
        const { message, history = [] } = JSON.parse(rawBody);

        // 3. Config
        const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
        const geminiApiKey = Deno.env.get('GEMINI_API_KEY') || '';

        // 4. Retrieve Store ID
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const { data: config } = await supabase
            .from('ai_sync_metadata')
            .select('gemini_file_id') // Check if your column is named 'store_id' or 'gemini_file_id'
            .limit(1)
            .maybeSingle();

        const storeId = config?.gemini_file_id;

        // 5. Build Payload
        const modelName = "gemini-2.0-flash"; // Standard Flash model
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiApiKey}`;

        const systemText = "You are the Payroll-Jam Expert. Ground answers in Jamaican tax law. 2026 Threshold is $1,902,360.";

        const payload: any = {
            contents: [
                ...history.map((msg: any) => ({ role: msg.role === 'model' ? 'model' : 'user', parts: [{ text: msg.text }] })),
                { role: 'user', parts: [{ text: message }] }
            ],
            systemInstruction: { parts: [{ text: systemText }] }
        };

        if (storeId) {
            payload.tools = [{ fileSearch: { fileSearchStoreNames: [storeId] } }];
        }

        // 6. Call Gemini
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        // --- SPECIFIC ERROR HANDLING FOR QUOTA (429) ---
        if (response.status === 429) {
            console.warn("Gemini Rate Limit Exceeded (429)");
            return new Response(JSON.stringify({ text: "I'm a bit tired i'll try again later" }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // Handle other errors
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Gemini API Error: ${errorText}`);
        }

        const data = await response.json();
        const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text || "I'm not sure, please check the official TAJ website.";

        return new Response(JSON.stringify({ text: aiText }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error: any) {
        console.error('Edge Function Error:', error.message);
        // Return the error safely so the frontend doesn't break
        return new Response(JSON.stringify({ text: "I'm having trouble connecting right now. Please try again." }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
})