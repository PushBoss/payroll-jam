
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
        const { data: config, error: configError } = await supabase
            .from('ai_config')
            .select('value')
            .eq('key', 'gemini_store_id')
            .maybeSingle();

        if (configError) {
            console.error("Database error fetching config:", configError);
        }

        let storeId = config?.value;

        // 2. Auto-Provision Store if missing
        if (!storeId) {
            console.log("Provisioning new Gemini File Search Store...");
            const createStoreUrl = `https://generativelanguage.googleapis.com/v1beta/fileSearchStores?key=${geminiApiKey}`;
            const createStoreResponse = await fetch(createStoreUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ display_name: "Payroll-Jam Knowledge Base" })
            });

            if (!createStoreResponse.ok) {
                const err = await createStoreResponse.text();
                throw new Error(`Gemini Store Creation Failed (${createStoreResponse.status}): ${err}`);
            }

            const storeResult = await createStoreResponse.json();
            storeId = storeResult.name;

            await supabase.from('ai_config').upsert({ key: 'gemini_store_id', value: storeId });
            console.log(`Created Store: ${storeId}`);
        }

        // 3. Simple File Sync
        const { data: bucketFiles } = await supabase.storage.from('knowledgebase').list();
        if (bucketFiles && bucketFiles.length > 0) {
            const { data: synced } = await supabase.from('ai_sync_metadata').select('file_name');
            const syncedSet = new Set((synced || []).map((m: any) => m.file_name));

            const unsyncedFiles = bucketFiles.filter((f: any) => !syncedSet.has(f.name) && !f.name.startsWith('.')).slice(0, 2);

            for (const fileToSync of unsyncedFiles) {
                console.log(`Syncing ${fileToSync.name} to Gemini Store...`);
                const { data: blob } = await supabase.storage.from('knowledgebase').download(fileToSync.name);

                if (blob) {
                    const uploadUrl = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${geminiApiKey}`;
                    const uploadRes = await fetch(uploadUrl, {
                        method: 'POST',
                        headers: {
                            'X-Goog-Upload-Protocol': 'multipart',
                            'Content-Type': blob.type || 'application/pdf'
                        },
                        body: blob
                    });

                    if (uploadRes.ok) {
                        const uploadResJson = await uploadRes.json();
                        const fileUri = uploadResJson.file.name;

                        // Add to Store
                        const addToStoreUrl = `https://generativelanguage.googleapis.com/v1beta/${storeId}/files?key=${geminiApiKey}`;
                        const addRes = await fetch(addToStoreUrl, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ file: fileUri })
                        });

                        if (addRes.ok) {
                            await supabase.from('ai_sync_metadata').upsert({
                                file_name: fileToSync.name,
                                gemini_file_id: fileUri,
                                last_synced: new Date().toISOString()
                            });
                            console.log(`Successfully synced ${fileToSync.name}`);
                        }
                    }
                }
            }
        }

        // 4. Chat logic
        const primaryModel = "gemini-2.0-flash";
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

            if (isCamel) {
                return {
                    contents,
                    tools: [{ fileSearch: { fileSearchStoreNames: [storeId] } }],
                    systemInstruction: { role: "system", parts: [{ text: systemInstruction }] }
                };
            } else {
                return {
                    contents,
                    tools: [{ file_search: { file_search_store_names: [storeId] } }],
                    system_instruction: { parts: [{ text: systemInstruction }] }
                };
            }
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

            return {
                ok: res.ok,
                status: res.status,
                bodyText,
                data: isJson ? JSON.parse(bodyText) : null
            };
        };

        // Try 1: Gemini 2.0 + CamelCase
        let result = await tryGenerate(primaryModel, makePayload(true));

        // Fallback 1: Gemini 1.5 + CamelCase
        if (!result.ok && (result.status === 404 || result.bodyText.includes("not found"))) {
            console.log("Gemini 2.0 not found, trying 1.5...");
            result = await tryGenerate(fallbackModel, makePayload(true));
        }

        // Fallback 2: SnakeCase (if we got a 400 Invalid Argument)
        if (!result.ok && result.status === 400) {
            console.log("CamelCase failed, trying snake_case...");
            result = await tryGenerate(primaryModel, makePayload(false));

            if (!result.ok && (result.status === 404 || result.bodyText.includes("not found"))) {
                result = await tryGenerate(fallbackModel, makePayload(false));
            }
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
