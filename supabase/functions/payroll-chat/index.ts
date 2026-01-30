
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
        if (!rawBody) throw new Error("Request body is empty");

        const { message, history = [] } = JSON.parse(rawBody);
        if (!message) throw new Error("Message is required");

        const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
        const geminiApiKey = Deno.env.get('GEMINI_API_KEY') || ''

        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        // 1. Fetch Knowledgebase - Instead of Google File API (which causes v1beta errors), 
        // we will fetch the metadata and use the file names to provide context or instructions.
        // For a more robust solution later, we can extract text from these files.
        const { data: syncedMetadata } = await supabase
            .from('ai_sync_metadata')
            .select('file_name');

        const fileList = (syncedMetadata || []).map(m => m.file_name).join(', ');

        const systemInstruction = `You are the Official Payroll-Jam Expert. 
        Your goal is to provide accurate guidance on Jamaican statutory deductions and tax compliance.
        
        KNOWLEDGE BASE:
        You have access to the following documents in your storage: ${fileList || 'No documents uploaded yet'}.
        Ground your answers in Jamaican tax law.
        If a user asks about the 2026 threshold, refer to the value $1,902,360. 
        Cite your sources clearly (e.g., "According to the NHT guidelines...").
        
        TONE: Professional, accessible, using standard Jamaican English. Use **bolding** for figures and dates.`;

        // Using v1 endpoint which we know works for gemini-1.5-flash in your project
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
                        { text: `INSTRUCTION: ${systemInstruction}\n\nUSER QUESTION: ${message}` }
                    ]
                }
            ]
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

        const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text || "I'm sorry, I couldn't generate a response at this moment.";

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
