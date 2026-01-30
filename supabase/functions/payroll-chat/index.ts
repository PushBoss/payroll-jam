
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

        const systemText = "You are the Payroll-Jam Expert. Ground answers in Jamaican tax law documents. Threshold: $1,902,360.";

        const safetySettings = [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ];

        // Sanitize History
        let contents = history
            .filter((h: any) => h.text && h.text.trim().length > 0)
            .map((h: any) => ({
                role: h.role === 'model' ? 'model' : 'user',
                parts: [{ text: h.text }]
            }));

        if (contents.length > 0 && contents[0].role === 'model') contents.shift();

        const finalContents: any[] = [];
        let lastRole = null;
        for (const msg of contents) {
            if (msg.role !== lastRole) {
                finalContents.push(msg);
                lastRole = msg.role;
            }
        }
        finalContents.push({ role: 'user', parts: [{ text: message }] });

        const tryGenerate = async (model: string, schemaType: 'snake' | 'camel' | 'minimal') => {
            const payload: any = { contents: finalContents, safetySettings, generationConfig: { temperature: 0 } };

            if (schemaType === 'snake') {
                payload.system_instruction = { parts: [{ text: systemText }] };
                if (storeId) payload.tools = [{ file_search: { file_search_store_names: [storeId] } }];
            } else if (schemaType === 'camel') {
                payload.systemInstruction = { parts: [{ text: systemText }] };
                if (storeId) payload.tools = [{ fileSearch: { fileSearchStoreNames: [storeId] } }];
            } else {
                // Minimal mode: No tools, no instructions. Raw chat to bypass all validation errors.
                console.log("RESCUE MODE: Stripping all schema complexity...");
            }

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

        const modelLadder = ["gemini-2.0-flash", "gemini-1.5-flash"];
        let result = null;

        // Ladder Logic
        for (const model of modelLadder) {
            // 1. Try SnakeCase (Standard)
            result = await tryGenerate(model, 'snake');
            if (result.ok) break;

            // 2. Try CamelCase (Fallback for some 2.0 builds)
            result = await tryGenerate(model, 'camel');
            if (result.ok) break;
        }

        // 3. Final Rescue: If still failing or empty, try Minimal Mode
        if (!result || !result.ok) {
            console.warn("Standard attempts failed. Activating Rescue Logic...");
            result = await tryGenerate("gemini-2.0-flash", 'minimal');
            if (!result.ok) {
                result = await tryGenerate("gemini-1.5-flash", 'minimal');
            }
        }

        if (!result || !result.ok) {
            const msg = result?.data?.error?.message || result?.bodyText || "Final infrastructure failure.";
            throw new Error(`Gemini Critical Failure: ${msg}`);
        }

        return new Response(JSON.stringify({ text: result.text }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error: any) {
        console.error('Audit Failure:', error.message);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
})
