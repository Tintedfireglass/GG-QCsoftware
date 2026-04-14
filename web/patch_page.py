import sys

with open(r'app/dashboard/page.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

old_string = (
    '<span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${s.bg} ${s.text}`}>\n'
    '                                                            {test.pramaan_grade} — {test.pramaan_score}\n'
    '                                                        </span>'
)
new_string = (
    '<div className=\"flex items-center gap-2\">\n'
    '                                                            <span className={`text-[15px] font-bold ${gradeHeroColor(test.pramaan_grade)}`}>\n'
    '                                                                {test.pramaan_grade}\n'
    '                                                            </span>\n'
    '                                                            <span className={`inline-flex items-center rounded-lg px-3 py-1 text-sm font-bold ${s.bg} ${s.text} border-2 border-[currentColor]/10`}>\n'
    '                                                                {test.pramaan_score}\n'
    '                                                            </span>\n'
    '                                                        </div>'
)

if "import { getGradeStyle } from" in text:
    text = text.replace("import { getGradeStyle } from", "import { getGradeStyle, gradeHeroColor } from")

text = text.replace(old_string, new_string)

with open(r'app/dashboard/page.tsx', 'w', encoding='utf-8') as f:
    f.write(text)
print("done")
