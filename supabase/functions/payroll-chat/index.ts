
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
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const rawBody = await req.text();
        if (!rawBody) throw new Error("Request body is empty");

        let body;
        try {
            body = JSON.parse(rawBody);
        } catch (e: any) {
            throw new Error("Invalid JSON in request: " + e.message);
        }

        const { message, history = [] } = body;
        if (!message) throw new Error("Message is required");

        const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
        const geminiApiKey = Deno.env.get('GEMINI_API_KEY') || '';

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // 1. Get Store ID
        const { data: config } = await supabase
            .from('ai_config')
            .select('value')
            .eq('key', 'gemini_store_id')
            .maybeSingle();

        let storeId = config?.value;

        // 2. Models
        const modelName = "gemini-2.0-flash";
        const fallbackModel = "gemini-1.5-flash";

        const systemInstruction = `You are the Official Payroll-Jam Expert. 
        Your goal is to provide accurate guidance on Jamaican statutory deductions and tax compliance.
        
        RULES:
        1. Ground your answers in the provided knowledge base documents.
        2. If the documents do not contain the answer, use your expert knowledge of Jamaican law.
        3. ALWAYS provide a clear text response. Never return an empty message.
        4. Mention the 2026 tax threshold of $1,902,360 if relevant.`;

        const makePayload = (isGrounded: boolean) => {
            const contents = [
                ...history.map((h: any) => ({
                    role: h.role === 'model' ? 'model' : 'user',
                    parts: [{ text: h.text }]
                })),
                { role: 'user', parts: [{ text: message }] }
            ];

            return {
                contents,
                tools: (isGrounded && storeId) ? [{ fileSearch: { fileSearchStoreNames: [storeId] } }] : [],
                systemInstruction: { role: "system", parts: [{ text: systemInstruction }] }
            };
        };

        const tryGenerate = async (model: string, payload: any) => {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`;
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const bodyText = await res.text();
            return { ok: res.ok, status: res.status, bodyText, data: bodyText.startsWith('{') ? JSON.parse(bodyText) : null };
        };

        // Attempt 1: Grounded Search with Gemini 2.0
        console.log("Attempting Grounded Search...");
        let result = await tryGenerate(modelName, makePayload(true));

        // Attempt 2: Grounded Fallback to 1.5 if 2.0 is missing
        if (!result.ok && (result.status === 404 || result.bodyText.includes("not found"))) {
            console.log("Gemini 2.0 not found, trying 1.5 Grounded Fallback...");
            result = await tryGenerate(fallbackModel, makePayload(true));
        }

        // CRITICAL FIX: If Grounded Search fails with "empty output" or 400, try Standard Expert Chat
        if (!result.ok || (!result.data?.candidates?.[0]?.content?.parts?.[0]?.text)) {
            console.log("Grounded Search produced empty output or error. Falling back to Standard Expert mode...");
            result = await tryGenerate(modelName, makePayload(false));

            // Final fallback to 1.5 standard if 2.0 fails
            if (!result.ok) {
                result = await tryGenerate(fallbackModel, makePayload(false));
            }
        }

        if (!result.ok) {
            throw new Error(`Gemini API Error (${result.status}): ${result.bodyText.substring(0, 150)}`);
        }

        const responseText = result.data?.candidates?.[0]?.content?.parts?.[0]?.text ||
            "I'm sorry, I encountered an issue processing the knowledge base. However, as an expert, I can tell you that I'm here to help with your Jamaican payroll questions. Please rephrase your query.";

        return new Response(JSON.stringify({ text: responseText }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error: any) {
        console.error('Edge Function Audit Error:', error.message);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
})
