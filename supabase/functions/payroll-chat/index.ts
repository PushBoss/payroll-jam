
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
        const { message, history } = await req.json()

        const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
        const geminiApiKey = Deno.env.get('GEMINI_API_KEY') || ''

        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        // 1. Sync Logic (Supabase Bucket -> Gemini AI)
        // List files in the 'knowledgebase' bucket
        const { data: bucketFiles, error: bucketError } = await supabase
            .storage
            .from('knowledgebase')
            .list()

        if (bucketError) throw bucketError

        // Check metadata table to see what's already synced
        const { data: syncedMetadata, error: metaError } = await supabase
            .from('ai_sync_metadata')
            .select('file_name, gemini_file_id')

        if (metaError) throw metaError

        const syncedFiles = new Set(syncedMetadata?.map(m => m.file_name) || [])

        // Process new files
        // Note: In a production environment, you might want to move the upload logic to a separate sync function
        // For this edge function, we'll ensure files are uploaded to Gemini's File API for grounding
        for (const file of (bucketFiles || [])) {
            if (!syncedFiles.has(file.name) && !file.name.startsWith('.')) {
                console.log(`Syncing new file: ${file.name}`)

                // Download from Supabase
                const { data: fileData, error: downloadError } = await supabase
                    .storage
                    .from('knowledgebase')
                    .download(file.name)

                if (downloadError) {
                    console.error(`Error downloading ${file.name}:`, downloadError)
                    continue
                }

                // Upload to Gemini File API
                // Using fetch directly to the Gemini API for file upload as the SDK wrapper varies for Deno
                const uploadUrl = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${geminiApiKey}`
                const uploadResponse = await fetch(uploadUrl, {
                    method: 'POST',
                    headers: {
                        'X-Goog-Upload-Protocol': 'multipart',
                        'Content-Type': fileData.type || 'application/octet-stream',
                    },
                    body: fileData
                })

                const uploadResult = await uploadResponse.json()

                if (uploadResult.file) {
                    // Store in metadata
                    await supabase
                        .from('ai_sync_metadata')
                        .upsert({
                            file_name: file.name,
                            gemini_file_id: uploadResult.file.name, // Usually 'files/...'
                            last_synced: new Date().toISOString()
                        })
                    console.log(`Successfully synced ${file.name} as ${uploadResult.file.name}`)
                }
            }
        }

        // 2. Chat Logic
        // Re-fetch metadata for grounding
        const { data: currentMetadata } = await supabase
            .from('ai_sync_metadata')
            .select('gemini_file_id')

        const fileReferences = (currentMetadata || []).map(m => ({
            file_uri: `https://generativelanguage.googleapis.com/v1beta/${m.gemini_file_id}`
        }))

        // Generate content using Gemini
        const chatUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`

        const systemInstruction = "You are the Payroll-Jam Expert. Ground all answers in the Jamaican tax documents found in the 'knowledgebase' store. If a user asks about the 2026 threshold, refer to the value $1,902,360. Cite your sources clearly."

        const response = await fetch(chatUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [
                    ...history.map((h: any) => ({
                        role: h.role === 'model' ? 'model' : 'user',
                        parts: [{ text: h.text }]
                    })),
                    {
                        role: 'user',
                        parts: [
                            ...fileReferences.map(f => ({ file_data: { mime_type: 'application/pdf', file_uri: f.file_uri } })),
                            { text: message }
                        ]
                    }
                ],
                system_instruction: {
                    parts: [{ text: systemInstruction }]
                }
            })
        })

        const result = await response.json()
        const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text || "I encountered an error processing your request."

        return new Response(JSON.stringify({ text: responseText }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })

    } catch (error) {
        console.error('Function error:', error)
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }
})
