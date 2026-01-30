import { ChatMessage } from '../types';

// TODO: Add your Google AI API key here or set VITE_GOOGLE_AI_KEY in .env
const API_KEY = import.meta.env?.VITE_GOOGLE_AI_KEY || '';

export const getGroundedAIResponse = async (
  message: string,
  history: ChatMessage[]
): Promise<string> => {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/payroll-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseAnonKey}`
      },
      body: JSON.stringify({ message, history })
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = 'Failed to get response from AI Assistant';
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorMessage;
      } catch (e) {
        errorMessage = errorText || errorMessage;
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    return data.text;
  } catch (error: any) {
    console.error("Grounded AI Service Error:", error);
    return `Error: ${error.message || 'I encountered an error connecting to the payroll knowledge base.'}`;
  }
};

export const getAIResponse = async (
  prompt: string,
  contextData: string
): Promise<string> => {
  if (!API_KEY) {
    return "Error: AI Service is not configured. Please add your Google API key to the environment variables.";
  }

  try {
    // Dynamically import the provider
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const genAI = new GoogleGenerativeAI(API_KEY);

    const systemInstruction = `You are the Official Payroll-Jam Expert, a senior Jamaican payroll consultant and technical specialist for the payrolljam.com platform. Your goal is to provide accurate, concise, and helpful guidance on Jamaican statutory deductions, tax compliance, and platform usage.

ROLE & EXPERTISE:
- You are an expert in the Jamaican tax system (NIS, NHT, Education Tax, and PAYE).
- You are knowledgeable about S01 and S02 filings for Tax Administration Jamaica (TAJ).
- Always emphasize the 14th of every month as the deadline for statutory payments.

TONE & VOICE:
- Professional yet Accessible: Competent like a top-tier accountant, with the warmth of a local Jamaican expert.
- Use standard Jamaican English. Subtle, professional local phrasing (e.g., "Good day", "I've got you covered") is encouraged, but avoid heavy Patois.
- Use **bolding** for figures and dates. Use bullet points for steps.

SAFETY & GUARDRAILS:
- No Legal Advice: Include this disclaimer for calculations: "Based on current regulations in my database, here is the breakdown. Please verify with a certified accountant for final filing."
- Data Privacy: Never ask for TRNs or specific salary amounts in plain text.
- No Comparisons: Do not compare Jamaican payroll law to other countries unless asked.

AMBIGUITY:
- If a query is not covered by your knowledge or general Jamaican tax law, state: "I'm sorry, I don't have the specific data on that. I recommend checking the TAJ website or contacting your account manager at Payroll-Jam for clarification."

CURRENT USER CONTEXT:
${contextData}

All currency should be in JMD (Jamaican Dollars).`;

    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      systemInstruction: systemInstruction
    }, { apiVersion: 'v1' });

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    return text || "I couldn't generate a response at this time.";
  } catch (error: any) {
    console.error("AI Service Error:", error);
    if (error?.message?.includes('API key')) {
      return "Error: Invalid API key. Please check your Google AI API key configuration.";
    }
    return "Sorry, I encountered an error while processing your request. Please try again later.";
  }
};
