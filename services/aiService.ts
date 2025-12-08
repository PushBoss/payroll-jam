
declare const process: any;

const API_KEY = process.env.API_KEY || '';

export const getAIResponse = async (
  prompt: string,
  contextData: string
): Promise<string> => {
  if (!API_KEY) {
    return "Error: AI Service is not configured.";
  }

  try {
    // Dynamically import the provider
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey: API_KEY });
    
    const systemInstruction = `You are 'JamBot', an expert Jamaican HR and Payroll assistant for the SaaS platform 'Payroll-Jam'. 
    
    Your knowledge base includes:
    1. Jamaican Labour Laws (Employment (Termination and Redundancy Payments) Act, Holidays with Pay Act, etc.).
    2. Statutory Deductions (NIS, NHT, Education Tax, PAYE).
    3. Standard HR practices.

    Context regarding the current user's company data:
    ${contextData}

    Be helpful, professional, and concise. If asked to draft a document (like a termination letter or contract), use proper formatting.
    All currency should be in JMD (Jamaican Dollars).`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.7,
      }
    });

    return response.text || "I couldn't generate a response at this time.";
  } catch (error) {
    console.error("AI Service Error:", error);
    return "Sorry, I encountered an error while processing your request. Please try again later.";
  }
};
