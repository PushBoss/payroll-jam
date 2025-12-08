
// TODO: Add your Google AI API key here or set VITE_GOOGLE_AI_KEY in .env
const API_KEY = import.meta.env.VITE_GOOGLE_AI_KEY || '';

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
    
    const systemInstruction = `You are 'JamBot', an expert Jamaican HR and Payroll assistant for the SaaS platform 'Payroll-Jam'. 
    
    Your knowledge base includes:
    1. Jamaican Labour Laws (Employment (Termination and Redundancy Payments) Act, Holidays with Pay Act, etc.).
    2. Statutory Deductions (NIS 3% employee/2.5% employer, NHT 2% employee/3% employer, Education Tax 2.25%, HEART 3% employer, PAYE 25%/30%).
    3. Standard HR practices.

    Context regarding the current user's company data:
    ${contextData}

    Be helpful, professional, and concise. If asked to draft a document (like a termination letter or contract), use proper formatting.
    All currency should be in JMD (Jamaican Dollars).`;

    const model = genAI.getGenerativeModel({ 
      model: 'gemini-1.5-flash',
      systemInstruction: systemInstruction
    });

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
