import React from 'react';
import { createRoot } from 'react-dom/client';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import JSZip from 'jszip';
import { ReportLayout } from '@/components/report-layout';

// Generate a PDF blob from a single report data object
async function generateSingleReportPdfBlob(data: any): Promise<Blob> {
    // 1. Create a hidden container off-screen
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.top = '-9999px';
    container.style.left = '-9999px';
    container.style.width = '210mm'; // Force A4 width for rendering
    // Add white background so it doesn't render transparent
    container.style.backgroundColor = 'white';
    
    // We add it to the body because html2canvas needs elements to be in the DOM to render
    document.body.appendChild(container);

    // 2. Render the React component into the container
    const root = createRoot(container);
    
    // We wrap it in the exact same wrapper div the page uses
    root.render(
        <div className="font-sans text-black bg-white p-8 max-w-[210mm] mx-auto min-h-screen">
            <ReportLayout data={data} />
        </div>
    );

    // Wait for the React tree to fully render and DOM to update
    await new Promise((resolve) => setTimeout(resolve, 500));

    // 3. Render the container to a canvas
    // scale: 2 improves text crispness but keeps file size reasonable
    const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
    });

    // 4. Clean up the DOM
    root.unmount();
    document.body.removeChild(container);

    // 5. Convert canvas to PDF
    // A4 dimensions at 72 DPI (jsPDF default) are 210mm x 297mm
    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
    });

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
    
    let heightLeft = pdfHeight;
    let position = 0;
    
    // Support multi-page if the content exceeds A4 height
    pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, pdfHeight);
    heightLeft -= pdf.internal.pageSize.getHeight();

    while (heightLeft > 0) {
        position = heightLeft - pdfHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, pdfHeight);
        heightLeft -= pdf.internal.pageSize.getHeight();
    }

    return pdf.output('blob');
}

export async function generateSampleReportsZip(
    reportsData: any[],
    onProgress: (current: number, total: number) => void
): Promise<Blob> {
    const zip = new JSZip();
    const folder = zip.folder('pramaan_reports');
    if (!folder) throw new Error("Could not create zip folder");

    let count = 0;
    for (const report of reportsData) {
        count++;
        onProgress(count, reportsData.length);
        
        const blob = await generateSingleReportPdfBlob(report);
        
        const serial = (report.system_serial as string | undefined) || `id${report.id}`;
        const safeName = serial.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
        
        folder.file(`${safeName}_report_${report.id}.pdf`, blob);
    }

    // Compress the ZIP
    return await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}
