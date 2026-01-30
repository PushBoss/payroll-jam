
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

        // 2. Auto-Provision (Optimized)
        if (!storeId) {
            console.log("Auto-provisioning store...");
            const createStoreRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/fileSearchStores?key=${geminiApiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ display_name: "Payroll-Jam Store" })
            });
            if (createStoreRes.ok) {
                const storeResult = await createStoreRes.json();
                storeId = storeResult.name;
                await supabase.from('ai_config').upsert({ key: 'gemini_store_id', value: storeId });
            }
        }

        // 3. Modern Chat with Safety and Grounding
        const modelName = "gemini-2.0-flash";
        const fallbackModel = "gemini-1.5-flash";

        const systemInstruction = `You are the Official Payroll-Jam Expert. 
        1. Ground your answers in the provided knowledge base (Jamaican tax documents).
        2. If the documents don't have the specific answer, use your general knowledge of Jamaican payroll law.
        3. Mention the 2026 tax threshold of $1,902,360 if relevant.
        4. If you absolutely cannot answer, explain why clearly. Never return an empty response.`;

        const safetySettings = [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" }
        ];

        const makePayload = (isCamel: boolean) => {
            const contents = [
                ...history.map((h: any) => ({
                    role: h.role === 'model' ? 'model' : 'user',
                    parts: [{ text: h.text }]
                })),
                { role: 'user', parts: [{ text: message }] }
            ];

            return isCamel ? {
                contents,
                tools: storeId ? [{ fileSearch: { fileSearchStoreNames: [storeId] } }] : [],
                systemInstruction: { role: "system", parts: [{ text: systemInstruction }] },
                safetySettings
            } : {
                contents,
                tools: storeId ? [{ file_search: { file_search_store_names: [storeId] } }] : [],
                system_instruction: { parts: [{ text: systemInstruction }] },
                safetySettings
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

        let result = await tryGenerate(modelName, makePayload(true));

        if (!result.ok && (result.status === 404 || result.bodyText.includes("not found"))) {
            result = await tryGenerate(fallbackModel, makePayload(true));
        }

        if (!result.ok) {
            throw new Error(`Gemini API Error (${result.status}): ${result.bodyText.substring(0, 150)}`);
        }

        // Handle Empty Candidates (Safety or Error)
        const candidate = result.data?.candidates?.[0];
        const finishReason = candidate?.finishReason;
        const responseText = candidate?.content?.parts?.[0]?.text;

        if (!responseText) {
            if (finishReason === "SAFETY") {
                return new Response(JSON.stringify({ text: "I'm sorry, I cannot answer that question as it was flagged by our safety filters. Please try rephrasing your payroll question." }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            }
            throw new Error(`Model returned empty response (Finish Reason: ${finishReason || "Unknown"})`);
        }

        return new Response(JSON.stringify({ text: responseText }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error: any) {
        console.error('Final Edge Function Error:', error.message);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
})
