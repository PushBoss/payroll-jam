
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
    // Handle CORS
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

        if (!supabaseUrl || !supabaseServiceKey || !geminiApiKey) {
            throw new Error("Missing critical environment variables (SUPABASE_URL, SERVICE_KEY, or GEMINI_API_KEY)");
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // 1. Get Store ID
        const { data: config } = await supabase
            .from('ai_config')
            .select('value')
            .eq('key', 'gemini_store_id')
            .maybeSingle();

        let storeId = config?.value;

        // 2. Provision / Sync (ONLY if storeId is missing)
        // This prevents hitting 429 quota errors on every chat message
        if (!storeId) {
            console.log("Store ID missing. Starting one-time provisioning...");
            const createStoreUrl = `https://generativelanguage.googleapis.com/v1beta/fileSearchStores?key=${geminiApiKey}`;
            const createStoreRes = await fetch(createStoreUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ display_name: "Payroll-Jam Knowledge Base" })
            });

            if (!createStoreRes.ok) {
                const err = await createStoreRes.text();
                throw new Error(`Store Creation Failed: ${err}`);
            }

            const storeResult = await createStoreRes.json();
            storeId = storeResult.name;
            await supabase.from('ai_config').upsert({ key: 'gemini_store_id', value: storeId });

            // Initial Sync
            const { data: bucketFiles } = await supabase.storage.from('knowledgebase').list();
            if (bucketFiles && bucketFiles.length > 0) {
                console.log(`Found ${bucketFiles.length} files. Syncing...`);
                for (const file of bucketFiles.slice(0, 5)) { // Limit initial sync
                    if (file.name.startsWith('.')) continue;
                    const { data: blob } = await supabase.storage.from('knowledgebase').download(file.name);
                    if (!blob) continue;

                    const uploadRes = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${geminiApiKey}`, {
                        method: 'POST',
                        headers: { 'X-Goog-Upload-Protocol': 'multipart', 'Content-Type': blob.type || 'application/pdf' },
                        body: blob
                    });

                    if (uploadRes.ok) {
                        const uploadJson = await uploadRes.json();
                        const fileUri = uploadJson.file.name;
                        await fetch(`https://generativelanguage.googleapis.com/v1beta/${storeId}/files?key=${geminiApiKey}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ file: fileUri })
                        });
                        await supabase.from('ai_sync_metadata').upsert({ file_name: file.name, gemini_file_id: fileUri });
                    }
                }
            }
        }

        // 3. Chat Logic (High Efficiency - Always uses Store)
        const modelName = "gemini-2.0-flash";
        const fallbackModel = "gemini-1.5-flash";
        const systemInstruction = "You are the Payroll-Jam Expert. Ground all answers in the Jamaican tax documents found in the provided knowledge base. If a user asks about the 2026 threshold, refer to the value $1,902,360. Cite your sources clearly.";

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
                tools: [{ fileSearch: { fileSearchStoreNames: [storeId] } }],
                systemInstruction: { role: "system", parts: [{ text: systemInstruction }] }
            } : {
                contents,
                tools: [{ file_search: { file_search_store_names: [storeId] } }],
                system_instruction: { parts: [{ text: systemInstruction }] }
            };
        };

        const tryGenerate = async (model: string, payload: any) => {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`;
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const isJson = res.headers.get("content-type")?.includes("application/json");
            const bodyText = await res.text();
            return { ok: res.ok, status: res.status, bodyText, data: isJson ? JSON.parse(bodyText) : null };
        };

        let result = await tryGenerate(modelName, makePayload(true));

        if (!result.ok && (result.status === 404 || result.bodyText.includes("not found"))) {
            result = await tryGenerate(fallbackModel, makePayload(true));
        }

        if (!result.ok) {
            throw new Error(`Gemini API Error (${result.status}): ${result.bodyText.substring(0, 200)}`);
        }

        const responseText = result.data?.candidates?.[0]?.content?.parts?.[0]?.text || "I'm sorry, I couldn't generate a response.";

        return new Response(JSON.stringify({ text: responseText }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error: any) {
        console.error('Edge Function Error:', error.message);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
})
