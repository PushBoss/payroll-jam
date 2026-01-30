
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

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
        } catch (e) {
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

        // 3. Simple File Sync (Check for unsynced files in bucket)
        // Note: For large buckets, this should be done in a background job.
        // We'll process up to 2 new files per request to keep it fast.
        const { data: bucketFiles } = await supabase.storage.from('knowledgebase').list();
        if (bucketFiles && bucketFiles.length > 0) {
            const { data: synced } = await supabase.from('ai_sync_metadata').select('file_name');
            const syncedSet = new Set((synced || []).map(m => m.file_name));

            const unsyncedFiles = bucketFiles.filter(f => !syncedSet.has(f.name) && !f.name.startsWith('.')).slice(0, 2);

            for (const fileToSync of unsyncedFiles) {
                console.log(`Syncing ${fileToSync.name} to Gemini Store...`);
                const { data: blob } = await supabase.storage.from('knowledgebase').download(fileToSync.name);

                if (blob) {
                    // Upload to Gemini File API
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
                        } else {
                            const err = await addRes.text();
                            console.error(`Failed to add ${fileToSync.name} to store:`, err);
                        }
                    } else {
                        const err = await uploadRes.text();
                        console.error(`Failed to upload ${fileToSync.name} to File API:`, err);
                    }
                }
            }
        }

        // 4. Chat with RAG (File Search Tool)
        const primaryModel = "gemini-2.0-flash";
        const fallbackModel = "gemini-1.5-flash";

        const systemInstruction = "You are the Payroll-Jam Expert. Ground all answers in the Jamaican tax documents found in the provided knowledge base. If a user asks about the 2026 threshold, refer to the value $1,902,360. Cite your sources clearly.";

        const constructPayload = (model: string) => ({
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
            tools: [{
                file_search: { // API standard usually uses snake_case in REST
                    file_search_store_names: [storeId]
                }
            }],
            system_instruction: { // API standard usually uses snake_case in REST
                parts: [{ text: systemInstruction }]
            }
        });

        // Some modern versions of the API (esp. for Gemini 2.0) expect camelCase
        const constructCamelPayload = (model: string) => ({
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
            tools: [{
                fileSearch: {
                    fileSearchStoreNames: [storeId]
                }
            }],
            systemInstruction: {
                role: "system",
                parts: [{ text: systemInstruction }]
            }
        });

        // We'll try the camelCase payload first as requested by the user's latest documentation snippet
        let chatUrl = `https://generativelanguage.googleapis.com/v1beta/models/${primaryModel}:generateContent?key=${geminiApiKey}`;
        let payload = constructCamelPayload(primaryModel);

        let response = await fetch(chatUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        // Fallback Logic
        if (!response.ok) {
            const errBody = await response.text();
            console.warn(`Primary attempt failed (${response.status}): ${errBody.substring(0, 100)}...`);

            // If primary model 404s, try fallback model
            if (response.status === 404 || errBody.includes("not found")) {
                console.log(`Trying fallback model: ${fallbackModel}`);
                chatUrl = `https://generativelanguage.googleapis.com/v1beta/models/${fallbackModel}:generateContent?key=${geminiApiKey}`;
                payload = constructCamelPayload(fallbackModel);
                response = await fetch(chatUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            }

            // If it's still failing with a 400 (Invalid argument), try the snake_case payload
            if (!response.ok && response.status === 400) {
                console.log("Trying snake_case payload fallback...");
                payload = constructPayload(primaryModel) as any;
                response = await fetch(chatUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            }
        }

        const contentType = response.headers.get("content-type");
        if (!response.ok || !contentType || !contentType.includes("application/json")) {
            const errorText = await response.text();
            throw new Error(`Gemini API Error (${response.status}): ${errorText.substring(0, 200)}`);
        }

        const result = await response.json();
        const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text || "I'm sorry, I couldn't generate a response based on the knowledge base.";

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
