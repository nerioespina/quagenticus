import React, { useState, useRef } from 'react';
import { UploadCloud, Loader2 } from 'lucide-react';

interface FileDropZoneProps {
  onUpload: (file: File) => void;
  isUploading?: boolean;
}

export default function FileDropZone({ onUpload, isUploading = false }: FileDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      onUpload(file);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      onUpload(file);
      e.target.value = '';
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => !isUploading && fileInputRef.current?.click()}
      className={`relative flex flex-col items-center justify-center p-4 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
        isDragging
          ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300'
          : 'border-slate-700 hover:border-slate-500 bg-slate-900/40 text-slate-400 hover:text-slate-200'
      } ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileSelect}
        disabled={isUploading}
      />
      {isUploading ? (
        <div className="flex items-center gap-2 text-xs">
          <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />
          <span>Subiendo archivo...</span>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-1 text-center">
          <UploadCloud className="h-6 w-6 text-slate-400" />
          <p className="text-xs font-medium">
            Arrastra archivos aquí o <span className="text-indigo-400 underline">haz clic para seleccionar</span>
          </p>
          <span className="text-[10px] text-slate-500">Máx. 10 MB (imágenes, PDF, documentos)</span>
        </div>
      )}
    </div>
  );
}
