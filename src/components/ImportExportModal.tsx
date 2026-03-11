import React, { useState } from 'react';
import { Download, Upload, Copy, Check } from 'lucide-react';
import { BaseModal } from './BaseModal';

interface ImportExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: () => Promise<string>;
  onImport: (data: string) => Promise<number>;
}

export const ImportExportModal: React.FC<ImportExportModalProps> = ({
  isOpen,
  onClose,
  onExport,
  onImport,
}) => {
  const [activeTab, setActiveTab] = useState<'export' | 'import'>('export');
  const [exportData, setExportData] = useState('');
  const [importData, setImportData] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [copied, setCopied] = useState(false);

  const handleExport = async () => {
    setIsLoading(true);
    setError('');
    try {
      const data = await onExport();
      setExportData(data);
      setSuccess('Services exported successfully!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export services');
    } finally {
      setIsLoading(false);
    }
  };

  const handleImport = async () => {
    setIsLoading(true);
    setError('');
    setSuccess('');
    try {
      JSON.parse(importData); // validate first
      const count = await onImport(importData);
      setSuccess(`Successfully imported ${count} service(s)!`);
      setImportData('');
      setTimeout(onClose, 2000);
    } catch (err) {
      if (err instanceof SyntaxError) {
        setError('Invalid JSON format. Please check your input.');
      } else {
        setError(err instanceof Error ? err.message : 'Failed to import services');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([exportData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `services-export-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(exportData);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Failed to copy to clipboard');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = event => setImportData(event.target?.result as string);
      reader.readAsText(file);
    }
  };

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="Import / Export Services"
      maxWidth="2xl"
      error={error}
      success={success}
    >
      {/* Tab bar — lives between header and content */}
      <div className="-mx-6 -mt-6 mb-6 flex border-b border-gray-200 dark:border-gray-700">
        {(['export', 'import'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => { setActiveTab(tab); setError(''); setSuccess(''); }}
            className={`flex-1 px-6 py-3 text-sm font-medium capitalize ${
              activeTab === tab
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            {tab === 'export'
              ? <><Download className="inline mr-2" size={16} />Export</>
              : <><Upload className="inline mr-2" size={16} />Import</>
            }
          </button>
        ))}
      </div>

      {activeTab === 'export' ? (
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Export all your services as a JSON backup.
          </p>

          {!exportData ? (
            <button
              onClick={handleExport}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              <Download size={18} />
              {isLoading ? 'Exporting…' : 'Export Services'}
            </button>
          ) : (
            <>
              <textarea
                value={exportData}
                readOnly
                className="w-full h-64 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleDownload}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  <Download size={16} />
                  Download
                </button>
                <button
                  onClick={handleCopy}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Import services from a JSON file. New services are added without replacing existing ones.
          </p>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Upload JSON File
            </label>
            <input
              type="file"
              accept=".json"
              onChange={handleFileUpload}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Or Paste JSON
            </label>
            <textarea
              value={importData}
              onChange={e => setImportData(e.target.value)}
              className="w-full h-48 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm"
              placeholder="Paste your JSON data here…"
            />
          </div>

          <button
            onClick={handleImport}
            disabled={isLoading || !importData.trim()}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            <Upload size={18} />
            {isLoading ? 'Importing…' : 'Import Services'}
          </button>
        </div>
      )}
    </BaseModal>
  );
};
