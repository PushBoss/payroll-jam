
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

        const { data: config } = await supabase
            .from('ai_config')
            .select('value')
            .eq('key', 'gemini_store_id')
            .maybeSingle();

        const storeId = config?.value;

        const modelName = "gemini-2.0-flash";
        const fallbackModel = "gemini-1.5-flash";

        const systemText = "You are the Official Payroll-Jam Expert. Ground answers in Jamaican tax law. The 2026 threshold is $1,902,360. Always provide clear text.";

        const safetySettings = [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" }
        ];

        const generationConfig = {
            temperature: 0.7,
            topP: 0.95,
            topK: 40,
            maxOutputTokens: 2048,
        };

        const tryGenerate = async (model: string, useGrounding: boolean, useSystem: boolean) => {
            const contents = [
                ...history.map((h: any) => ({
                    role: h.role === 'model' ? 'model' : 'user',
                    parts: [{ text: h.text }]
                })),
                { role: 'user', parts: [{ text: message }] }
            ];

            const payload: any = { contents, safetySettings, generationConfig };

            if (useSystem) {
                payload.systemInstruction = { parts: [{ text: systemText }] };
            }

            if (useGrounding && storeId) {
                payload.tools = [{ fileSearch: { fileSearchStoreNames: [storeId] } }];
            }

            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`;
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const bodyText = await res.text();
            return { ok: res.ok, status: res.status, bodyText, data: bodyText.startsWith('{') ? JSON.parse(bodyText) : null };
        };

        // Attempt 1: Full Grounded Expert (2.0)
        let result = await tryGenerate(modelName, true, true);

        // Attempt 2: Full Grounded Expert (1.5 Fallback)
        if (!result.ok || (!result.data?.candidates?.[0]?.content)) {
            result = await tryGenerate(fallbackModel, true, true);
        }

        // Attempt 3: Standard Expert (No Grounding)
        if (!result.ok || (!result.data?.candidates?.[0]?.content)) {
            result = await tryGenerate(modelName, false, true);
        }

        // Attempt 4: Minimal Vanilla (No Tools, No System)
        if (!result.ok || (!result.data?.candidates?.[0]?.content)) {
            result = await tryGenerate(fallbackModel, false, false);
        }

        if (!result.ok) {
            throw new Error(`Gemini API Error (${result.status}): ${result.bodyText.substring(0, 150)}`);
        }

        const candidate = result.data?.candidates?.[0];
        const responseText = candidate?.content?.parts?.[0]?.text;

        if (!responseText) {
            throw new Error(`Model returned empty output. Finish Reason: ${candidate?.finishReason}`);
        }

        return new Response(JSON.stringify({ text: responseText }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error: any) {
        console.error('Final Audit Error:', error.message);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
})
