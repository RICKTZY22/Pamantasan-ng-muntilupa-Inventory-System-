import React, { useState, useRef } from 'react';
import { Upload, X, Image as ImageIcon } from '@phosphor-icons/react';

const ImageUpload = ({ value, onChange, className = '', compact = false }) => {
    const [preview, setPreview] = useState(value || null);
    const [isDragging, setIsDragging] = useState(false);
    const [uploadError, setUploadError] = useState('');
    const fileInputRef = useRef(null);

    const handleFileChange = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            processFile(file);
        }
    };

    const processFile = (file) => {
        if (!file.type.startsWith('image/')) {
            setUploadError('Please upload an image file');
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            setUploadError('Image must be less than 5MB');
            return;
        }

        setUploadError('');

        // Show preview using base64
        const reader = new FileReader();
        reader.onloadend = () => {
            setPreview(reader.result);
        };
        reader.readAsDataURL(file);

        // Pass the actual File object for FormData upload
        onChange?.(file);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) {
            processFile(file);
        }
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => {
        setIsDragging(false);
    };

    const handleRemove = () => {
        setPreview(null);
        onChange?.(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    return (
        <div className={`space-y-2 ${className}`}>
            <label className="block text-xs font-bold text-gray-500 uppercase ml-1">
                Item Image
            </label>

            {preview ? (
                <div className="relative group">
                    <img
                        src={preview}
                        alt="Preview"
                        className="w-full h-40 object-cover rounded-xl border border-gray-200"
                    />
                    <button
                        type="button"
                        onClick={handleRemove}
                        className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                        <X size={14} />
                    </button>
                </div>
            ) : (
                <div
                    onClick={() => fileInputRef.current?.click()}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    className={`
                        flex flex-col items-center justify-center
                        w-full ${compact ? 'h-20' : 'h-40'} 
                        border-2 border-dashed rounded-xl
                        cursor-pointer transition-all
                        ${isDragging
                            ? 'border-primary bg-primary/10'
                            : 'border-gray-300 bg-gray-50 hover:bg-gray-100 hover:border-gray-400'
                        }
                    `}
                >
                    <div className="flex flex-col items-center gap-2 text-gray-500">
                        {isDragging ? (
                            <>
                                <ImageIcon size={32} className="text-primary" />
                                <span className="text-sm font-medium text-primary">Drop image here</span>
                            </>
                        ) : (
                            <>
                                <Upload size={compact ? 20 : 32} className="text-gray-400" />
                                <span className="text-sm font-medium">Click or drag to upload</span>
                                {!compact && <span className="text-xs text-gray-400">PNG, JPG up to 5MB</span>}
                            </>
                        )}
                    </div>
                </div>
            )}

            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
            />
            {uploadError && (
                <p className="text-xs text-red-500 mt-1 ml-1">{uploadError}</p>
            )}
        </div>
    );
};

export default ImageUpload;
