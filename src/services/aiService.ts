import { ChatMessage } from '../core/types';

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
      console.error(`Edge Function Error (${response.status}):`, errorText);
      let errorMessage = `Failed to get response from AI Assistant (Status ${response.status})`;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorMessage;
      } catch (e) {
        errorMessage = errorText || errorMessage;
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    if (data.error) {
      throw new Error(data.error);
    }
    return data.text || "I'm sorry, I couldn't generate a response based on the knowledge base at this moment.";
  } catch (error: any) {
    console.error("Grounded AI Service Error:", error);
    // If we have a specific error message, use it. Otherwise, show the parsed error.
    const displayMessage = error.message && error.message.includes('Unexpected token')
      ? "Communication error with AI Assistant. Please try again."
      : error.message;
    return `Error: ${displayMessage || 'I encountered an error connecting to the payroll knowledge base.'}`;
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

export const getSupportAIResponse = async (
  message: string,
  history: ChatMessage[]
): Promise<string> => {
  if (!API_KEY) {
    return "Error: AI Service is not configured. Please add your Google AI API key to the environment variables.";
  }

  try {
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const genAI = new GoogleGenerativeAI(API_KEY);

    const systemInstruction = `You are a support intake assistant for Payroll-Jam, a payroll software company.
Your job is to modify the contact form and collect the user's support requests.

The form has these steps:
1. Collect full name, work email, company name, and phone number. (Required)
2. Ask the user to select an enquiry type: Technical Support, Billing, Sales & Plans, Onboarding, or General.
3. Based on the enquiry type selected, show the relevant subject options:
   - Technical Support: Cannot upload documents | Login or access issues | Payroll calculation errors | Integration not working | Other technical issue
   - Billing: Charge I don't recognise | Request a refund | Update payment method | Cancel my subscription | Invoice or receipt request
   - Sales & Plans: Upgrade my plan | Compare plans | Request a demo | Volume or enterprise pricing | Other sales enquiry
   - Onboarding: Account setup help | Employee onboarding issue | ID verification problem | Importing data | Other onboarding question
   - General: Product feedback | Partnership enquiry | Press or media | Other
4. Show a helpful context tip based on the enquiry type to guide what the user should include in their message.
5. Ask the user to select a priority level: Low, Medium, or Urgent.
6. Ask the user to describe their issue in detail. Prompt them with the relevant context tip if they seem vague.
7. Summarise the submission back to the user before confirming, so they can correct anything.
8. On confirmation, submit the following structured data to the backend:
   { name, email, company, phone, enquiry_type, subject, priority, message }

Tone: professional, warm, efficient. Brand colors: dark navy (#1A1F2E) and gold (#F5A623). Keep responses concise. Do not ask for information already provided.

CRITICAL: When the user confirms the details are correct, you must generate a final response that contains a JSON object at the very end of your response, prefixed by "SUBMIT_DATA: ", like this:
SUBMIT_DATA: {"name": "John Doe", "email": "john@example.com", "company": "Example Inc", "phone": "123-456-7890", "enquiry_type": "Technical Support", "subject": "Cannot upload documents", "priority": "Urgent", "message": "My PDF uploads are failing with error 500."}

Make sure all 8 fields are filled. If phone was not provided, use an empty string.
Ensure the JSON is valid and on a single line. Do not write markdown blocks around it.`;

    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      systemInstruction: systemInstruction
    }, { apiVersion: 'v1' });

    // Format history for Gemini (maximum 15 messages for context window stability)
    const contents = history.slice(-15).map(msg => ({
      role: msg.role === 'model' ? 'model' as const : 'user' as const,
      parts: [{ text: msg.text }]
    }));

    // Add current user message
    contents.push({
      role: 'user',
      parts: [{ text: message }]
    });

    const result = await model.generateContent({ contents });
    const response = await result.response;
    return response.text() || "I couldn't generate a response at this time.";
  } catch (error: any) {
    console.error("Support AI Service Error:", error);
    return `Error: ${error.message || 'I encountered an error connecting to the support system.'}`;
  }
};
