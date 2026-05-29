import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * Download a file using the modern File System Access API (showSaveFilePicker).
 * This opens a native "Save As" dialog so the user can choose filename and location.
 * Falls back to anchor-based download if the API is not supported.
 */
const downloadFile = async (blob, filename, mimeType) => {
    // Try File System Access API first (Chrome 86+, Edge 86+)
    if (window.showSaveFilePicker) {
        try {
            const extension = filename.split('.').pop();
            const descriptions = {
                pdf: 'PDF Documents',
                csv: 'CSV Files',
                txt: 'Text Files',
            };
            const mimeTypes = {
                pdf: 'application/pdf',
                csv: 'text/csv',
                txt: 'text/plain',
            };

            const handle = await window.showSaveFilePicker({
                suggestedName: filename,
                types: [{
                    description: descriptions[extension] || 'Files',
                    accept: {
                        [mimeTypes[extension] || mimeType || 'application/octet-stream']: [`.${extension}`],
                    },
                }],
            });

            const writable = await handle.createWritable();
            await writable.write(blob);
            await writable.close();
            return;
        } catch (err) {
            // User cancelled the dialog or API failed - fall through to fallback
            if (err.name === 'AbortError') return; // User cancelled
            // showSaveFilePicker failed — fall through to anchor fallback
        }
    }

    // Fallback: anchor with download attribute
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 300);
};

/**
 * Export data to CSV file and trigger download.
 */
export const exportCSV = async (filename, headers, rows) => {
    try {
        const csvLines = [
            headers.join(','),
            ...rows.map(row =>
                row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')
            ),
        ];
        const csvContent = '\uFEFF' + csvLines.join('\r\n');
        const fullFilename = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        await downloadFile(blob, fullFilename, 'text/csv');
    } catch (error) {
        alert('Failed to export CSV: ' + error.message);
    }
};

/**
 * Export data to PDF file and trigger download.
 */
export const exportPDF = async (filename, title, headers, rows, options = {}) => {
    try {
        const { summary = null, orientation = 'landscape' } = options;
        const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });

        // Title
        doc.setFontSize(18);
        doc.setTextColor(33, 37, 41);
        doc.text(title, 14, 20);

        // Subtitle
        doc.setFontSize(10);
        doc.setTextColor(108, 117, 125);
        doc.text('Generated: ' + new Date().toLocaleString(), 14, 28);
        doc.text('PLMun Inventory Nexus', 14, 33);

        let startY = 40;

        // Summary section
        if (summary) {
            doc.setFontSize(11);
            doc.setTextColor(33, 37, 41);
            const entries = Object.entries(summary);
            entries.forEach(([key, value], i) => {
                const col = i % 3;
                const rowIdx = Math.floor(i / 3);
                const x = 14 + col * 90;
                const y = startY + rowIdx * 7;
                doc.setFont(undefined, 'bold');
                const label = key + ': ';
                doc.text(label, x, y);
                doc.setFont(undefined, 'normal');
                doc.text(String(value), x + doc.getTextWidth(label), y);
            });
            startY += Math.ceil(entries.length / 3) * 7 + 5;
        }

        // Ensure all cell values are strings
        const stringRows = rows.map(row => row.map(cell => String(cell ?? '')));

        // Generate table using the function-style API
        autoTable(doc, {
            head: [headers],
            body: stringRows,
            startY: startY,
            theme: 'grid',
            headStyles: {
                fillColor: [37, 99, 235],
                textColor: 255,
                fontStyle: 'bold',
                fontSize: 9,
            },
            bodyStyles: {
                fontSize: 8,
                textColor: [33, 37, 41],
            },
            alternateRowStyles: {
                fillColor: [245, 247, 250],
            },
            styles: {
                cellPadding: 3,
                overflow: 'linebreak',
            },
            margin: { top: 10, left: 14, right: 14 },
        });

        // Page footer
        const pageCount = doc.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(150);
            const pageH = doc.internal.pageSize.height;
            const pageW = doc.internal.pageSize.width;
            doc.text('Page ' + i + ' of ' + pageCount, 14, pageH - 10);
            doc.text('PLMun Inventory Nexus', pageW - 60, pageH - 10);
        }

        // Save as PDF using File System Access API with Save As dialog
        const fullFilename = filename + '_' + new Date().toISOString().split('T')[0] + '.pdf';
        const pdfBlob = doc.output('blob');
        await downloadFile(pdfBlob, fullFilename, 'application/pdf');
    } catch (error) {
        alert('Failed to export PDF: ' + error.message);
    }
};
