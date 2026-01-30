
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

        // Attempting the most widely supported 2.0 and 1.5 names
        const modelLadder = [
            "gemini-2.0-flash",
            "gemini-1.5-flash",
            "gemini-1.5-pro"
        ];

        const systemText = "You are the Official Payroll-Jam Expert. Ground answers in Jamaican tax law documents. The 2026 threshold is $1,902,360. Always provide a clear, helpful response.";

        // Sanitize History
        let sanitizedHistory = history
            .filter((h: any) => h.text && h.text.trim().length > 0)
            .map((h: any) => ({
                role: h.role === 'model' ? 'model' : 'user',
                parts: [{ text: h.text }]
            }));

        if (sanitizedHistory.length > 0 && sanitizedHistory[0].role === 'model') {
            sanitizedHistory.shift();
        }

        const finalContents = [];
        let lastRole = null;
        for (const msg of sanitizedHistory) {
            if (msg.role !== lastRole) {
                finalContents.push(msg);
                lastRole = msg.role;
            }
        }
        finalContents.push({ role: 'user', parts: [{ text: message }] });

        const tryGenerate = async (model: string, useGrounding: boolean) => {
            const payload: any = {
                contents: finalContents,
                system_instruction: { parts: [{ text: systemText }] },
                generationConfig: { temperature: 0.7 }
            };

            // Only attach tools if grounding is requested AND storeId exists
            if (useGrounding && storeId) {
                payload.tools = [{ file_search: { file_search_store_names: [storeId] } }];
            }

            // Correct URL construction for v1beta
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`;

            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const bodyText = await res.text();
            let data = null;
            try { data = JSON.parse(bodyText); } catch (e) { }

            const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
            return { ok: res.ok && !!text, status: res.status, data, text, bodyText, model };
        };

        // Execution Loop through models
        let currentStep = null;

        // Pass 1: Try with Grounding (Model Search)
        for (const model of modelLadder) {
            console.log(`Trying Grounded Search with ${model}...`);
            currentStep = await tryGenerate(model, true);
            if (currentStep.ok) break;
            console.warn(`${model} Grounded search failed or not supported.`);
        }

        // Pass 2: Try Without Grounding if Pass 1 failed
        if (!currentStep || !currentStep.ok) {
            for (const model of modelLadder) {
                console.log(`Trying Standard Chat with ${model}...`);
                currentStep = await tryGenerate(model, false);
                if (currentStep.ok) break;
            }
        }

        if (!currentStep || !currentStep.ok) {
            const msg = currentStep?.data?.error?.message || currentStep?.bodyText || "All models failed to respond.";
            throw new Error(`Gemini Final Logic Failure: ${msg}`);
        }

        return new Response(JSON.stringify({ text: currentStep.text }), {
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
