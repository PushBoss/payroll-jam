
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const rawBody = await req.text();
        if (!rawBody) throw new Error("Request body is empty");

        const { message, history = [] } = JSON.parse(rawBody);

        const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
        const geminiApiKey = Deno.env.get('GEMINI_API_KEY') || '';

        if (!geminiApiKey) throw new Error("GEMINI_API_KEY is not set");

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // 1. Get Store ID
        const { data: config } = await supabase
            .from('ai_config')
            .select('value')
            .eq('key', 'gemini_store_id')
            .maybeSingle();

        let storeId = config?.value;

        // 2. Auto-Provision Store if missing
        if (!storeId) {
            console.log("Creating new Gemini File Search Store...");
            const createStoreUrl = `https://generativelanguage.googleapis.com/v1beta/fileSearchStores?key=${geminiApiKey}`;
            const createStoreResponse = await fetch(createStoreUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ display_name: "Payroll-Jam Knowledge Base" })
            });

            if (!createStoreResponse.ok) {
                const err = await createStoreResponse.text();
                throw new Error(`Store Creation Failed: ${err}`);
            }

            const storeResult = await createStoreResponse.json();
            storeId = storeResult.name;
            await supabase.from('ai_config').upsert({ key: 'gemini_store_id', value: storeId });
        }

        // 3. Modern Chat Logic with Gemini 2.0 and File Search
        const modelName = "gemini-2.0-flash";
        const chatUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiApiKey}`;

        const systemInstruction = "You are the Payroll-Jam Expert. Ground all answers in the Jamaican tax documents found in the provided knowledge base. If a user asks about the 2026 threshold, refer to the value $1,902,360. Cite your sources clearly.";

        // Payload follows the modern v1beta structure
        const geminiPayload = {
            contents: [
                ...history.map((h: any) => ({
                    role: h.role === 'model' ? 'model' : 'user',
                    parts: [{ text: h.text }]
                })),
                {
                    role: 'user',
                    parts: [{ text: message }]
                }
            ],
            tools: [
                {
                    fileSearch: {
                        fileSearchStoreNames: [storeId]
                    }
                }
            ],
            systemInstruction: {
                parts: [{ text: systemInstruction }]
            }
        };

        const response = await fetch(chatUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(geminiPayload)
        });

        // 4. Robust Error Handling (Avoid "Bad Content" JSON parse errors)
        const contentType = response.headers.get("content-type");
        if (!response.ok || !contentType || !contentType.includes("application/json")) {
            const errorText = await response.text();
            console.error(`Gemini API Error (${response.status}):`, errorText);
            throw new Error(`Gemini API reported: ${errorText.substring(0, 200)}`);
        }

        const result = await response.json();
        const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text || "I'm sorry, I couldn't generate a response based on the knowledge base at this moment.";

        return new Response(JSON.stringify({ text: responseText }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error: any) {
        console.error('Edge Function Error:', error.message);
        // Always return 200 with error property to ensure frontend can show the message
        return new Response(JSON.stringify({ error: error.message }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
})
