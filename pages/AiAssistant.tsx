
import React, { useState, useEffect, useRef } from 'react';
import { getAIResponse } from '../services/aiService';
import { ChatMessage, Employee } from '../types';
import { Icons } from '../components/Icons';

interface AiAssistantProps {
  employees: Employee[];
}

export const AiAssistant: React.FC<AiAssistantProps> = ({ employees }) => {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'model',
      text: `Hello! I'm JamBot, your AI payroll assistant. I can help with Jamaican labour laws, drafting letters, or analyzing your payroll data. How can I help today?`,
      timestamp: Date.now()
    }
  ]);
  
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMsg: ChatMessage = { role: 'user', text: input, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    // Create context string from current app state
    const context = `
      Company: JamCorp Ltd.
      Total Employees: ${employees.length}
      Active Employees: ${employees.map(e => `${e.firstName} ${e.lastName} (${e.role})`).join(', ')}.
      Current Tax Year: 2025.
      Pay Cycle: Monthly.
    `;

    const responseText = await getAIResponse(userMsg.text, context);
    
    const modelMsg: ChatMessage = { role: 'model', text: responseText, timestamp: Date.now() };
    setMessages(prev => [...prev, modelMsg]);
    setIsLoading(false);
  };

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="p-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
        <div className="flex items-center">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center text-white">
            <Icons.AI className="w-5 h-5" />
          </div>
          <div className="ml-3">
            <h3 className="font-bold text-gray-900">JamBot HR Assistant</h3>
            <p className="text-xs text-gray-500">Powered by JamBot Intelligence</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/50">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div 
              className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === 'user' 
                  ? 'bg-jam-black text-white rounded-br-none' 
                  : 'bg-white border border-gray-200 text-gray-800 rounded-bl-none shadow-sm'
              }`}
            >
              {msg.text}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-none px-4 py-3 shadow-sm flex items-center space-x-2">
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100" />
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="p-4 bg-white border-t border-gray-200">
        <div className="flex space-x-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Ask about statutory taxes, holiday pay, or draft a letter..."
            className="flex-1 border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-jam-orange"
            disabled={isLoading}
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="bg-jam-orange hover:bg-yellow-500 text-jam-black font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
             Send
          </button>
        </div>
        <p className="text-xs text-center text-gray-400 mt-2">AI can make mistakes. Review generated HR advice.</p>
      </div>
    </div>
  );
};
