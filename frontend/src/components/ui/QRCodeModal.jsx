import React, { useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { X, Printer, DownloadSimple as Download, QrCode } from '@phosphor-icons/react';
import { escapeHtml } from '../../utils/htmlUtils';

const QRCodeModal = ({ isOpen, onClose, item }) => {
    const qrRef = useRef(null);

    if (!isOpen || !item) return null;

    // Generate QR data - could be a URL or JSON with item info
    const qrData = JSON.stringify({
        id: item.id,
        name: item.name,
        category: item.category,
        location: item.location,
    });

    const handlePrint = () => {
        const printWindow = window.open('', '_blank');
        const safeItem = {
            id: escapeHtml(item.id),
            name: escapeHtml(item.name),
            category: escapeHtml(item.category),
            location: escapeHtml(item.location),
        };

        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>QR Code - ${safeItem.name}</title>
                <style>
                    body {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        min-height: 100vh;
                        font-family: Arial, sans-serif;
                        margin: 0;
                        padding: 20px;
                    }
                    .container {
                        text-align: center;
                        padding: 30px;
                        border: 2px solid #000;
                        border-radius: 12px;
                    }
                    h2 { margin: 0 0 5px 0; font-size: 18px; }
                    p { margin: 5px 0; color: #666; font-size: 14px; }
                    .qr-wrapper { margin: 20px 0; }
                    .item-id { font-size: 12px; color: #999; margin-top: 15px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h2>${safeItem.name}</h2>
                    <p>${safeItem.category} - ${safeItem.location}</p>
                    <div class="qr-wrapper">
                        ${qrRef.current?.innerHTML || ''}
                    </div>
                    <p class="item-id">ID: ${safeItem.id}</p>
                </div>
                <script>window.onload = function() { window.print(); window.close(); }</script>
            </body>
            </html>
        `);
        printWindow.document.close();
    };

    const handleDownload = () => {
        const svg = qrRef.current?.querySelector('svg');
        if (!svg) return;

        const svgData = new XMLSerializer().serializeToString(svg);
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();

        img.onload = () => {
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);

            const link = document.createElement('a');
            link.download = `qr-${item.name.replace(/\s+/g, '-').toLowerCase()}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        };

        img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={onClose}
            />

            <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4 animate-in zoom-in-95 duration-200">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                    <X size={20} className="text-gray-500" />
                </button>

                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-primary/10 rounded-lg">
                        <QrCode className="text-primary" size={24} />
                    </div>
                    <div>
                        <h3 className="font-bold text-gray-800 dark:text-white">Item QR Code</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Scan to identify item</p>
                    </div>
                </div>

                <div className="text-center mb-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-xl">
                    <h4 className="font-semibold text-gray-800 dark:text-white truncate">{item.name}</h4>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{item.category} • {item.location}</p>
                </div>

                <div
                    ref={qrRef}
                    className="flex justify-center p-6 bg-white rounded-xl border border-gray-200"
                >
                    <QRCodeSVG
                        value={qrData}
                        size={180}
                        level="H"
                        includeMargin={true}
                        bgColor="#ffffff"
                        fgColor="#000000"
                    />
                </div>

                <p className="text-center text-xs text-gray-400 mt-3">
                    Item ID: <span className="font-mono">{item.id}</span>
                </p>

                <div className="flex gap-3 mt-6">
                    <button
                        onClick={handleDownload}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                        <Download size={18} />
                        Download
                    </button>
                    <button
                        onClick={handlePrint}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-white rounded-xl hover:bg-primary/90 transition-colors"
                    >
                        <Printer size={18} />
                        Print
                    </button>
                </div>
            </div>
        </div>
    );
};

export default QRCodeModal;
