import React, { useState, useEffect, useRef } from 'react';
import { Scale, FileText, Zap, Upload, CheckCircle, Clock, Download, Loader, XCircle, Cloud, Database } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL;

interface ProgressStep {
  step: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  message: string;
  error: string;
  updated_at: string;
}

interface UploadedFile {
  name: string;
  id: string;
  status: 'uploading' | 'uploaded' | 'processing' | 'completed' | 'failed';
  uploadTime: string;
  error?: string;
  progress?: ProgressStep[];
}

interface ProcessingResult {
  id: string;
  original_file: string;
  processed_time: string;
  processing_duration?: string;
  total_chunks: number;
  successful_chunks: number;
  failed_chunks: number;
  cost: string;
  sharepoint?: {
    uploaded: boolean;
    files_count: number;
  };
  wordpress?: {
    uploaded: boolean;
    urls: string[];
  };
  azure_blob?: {
    uploaded: boolean;
    urls: Array<{ name: string; url: string }>;
  };
  docx_files?: string[];
  status: 'completed' | 'failed';
  error?: string;
}

const PROCESSING_STEPS = [
  { key: 'azure_upload', label: 'Azure Upload (Original PDF)', icon: Cloud },
  { key: 'initialization', label: 'Initialization', icon: Zap },
  { key: 'extraction', label: 'Text Extraction', icon: FileText },
  { key: 'ai_conversion', label: 'AI Conversion (Upto 24 hrs)', icon: Zap },
  { key: 'docx_creation', label: 'DOCX Creation', icon: FileText },
  { key: 'azure_docx_upload', label: 'Azure Upload (DOCX)', icon: Cloud },
  { key: 'sharepoint_upload', label: 'SharePoint Upload', icon: Database },
  { key: 'wordpress_upload', label: 'WordPress Upload', icon: Upload },
];

