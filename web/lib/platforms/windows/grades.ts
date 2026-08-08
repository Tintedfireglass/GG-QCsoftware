// Grade utility functions for the web dashboard

export type DeviceGrade = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

// Grade → Tailwind background + text class (legacy A–F)
export const gradeStyles: Record<string, { bg: string; text: string; border: string }> = {
    'A+': { bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-l-emerald-500' },
    A: { bg: 'bg-green-100', text: 'text-green-800', border: 'border-l-green-500' },
    B: { bg: 'bg-teal-100', text: 'text-teal-800', border: 'border-l-teal-500' },
    C: { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-l-amber-500' },
    D: { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-l-orange-500' },
    E: { bg: 'bg-red-100', text: 'text-red-800', border: 'border-l-red-500' },
    F: { bg: 'bg-red-200', text: 'text-red-900', border: 'border-l-red-700' },
    Reject: { bg: 'bg-red-200', text: 'text-red-900', border: 'border-l-red-700' },
};

const defaultStyle = { bg: 'bg-gray-100', text: 'text-gray-800', border: 'border-l-gray-400' };

export function getGradeStyle(grade?: string) {
    if (!grade) return defaultStyle;
    return gradeStyles[grade] || gradeStyles[grade.toUpperCase()] || defaultStyle;
}

export function gradeLabel(grade?: string): string {
    if (!grade) return 'Unknown';
    const g = grade.toUpperCase() === 'REJECT' ? 'Reject' : grade.toUpperCase();
    switch (g) {
        case 'A+': return 'Certified Premium';
        case 'A': return 'Certified';
        case 'B': return 'Good Condition';
        case 'C': return 'Acceptable';
        case 'D': return 'Below Average';
        case 'Reject': return 'Not Certified';
        // Legacy grades
        case 'E': return 'Poor Condition';
        case 'F': return 'Non-Functional';
        default: return 'Unknown';
    }
}

// Large text color for hero grade display
export function gradeHeroColor(grade?: string): string {
    if (!grade) return 'text-gray-500';
    const g = grade.toUpperCase() === 'REJECT' ? 'Reject' : grade;
    switch (g) {
        case 'A+': return 'text-emerald-700';
        case 'A': return 'text-green-700';
        case 'B': return 'text-teal-700';
        case 'C': return 'text-amber-700';
        case 'Reject': return 'text-red-900';
        // Legacy
        case 'D': return 'text-orange-700';
        case 'E': return 'text-red-700';
        case 'F': return 'text-red-900';
        default: return 'text-gray-500';
    }
}

