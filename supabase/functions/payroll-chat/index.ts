
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    // Handle CORS
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const rawBody = await req.text();
        console.log("Raw body received:", rawBody);

        if (!rawBody) {
            throw new Error("Request body is empty");
        }

        let body;
        try {
            body = JSON.parse(rawBody);
        } catch (e) {
            console.error("JSON parse error:", e);
            throw new Error("Invalid JSON in request body");
        }

        const { message, history = [] } = body;
        if (!message) {
            throw new Error("Message is required");
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
        const geminiApiKey = Deno.env.get('GEMINI_API_KEY') || ''

        if (!supabaseUrl || !supabaseServiceKey || !geminiApiKey) {
            throw new Error("Missing environment variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or GEMINI_API_KEY");
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        // 1. Sync Logic (Supabase Bucket -> Gemini AI)
        console.log("Checking for knowledgebase files...");
        const { data: bucketFiles, error: bucketError } = await supabase
            .storage
            .from('knowledgebase')
            .list()

        if (bucketError) {
            console.error("Bucket listing error:", bucketError);
        }

        // Check metadata table
        const { data: syncedMetadata, error: metaError } = await supabase
            .from('ai_sync_metadata')
            .select('file_name, gemini_file_id')

        if (metaError) {
            console.error("Metadata fetch error:", metaError);
        }

        const syncedFiles = new Set((syncedMetadata || []).map(m => m.file_name));

        // Process new files
        if (bucketFiles && bucketFiles.length > 0) {
            for (const file of bucketFiles) {
                if (!syncedFiles.has(file.name) && !file.name.startsWith('.')) {
                    console.log(`Syncing new file: ${file.name}`);

                    const { data: fileData, error: downloadError } = await supabase
                        .storage
                        .from('knowledgebase')
                        .download(file.name);

                    if (downloadError) {
                        console.error(`Error downloading ${file.name}:`, downloadError);
                        continue;
                    }

                    // Upload to Gemini File API
                    const uploadUrl = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${geminiApiKey}`;
                    const uploadResponse = await fetch(uploadUrl, {
                        method: 'POST',
                        headers: {
                            'X-Goog-Upload-Protocol': 'multipart',
                            'Content-Type': fileData.type || 'application/octet-stream',
                        },
                        body: fileData
                    });

                    if (!uploadResponse.ok) {
                        const errText = await uploadResponse.text();
                        console.error(`Gemini upload failed for ${file.name}:`, errText);
                        continue;
                    }

                    const uploadResult = await uploadResponse.json();

                    if (uploadResult.file) {
                        await supabase
                            .from('ai_sync_metadata')
                            .upsert({
                                file_name: file.name,
                                gemini_file_id: uploadResult.file.name,
                                last_synced: new Date().toISOString()
                            });
                        console.log(`Successfully synced ${file.name}`);
                    }
                }
            }
        }

        // 2. Chat Logic
        const { data: allMetadata } = await supabase
            .from('ai_sync_metadata')
            .select('gemini_file_id');

        const fileParts = (allMetadata || []).map(m => ({
            file_data: {
                mime_type: 'application/pdf',
                file_uri: `https://generativelanguage.googleapis.com/v1beta/${m.gemini_file_id}`
            }
        }));

        const systemInstruction = "You are the Payroll-Jam Expert. Ground all answers in the Jamaican tax documents found in the 'knowledgebase' store. If a user asks about the 2026 threshold, refer to the value $1,902,360. Cite your sources clearly.";

        console.log(`Sending query to Gemini: ${message.substring(0, 50)}...`);

        const chatUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`;

        const geminiPayload = {
            contents: [
                ...history.map((h: any) => ({
                    role: h.role === 'model' ? 'model' : 'user',
                    parts: [{ text: h.text }]
                })),
                {
                    role: 'user',
                    parts: [
                        ...fileParts,
                        { text: message }
                    ]
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
            console.error("Gemini Chat Error:", JSON.stringify(result));
            throw new Error(result.error?.message || "Gemini AI failed to respond");
        }

        const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text || "I'm sorry, I couldn't generate a response based on the knowledge base at this moment.";

        return new Response(JSON.stringify({ text: responseText }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error: any) {
        console.error('Edge Function Error:', error.message);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 200, // Return 200 so frontend catches the JSON error rather than generic 500
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
})
