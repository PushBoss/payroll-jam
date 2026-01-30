
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

        const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
        const geminiApiKey = Deno.env.get('GEMINI_API_KEY') || ''

        if (!geminiApiKey) throw new Error("GEMINI_API_KEY is not set");

        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        // 1. Get or Create Store ID
        let { data: config } = await supabase
            .from('ai_config')
            .select('value')
            .eq('key', 'gemini_store_id')
            .single();

        let storeId = config?.value;

        if (!storeId) {
            console.log("Creating new Gemini File Search Store...");
            const createStoreUrl = `https://generativelanguage.googleapis.com/v1beta/fileSearchStores?key=${geminiApiKey}`;
            const createStoreResponse = await fetch(createStoreUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    display_name: "Payroll-Jam Knowledge Base"
                })
            });

            const storeResult = await createStoreResponse.json();
            if (!createStoreResponse.ok) throw new Error(`Failed to create store: ${JSON.stringify(storeResult)}`);

            storeId = storeResult.name; // Format: fileSearchStores/abc-123

            await supabase
                .from('ai_config')
                .upsert({ key: 'gemini_store_id', value: storeId, updated_at: new Date().toISOString() });
        }

        // 2. Sync Logic (Supabase Bucket -> Gemini Store)
        const { data: bucketFiles } = await supabase.storage.from('knowledgebase').list();
        const { data: syncedFilesData } = await supabase.from('ai_sync_metadata').select('file_name');
        const syncedFiles = new Set((syncedFilesData || []).map(m => m.file_name));

        if (bucketFiles) {
            for (const file of bucketFiles) {
                if (!syncedFiles.has(file.name) && !file.name.startsWith('.')) {
                    console.log(`Uploading ${file.name} to Gemini...`);

                    const { data: fileData, error: downloadError } = await supabase
                        .storage
                        .from('knowledgebase')
                        .download(file.name);

                    if (downloadError) continue;

                    // Upload file to Gemini File API
                    const uploadUrl = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${geminiApiKey}`;
                    const uploadResponse = await fetch(uploadUrl, {
                        method: 'POST',
                        headers: {
                            'X-Goog-Upload-Protocol': 'multipart',
                            'Content-Type': fileData.type || 'application/pdf',
                        },
                        body: fileData
                    });

                    const uploadResult = await uploadResponse.json();
                    if (!uploadResponse.ok) continue;

                    const fileUri = uploadResult.file.name;

                    // Add file to Store
                    const addToStoreUrl = `https://generativelanguage.googleapis.com/v1beta/${storeId}/files?key=${geminiApiKey}`;
                    await fetch(addToStoreUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ file: fileUri })
                    });

                    await supabase.from('ai_sync_metadata').upsert({
                        file_name: file.name,
                        gemini_file_id: fileUri,
                        last_synced: new Date().toISOString()
                    });
                }
            }
        }

        // 3. Chat Logic with Tools
        const modelName = "gemini-2.0-flash";
        const chatUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiApiKey}`;

        const systemInstruction = "You are the Payroll-Jam Expert. Ground all answers in the Jamaican tax documents found in the provided knowledge base. If a user asks about the 2026 threshold, refer to the value $1,902,360. Cite your sources clearly.";

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
                    file_search: {
                        file_search_store_names: [storeId]
                    }
                }
            ],
            system_instruction: {
                parts: [{ text: systemInstruction }]
            }
        };

        const response = await fetch(chatUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(geminiPayload)
        });

        const result = await response.json();

        if (!response.ok) {
            console.error("Gemini Error:", JSON.stringify(result));
            throw new Error(result.error?.message || "AI failed to respond");
        }

        const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text || "I'm sorry, I couldn't generate a response.";

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
