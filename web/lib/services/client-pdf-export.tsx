import React from 'react';
import { createRoot } from 'react-dom/client';
import { toJpeg } from 'html-to-image';
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
    
    // We add it to the body because elements need to be in the DOM to render
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

    // 3. Render the container to a canvas JPEG
    // html-to-image supports modern CSS colors (like Tailwind v4 oklch/lab) 
    // by using native SVG foreignObject instead of manual parsing.
    const imgData = await toJpeg(container, {
        quality: 0.95,
        backgroundColor: '#ffffff',
        pixelRatio: 2 // equivalent to scale: 2 for crispness
    });

    // 4. Clean up the DOM
    root.unmount();
    document.body.removeChild(container);

    // 5. Convert JPEG to PDF
    const img = new Image();
    img.src = imgData;
    await new Promise((resolve) => {
        img.onload = resolve;
    });

    const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
    });

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (img.height * pdfWidth) / img.width;
    
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
