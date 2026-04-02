
import React, { useState } from 'react';
import { Icons } from './Icons';

interface MultiDateCalendarProps {
  selectedDates: string[];
  onChange: (dates: string[]) => void;
}

export const MultiDateCalendar: React.FC<MultiDateCalendarProps> = ({ selectedDates, onChange }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  
  // Helper to format YYYY-MM-DD locally
  const formatDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month); // 0 = Sunday

  const handlePrevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const handleNextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const toggleDate = (day: number) => {
    const dateStr = formatDate(new Date(year, month, day));
    let newDates;
    if (selectedDates.includes(dateStr)) {
      newDates = selectedDates.filter(d => d !== dateStr);
    } else {
      newDates = [...selectedDates, dateStr].sort();
    }
    onChange(newDates);
  };

  // Generate Grid
  const blanks = Array(firstDay).fill(null);
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 w-full max-w-sm mx-auto shadow-sm">
      <div className="flex justify-between items-center mb-4">
        <button type="button" onClick={handlePrevMonth} className="p-2 hover:bg-gray-100 rounded-full text-gray-600">
            <Icons.Back className="w-5 h-5" />
        </button>
        <span className="font-bold text-gray-900 text-sm">
            {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </span>
        <button type="button" onClick={handleNextMonth} className="p-2 hover:bg-gray-100 rounded-full text-gray-600">
            <Icons.Next className="w-5 h-5" />
        </button>
      </div>
      
      <div className="grid grid-cols-7 gap-1 mb-2">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
            <div key={d} className="text-center text-xs font-bold text-gray-400 uppercase">{d}</div>
        ))}
      </div>
      
      <div className="grid grid-cols-7 gap-1">
        {blanks.map((_, i) => <div key={`blank-${i}`} />)}
        {days.map(day => {
            const dateStr = formatDate(new Date(year, month, day));
            const isSelected = selectedDates.includes(dateStr);
            return (
                <button
                    key={day}
                    type="button"
                    onClick={() => toggleDate(day)}
                    className={`h-9 w-9 rounded-full flex items-center justify-center text-sm transition-all duration-200
                        ${isSelected 
                            ? 'bg-jam-orange text-jam-black font-bold shadow-md transform scale-105' 
                            : 'hover:bg-gray-100 text-gray-700'
                        }
                    `}
                >
                    {day}
                </button>
            );
        })}
      </div>
      
      <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between items-center">
          <p className="text-xs text-gray-500">Selected: <span className="font-bold text-jam-black">{selectedDates.length} days</span></p>
          {selectedDates.length > 0 && (
            <button 
                type="button"
                onClick={() => onChange([])}
                className="text-xs text-red-500 hover:underline"
            >
                Clear All
            </button>
          )}
      </div>
    </div>
  );
};
