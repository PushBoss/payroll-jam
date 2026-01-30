
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

        const { message, history = [] } = JSON.parse(rawBody);
        if (!message) throw new Error("Message is required");

        const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
        const geminiApiKey = Deno.env.get('GEMINI_API_KEY') || '';

        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const { data: config } = await supabase.from('ai_config').select('value').eq('key', 'gemini_store_id').maybeSingle();
        const storeId = config?.value;

        const modelName = "gemini-2.0-flash";
        const fallbackModel = "gemini-1.5-flash";

        const systemText = "You are the Official Payroll-Jam Expert. Ground answers in Jamaican tax law documents. The 2026 threshold is $1,902,360. Identify as the Payroll-Jam Expert and be helpful.";

        // BLOCK_NONE to prevent accidental filtering of tax/statutory terms
        const safetySettings = [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ];

        // Sanitize history: Gemini crashes if parts are empty or roles are invalid
        const sanitizedContents = history
            .filter((h: any) => h.text && h.text.trim().length > 0)
            .map((h: any) => ({
                role: h.role === 'model' ? 'model' : 'user',
                parts: [{ text: h.text }]
            }));

        // Add current message
        sanitizedContents.push({
            role: 'user',
            parts: [{ text: message }]
        });

        const tryGenerate = async (model: string, useGrounding: boolean) => {
            const payload: any = {
                contents: sanitizedContents,
                system_instruction: { parts: [{ text: systemText }] }, // Standard snake_case
                safetySettings, // Keep camelCase for safety in REST
                generationConfig: { temperature: 0.7 }
            };

            if (useGrounding && storeId) {
                payload.tools = [{ file_search: { file_search_store_names: [storeId] } }];
            }

            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`;
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const bodyText = await res.text();
            const data = bodyText.startsWith('{') ? JSON.parse(bodyText) : null;

            // Validation: Does it actually have text?
            const hasText = !!(data?.candidates?.[0]?.content?.parts?.[0]?.text);

            return { ok: res.ok && hasText, status: res.status, data, bodyText };
        };

        // Execution Ladder
        let step = await tryGenerate(modelName, true); // 1. 2.0 Grounded

        if (!step.ok) {
            console.warn("Retrying with 1.5 Grounded Fallback...");
            step = await tryGenerate(fallbackModel, true); // 2. 1.5 Grounded
        }

        if (!step.ok) {
            console.warn("Retrying with 2.0 Standard (No Tools)...");
            step = await tryGenerate(modelName, false); // 3. 2.0 Clean
        }

        if (!step.ok) {
            console.warn("Final Attempt: 1.5 Vanilla...");
            step = await tryGenerate(fallbackModel, false); // 4. 1.5 Clean
        }

        if (!step.ok) {
            const errDetail = step.data?.error?.message || "All generation attempts failed.";
            throw new Error(`Gemini AI Final Failure: ${errDetail}`);
        }

        const responseText = step.data.candidates[0].content.parts[0].text;

        return new Response(JSON.stringify({ text: responseText }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error: any) {
        console.error('Final Refactor Error:', error.message);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
})