const StepIndicator: React.FC<{ step: ProgressStep | undefined; stepInfo: typeof PROCESSING_STEPS[0] }> = ({ step, stepInfo }) => {
  const Icon = stepInfo.icon;

  const getStepColor = () => {
    if (!step) return 'bg-gray-200 text-gray-400';
    if (step.status === 'completed') return 'bg-emerald-500 text-white';
    if (step.status === 'in_progress') return 'bg-blue-500 text-white animate-pulse';
    if (step.status === 'failed') return 'bg-red-500 text-white';
    return 'bg-gray-200 text-gray-400';
  };

  const getStatusIcon = () => {
    if (!step) return <Clock className="w-4 h-4" />;
    if (step.status === 'completed') return <CheckCircle className="w-4 h-4" />;
    if (step.status === 'in_progress') return <Loader className="w-4 h-4 animate-spin" />;
    if (step.status === 'failed') return <XCircle className="w-4 h-4" />;
    if (step.status === 'pending') return <Clock className="w-4 h-4" />;
    return <Icon className="w-4 h-4" />;
  };

  return (
    <div className="flex items-start space-x-3">
      <div className={`flex items-center justify-center w-8 h-8 rounded-full flex-shrink-0 transition-all duration-300 ${getStepColor()}`}>
        {getStatusIcon()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-slate-700">{stepInfo.label}</p>
          {step?.status === 'in_progress' && (
            <span className="text-xs text-blue-600 font-medium animate-pulse">Processing...</span>
          )}
          {step?.status === 'completed' && (
            <span className="text-xs text-emerald-600 font-medium">✓ Done</span>
          )}
          {step?.status === 'failed' && (
            <span className="text-xs text-red-600 font-medium">✗ Failed</span>
          )}
        </div>
        {step?.message && (
          <p className="text-xs text-slate-500 mt-1">{step.message}</p>
        )}
        {step?.error && (
          <p className="text-xs text-red-600 mt-1 font-medium">Error: {step.error}</p>
        )}
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [processedResults, setProcessedResults] = useState<ProcessingResult[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [modalData, setModalData] = useState<{filename: string; existing_files: Array<{name: string; url: string}>} | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const selectedFiles = Array.from(e.target.files).filter(f => f.type === 'application/pdf');
    setFiles(selectedFiles);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files).filter(f => f.type === 'application/pdf');
    setFiles(droppedFiles);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleUploadAreaClick = () => {
    fileInputRef.current?.click();
  };

  const handleUpload = async () => {
    setUploading(true);

    for (const file of files) {
      const tempFile: UploadedFile = {
        name: file.name,
        id: `temp-${Date.now()}`,
        status: 'uploading',
        uploadTime: new Date().toISOString()
      };

      setUploadedFiles(prev => [...prev, tempFile]);

      const formData = new FormData();
      formData.append('file', file);

      try {
        const response = await fetch(`${API_URL}/upload`, {
          method: 'POST',
          body: formData
        });

        if (!response.ok) throw new Error('Upload failed');

        const result = await response.json();

        if (result.already_processed) {
          setUploadedFiles(prev => prev.filter(f => f.id !== tempFile.id));
          setModalData({
            filename: result.filename,
            existing_files: result.existing_files
          });
          setShowModal(true);
          continue;
        }

        const completedFile: UploadedFile = {
          name: file.name,
          id: result.file_id,
          status: 'uploaded',
          uploadTime: new Date().toISOString()
        };

        setUploadedFiles(prev =>
          prev.map(f => f.id === tempFile.id ? completedFile : f)
        );
      } catch (error) {
        const failedFile: UploadedFile = {
          name: file.name,
          id: `error-${Date.now()}`,
          status: 'failed',
          uploadTime: new Date().toISOString(),
          error: error instanceof Error ? error.message : 'Upload failed'
        };

        setUploadedFiles(prev =>
          prev.map(f => f.id === tempFile.id ? failedFile : f)
        );
      }
    }

    setFiles([]);
    setUploading(false);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleReprocess = async () => {
    if (!modalData) return;

    setShowModal(false);
    setUploading(true);

    try {
      const response = await fetch(`${API_URL}/reprocess`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ filename: modalData.filename })
      });

      if (!response.ok) throw new Error('Reprocess failed');

      const result = await response.json();

      const newFile: UploadedFile = {
        name: result.filename,
        id: result.file_id,
        status: 'uploaded',
        uploadTime: new Date().toISOString()
      };

      setUploadedFiles(prev => [...prev, newFile]);
    } catch (error) {
      alert('Failed to reprocess file: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }

    setUploading(false);
    setModalData(null);
  };

  const checkForResults = async () => {
    try {
      const response = await fetch(`${API_URL}/status`);
      if (!response.ok) return;

      const statusData = await response.json();

      // Update all files with their progress
      setUploadedFiles(prev =>
        prev.map(f => {
          const update = statusData.files.find((s: any) => s.id === f.id || s.original_file === f.name);
          if (update) {
            return {
              ...f,
              id: update.id,
              status: update.status,
              progress: update.progress || []
            };
          }
          return f;
        })
      );

      // Get completed files
      const completedFiles = statusData.files.filter((f: any) => f.status === 'completed');
      setProcessedResults(completedFiles);
    } catch (error) {
      console.error('Error checking results:', error);
    }
  };

  const clearCompletedDocuments = async () => {
    try {
      const response = await fetch(`${API_URL}/clear-completed`, {
        method: 'POST',
      });
      if (response.ok) {
        setProcessedResults([]);
        setUploadedFiles(prev => prev.filter(f => f.status !== 'completed'));
        alert('Completed documents cleared successfully!');
      }
    } catch (error) {
      console.error('Error clearing completed documents:', error);
      alert('Failed to clear completed documents');
    }
  };

  useEffect(() => {
    if (uploadedFiles.length > 0) {
      const hasProcessing = uploadedFiles.some(f =>
        f.status === 'uploaded' || f.status === 'processing' || f.status === 'uploading'
      );

      if (!hasProcessing) return;

      const interval = setInterval(checkForResults, 3000); // Check every 3 seconds
      checkForResults();
      return () => clearInterval(interval);
    }
  }, [uploadedFiles.length]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <header className="bg-white shadow-sm border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center space-x-3">
            <div className="flex items-center justify-center w-12 h-12 bg-blue-600 rounded-xl">
              <Scale className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">LegalProcessor</h1>
              <p className="text-slate-600">Convert legal documents to plain English and Bullet points</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-8">
            <div className="bg-white rounded-2xl shadow-lg p-8">
              <h2 className="text-xl font-semibold text-slate-900 mb-6">Upload Documents</h2>
              <div
                className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:border-blue-400 transition cursor-pointer"
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onClick={handleUploadAreaClick}
              >
                <Upload className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf"
                  onChange={handleFileChange}
                  className="hidden"
                  id="file-upload"
                />
                <p className="text-blue-600 font-medium hover:text-blue-700">
                  Choose PDF files
                </p>
                <p className="text-slate-500 text-sm mt-2">or drag and drop</p>
              </div>

              {files.length > 0 && (
                <div className="mt-4 space-y-2">
                  {files.map((file, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                      <span className="text-sm text-slate-700 truncate flex-1">{file.name}</span>
                      <span className="text-xs text-slate-500 ml-2">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                    </div>
                  ))}
                  <button
                    onClick={handleUpload}
                    disabled={uploading}
                    className="w-full mt-4 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-slate-300 transition font-medium"
                  >
                    {uploading ? (
                      <span className="flex items-center justify-center">
                        <Loader className="w-5 h-5 mr-2 animate-spin" />
                        Uploading...
                      </span>
                    ) : (
                      `Upload ${files.length} file(s)`
                    )}
                  </button>
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl shadow-lg p-8">
              <h2 className="text-xl font-semibold text-slate-900 mb-6">What We Do</h2>
              <div className="space-y-4">
                <div className="flex items-start space-x-4">
                  <div className="flex items-center justify-center w-10 h-10 bg-emerald-100 rounded-lg flex-shrink-0">
                    <FileText className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <h3 className="font-medium text-slate-900">Plain English Translation</h3>
                    <p className="text-slate-600 text-sm">Convert complex legal language into clear text</p>
                  </div>
                </div>
                <div className="flex items-start space-x-4">
                  <div className="flex items-center justify-center w-10 h-10 bg-blue-100 rounded-lg flex-shrink-0">
                    <Zap className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-medium text-slate-900">Bullet-Point Summaries</h3>
                    <p className="text-slate-600 text-sm">Get concise summaries preserving legal meaning</p>
                  </div>
                </div>
                <div className="pt-4 border-t border-slate-200">
                  <p className="text-xs text-slate-500">
                    <strong>Processing time:</strong> Typically 30 minutes to 2 hours depending on document length.
                    Files are automatically uploaded to SharePoint and WordPress.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-8">
            {uploadedFiles.filter(f => f.status !== 'completed').length > 0 && (
              <div className="bg-white rounded-2xl shadow-lg p-8">
                <h2 className="text-xl font-semibold text-slate-900 mb-6">Processing Status</h2>
                <div className="space-y-6">
                  {uploadedFiles.filter(f => f.status !== 'completed').map((file, idx) => (
                    <div key={idx} className="border-2 border-slate-200 rounded-lg p-5 bg-slate-50">
                      <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-200">
                        <h3 className="text-sm font-semibold text-slate-900 truncate flex-1">{file.name}</h3>
                        {file.status === 'processing' && (
                          <span className="text-xs bg-blue-100 text-blue-700 px-3 py-1 rounded-full ml-2 font-medium">Processing</span>
                        )}
                        {file.status === 'uploaded' && (
                          <span className="text-xs bg-green-100 text-green-700 px-3 py-1 rounded-full ml-2 font-medium">Queued</span>
                        )}
                        {file.status === 'failed' && (
                          <span className="text-xs bg-red-100 text-red-700 px-3 py-1 rounded-full ml-2 font-medium">Failed</span>
                        )}
                      </div>

                      <div className="space-y-3">
                        {PROCESSING_STEPS.map((stepInfo) => {
                          const stepData = file.progress?.find(p => p.step === stepInfo.key);
                          return (
                            <StepIndicator
                              key={stepInfo.key}
                              step={stepData}
                              stepInfo={stepInfo}
                            />
                          );
                        })}
                      </div>

                      {file.error && (
                        <div className="mt-4 p-3 bg-red-50 rounded-lg border border-red-200">
                          <p className="text-xs text-red-700 font-medium">{file.error}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {processedResults.length > 0 && (
              <div className="bg-white rounded-2xl shadow-lg p-8">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-semibold text-slate-900">Completed Documents</h2>
                  <button
                    onClick={clearCompletedDocuments}
                    className="px-4 py-2 text-sm bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition"
                  >
                    Clear All
                  </button>
                </div>
                <div className="space-y-4">
                  {processedResults.map((result, idx) => (
                    <div key={idx} className="p-5 bg-gradient-to-r from-emerald-50 to-green-50 rounded-lg border border-emerald-200">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center space-x-2">
                          <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                          <span className="font-medium text-slate-900">{result.original_file}</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mb-3 text-sm">
                        <div className="text-slate-600"><span className="font-medium">Chunks:</span> {result.successful_chunks}/{result.total_chunks}</div>
                        <div className="text-slate-600"><span className="font-medium">Cost:</span> {result.cost}</div>
                      </div>
                      {result.azure_blob?.urls && result.azure_blob.urls.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-emerald-200">
                          <p className="text-xs font-medium text-slate-700 mb-2">Download Files:</p>
                          <div className="flex flex-wrap gap-2">
                            {result.azure_blob.urls.map((file, urlIdx) => (
                              <a key={urlIdx} href={file.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center px-3 py-1.5 bg-white text-blue-600 text-xs rounded-lg hover:bg-blue-50 border border-blue-200 font-medium">
                                <Download className="w-3 h-3 mr-1.5" />{file.name}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="mt-3 pt-3 border-t border-emerald-200">
                        <p className="text-xs text-slate-500">
                          SharePoint: {result.sharepoint?.uploaded ? '✓' : '✗'} |
                          WordPress: {result.wordpress?.uploaded ? '✓' : '✗'} |
                          Azure: {result.azure_blob?.uploaded ? '✓' : '✗'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {uploadedFiles.length === 0 && processedResults.length === 0 && (
              <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <FileText className="w-8 h-8 text-slate-400" />
                </div>
                <h3 className="text-lg font-medium text-slate-900 mb-2">No documents yet</h3>
                <p className="text-slate-600 text-sm">Upload a PDF to get started</p>
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 text-center text-sm text-slate-500">
        <p>Files are processed securely and stored for 24 hours before automatic deletion</p>
      </footer>

      {showModal && modalData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-8">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-slate-900">File Already Processed</h3>
              <button
                onClick={() => { setShowModal(false); setModalData(null); }}
                className="text-slate-400 hover:text-slate-600 transition"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            <div className="mb-6">
              <p className="text-slate-700 mb-4">
                <strong>{modalData.filename}</strong> has already been processed.
                You can download the existing files or reprocess the document.
              </p>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <p className="text-sm font-medium text-blue-900 mb-3">Existing Files:</p>
                <div className="space-y-2">
                  {modalData.existing_files.map((file, idx) => (
                    <a
                      key={idx}
                      href={file.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-3 bg-white rounded-lg hover:bg-blue-50 transition border border-blue-200"
                    >
                      <span className="text-sm font-medium text-slate-900">{file.name}</span>
                      <Download className="w-4 h-4 text-blue-600" />
                    </a>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex space-x-3">
              <button
                onClick={() => { setShowModal(false); setModalData(null); }}
                className="flex-1 px-4 py-3 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition font-medium"
              >
                Close
              </button>
              <button
                onClick={handleReprocess}
                className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
              >
                Reprocess File
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
