import React, { useState } from 'react';
import { Download, Upload, Copy, Check } from 'lucide-react';
import { BaseModal } from './BaseModal';

interface ImportExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: () => Promise<string>;
  onImport: (data: string) => Promise<number>;
}

const textareaStyle: React.CSSProperties = {
  display: 'block', width: '100%', minWidth: 0,
  padding: '10px 12px',
  background: 'var(--raised)',
  border: '1px solid var(--line-2)',
  borderRadius: 'var(--r-sm)',
  color: 'var(--t1)',
  fontSize: 12,
  fontFamily: 'Geist Mono, monospace',
  resize: 'none',
  outline: 'none',
  transition: 'border-color 120ms',
};

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

  const switchTab = (tab: 'export' | 'import') => {
    setActiveTab(tab);
    setError('');
    setSuccess('');
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
      {/* Tab bar — hairline divider below header */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid var(--line)',
        marginBottom: 20,
      }}>
        {(['export', 'import'] as const).map(tab => {
          const active = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => switchTab(tab)}
              style={{
                flex: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '10px 0',
                fontSize: 13, fontWeight: 600,
                textTransform: 'capitalize',
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                color: active ? 'var(--accent)' : 'var(--t3)',
                borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
                marginBottom: -1,
                transition: 'color 120ms',
              }}
            >
              {tab === 'export'
                ? <><Download size={14} />Export</>
                : <><Upload size={14} />Import</>
              }
            </button>
          );
        })}
      </div>

      {activeTab === 'export' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ fontSize: 13, color: 'var(--t2)' }}>
            Export all your services as a JSON backup.
          </p>

          {!exportData ? (
            <button
              onClick={handleExport}
              disabled={isLoading}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '11px 0', width: '100%',
                background: 'var(--accent)',
                border: 'none', borderRadius: 'var(--r-sm)',
                color: '#000', fontSize: 13, fontWeight: 600,
                cursor: isLoading ? 'not-allowed' : 'pointer',
                opacity: isLoading ? 0.6 : 1,
                minWidth: 0,
              }}
            >
              <Download size={16} />
              {isLoading ? 'Exporting…' : 'Export Services'}
            </button>
          ) : (
            <>
              <textarea
                value={exportData}
                readOnly
                style={{ ...textareaStyle, height: 256 }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={handleDownload}
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    padding: '9px 0',
                    background: 'var(--ok-dim)',
                    border: '1px solid rgba(34,197,94,0.20)',
                    color: 'var(--ok)', borderRadius: 'var(--r-sm)',
                    fontSize: 13, fontWeight: 600,
                    cursor: 'pointer', minWidth: 0,
                  }}
                >
                  <Download size={15} />
                  Download
                </button>
                <button
                  onClick={handleCopy}
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    padding: '9px 0',
                    background: 'var(--raised)',
                    border: '1px solid var(--line-2)',
                    color: copied ? 'var(--ok)' : 'var(--t2)', borderRadius: 'var(--r-sm)',
                    fontSize: 13, fontWeight: 600,
                    cursor: 'pointer', minWidth: 0,
                    transition: 'color 120ms',
                  }}
                >
                  {copied ? <Check size={15} /> : <Copy size={15} />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ fontSize: 13, color: 'var(--t2)' }}>
            Import services from a JSON file. New services are added without replacing existing ones.
          </p>

          <div>
            <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--t2)', marginBottom: 6 }}>
              Upload JSON File
            </span>
            <input
              type="file"
              accept=".json"
              onChange={handleFileUpload}
              style={{
                display: 'block', width: '100%', minWidth: 0,
                padding: '9px 12px',
                background: 'var(--raised)',
                border: '1px solid var(--line-2)',
                borderRadius: 'var(--r-sm)',
                color: 'var(--t2)',
                fontSize: 13,
                cursor: 'pointer',
              }}
            />
          </div>

          <div>
            <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--t2)', marginBottom: 6 }}>
              Or Paste JSON
            </span>
            <textarea
              value={importData}
              onChange={e => setImportData(e.target.value)}
              style={{ ...textareaStyle, height: 192 }}
              placeholder="Paste your JSON data here…"
              onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent-border)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'var(--line-2)')}
            />
          </div>

          <button
            onClick={handleImport}
            disabled={isLoading || !importData.trim()}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '11px 0', width: '100%',
              background: 'var(--accent)',
              border: 'none', borderRadius: 'var(--r-sm)',
              color: '#000', fontSize: 13, fontWeight: 600,
              cursor: (isLoading || !importData.trim()) ? 'not-allowed' : 'pointer',
              opacity: (isLoading || !importData.trim()) ? 0.5 : 1,
              minWidth: 0,
              transition: 'opacity 120ms',
            }}
          >
            <Upload size={16} />
            {isLoading ? 'Importing…' : 'Import Services'}
          </button>
        </div>
      )}
    </BaseModal>
  );
};
