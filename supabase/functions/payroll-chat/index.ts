
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.21.0"

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
        Cite your sources clearly (e.g., "According to the NHT guidelines...").
        
        TONE: Professional, accessible, using standard Jamaican English. Use **bolding** for figures and dates.`;

        // Initialize SDK
        const genAI = new GoogleGenerativeAI(geminiApiKey);
        const model = genAI.getGenerativeModel({
            model: "gemini-1.5-flash",
            systemInstruction: systemInstruction
        });

        const chat = model.startChat({
            history: history.map((h: any) => ({
                role: h.role === 'model' ? 'model' : 'user',
                parts: [{ text: h.text }]
            }))
        });

        const result = await chat.sendMessage(message);
        const responseText = result.response.text();

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
