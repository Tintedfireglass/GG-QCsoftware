// Grade utility functions for the web dashboard

export type DeviceGrade = 'S' | 'A' | 'B' | 'C' | 'D' | 'E';

// Grade → Tailwind background + text class
export const gradeStyles: Record<string, { bg: string; text: string; border: string }> = {
    S: { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-l-yellow-500' },
    A: { bg: 'bg-green-100', text: 'text-green-800', border: 'border-l-green-500' },
    B: { bg: 'bg-teal-100', text: 'text-teal-800', border: 'border-l-teal-500' },
    C: { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-l-amber-500' },
    D: { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-l-orange-500' },
    E: { bg: 'bg-red-100', text: 'text-red-800', border: 'border-l-red-500' },
};

const defaultStyle = { bg: 'bg-gray-100', text: 'text-gray-800', border: 'border-l-gray-400' };

export function getGradeStyle(grade?: string) {
    if (!grade) return defaultStyle;
    return gradeStyles[grade.toUpperCase()] || defaultStyle;
}

export function gradeLabel(grade?: string): string {
    switch (grade?.toUpperCase()) {
        case 'S': return 'Pristine';
        case 'A': return 'Excellent';
        case 'B': return 'Good';
        case 'C': return 'Acceptable';
        case 'D': return 'Below Average';
        case 'E': return 'Poor';
        default: return 'Unknown';
    }
}

// Large text color for hero grade display
export function gradeHeroColor(grade?: string): string {
    switch (grade?.toUpperCase()) {
        case 'S': return 'text-yellow-600';
        case 'A': return 'text-green-700';
        case 'B': return 'text-teal-700';
        case 'C': return 'text-amber-700';
        case 'D': return 'text-orange-700';
        case 'E': return 'text-red-700';
        default: return 'text-gray-500';
    }
}
