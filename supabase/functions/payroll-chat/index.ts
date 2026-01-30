
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

        if (!geminiApiKey) throw new Error("GEMINI_API_KEY is not set in Supabase secrets");

        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        // Fetch Knowledgebase metadata
        const { data: syncedMetadata } = await supabase
            .from('ai_sync_metadata')
            .select('file_name');

        const fileList = (syncedMetadata || []).map(m => m.file_name).join(', ');

        const systemInstruction = `You are the Official Payroll-Jam Expert. 
        Your goal is to provide accurate guidance on Jamaican statutory deductions and tax compliance.
        
        KNOWLEDGE BASE:
        You have access to the following documents in your storage: ${fileList || 'No documents uploaded yet'}.
        Ground your answers in Jamaican tax law and the documents listed.
        If a user asks about the 2026 threshold, refer to the value $1,902,360. 
        Cite your sources clearly.
        
        TONE: Professional, accessible, using standard Jamaican English. Use **bolding** for figures and dates.`;

        // We will try the most compatible URL structure for Gemini 1.5 Flash
        // Some projects require v1beta for 1.5-flash, others require v1.
        // Given the consistent 404s, we will try v1Beta with a direct model name.
        const chatUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`;

        const geminiPayload = {
            contents: [
                {
                    role: 'user',
                    parts: [{ text: `INSTRUCTIONS: ${systemInstruction}` }]
                },
                {
                    role: 'model',
                    parts: [{ text: "Understood. I am the Official Payroll-Jam Expert. I will provide accurate guidance on Jamaican payroll and tax compliance based on the knowledge base. How can I assist you?" }]
                },
                ...history.map((h: any) => ({
                    role: h.role === 'model' ? 'model' : 'user',
                    parts: [{ text: h.text }]
                })),
                {
                    role: 'user',
                    parts: [{ text: message }]
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
            // If v1beta fails with model not found, let's try v1 as a fallback immediately
            if (response.status === 404) {
                const fallbackUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`;
                const fallbackResponse = await fetch(fallbackUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(geminiPayload)
                });
                const fallbackResult = await fallbackResponse.json();

                if (fallbackResponse.ok) {
                    const responseText = fallbackResult.candidates?.[0]?.content?.parts?.[0]?.text;
                    return new Response(JSON.stringify({ text: responseText }), {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }
                throw new Error(fallbackResult.error?.message || "Gemini AI fallback failed");
            }
            throw new Error(result.error?.message || "Gemini AI failed to respond");
        }

        const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text;

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
