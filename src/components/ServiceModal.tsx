import React, { useState, useEffect } from 'react';
import { Save, Trash2, X } from 'lucide-react';
import { Service } from '../types/service';
import { ICON_MAP, AVAILABLE_ICONS, AVAILABLE_COLORS } from '../utils/constants';
import { BaseModal } from './BaseModal';

interface ServiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (service: Omit<Service, 'id' | 'createdAt' | 'updatedAt' | 'userId'>) => Promise<void>;
  onDelete?: (serviceId: string) => Promise<void>;
  service?: Service | null;
}

const DEFAULT_TAGS = [
  'storage', 'productivity', 'media', 'automation', 'infra',
  'dev', 'monitoring', 'security', 'network', 'communication',
];

const EMPTY_FORM = {
  name: '',
  description: '',
  url: '',
  lanUrl: '',
  icon: 'Server',
  color: 'bg-blue-500',
  tags: [] as string[],
  isPinned: false,
  healthCheckUrl: '',
  healthCheckInterval: 60,
};

// Shared input style using surface tokens
const inputStyle: React.CSSProperties = {
  display: 'block', width: '100%', minWidth: 0,
  padding: '9px 12px',
  background: 'var(--raised)',
  border: '1px solid var(--line-2)',
  borderRadius: 'var(--r-sm)',
  color: 'var(--t1)',
  fontSize: 13,
  outline: 'none',
  transition: 'border-color 120ms',
  fontFamily: 'Geist, system-ui, sans-serif',
};

function LabelText({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--t2)', marginBottom: 6, letterSpacing: '0.02em' }}>
      {children}
    </span>
  );
}

function FocusInput({ style, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      style={{ ...inputStyle, ...style }}
      onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent-border)')}
      onBlur={e => (e.currentTarget.style.borderColor = 'var(--line-2)')}
      {...props}
    />
  );
}

function FocusTextarea({ style, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      style={{ ...inputStyle, resize: 'none', ...style }}
      onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent-border)')}
      onBlur={e => (e.currentTarget.style.borderColor = 'var(--line-2)')}
      {...props}
    />
  );
}

export const ServiceModal: React.FC<ServiceModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onDelete,
  service,
}) => {
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [customTag, setCustomTag] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (service) {
      setFormData({
        name: service.name,
        description: service.description,
        url: service.url,
        lanUrl: service.lanUrl || '',
        icon: service.icon,
        color: service.color,
        tags: service.tags || [],
        isPinned: service.isPinned,
        healthCheckUrl: service.healthCheckUrl || '',
        healthCheckInterval: service.healthCheckInterval || 60,
      });
    } else {
      setFormData(EMPTY_FORM);
    }
    setError('');
  }, [service, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.name.trim()) { setError('Service name is required'); return; }
    if (!formData.url.trim())  { setError('Service URL is required'); return; }

    try { new URL(formData.url); }
    catch { setError('Invalid URL format (e.g., https://example.com)'); return; }

    if (formData.healthCheckUrl?.trim()) {
      try { new URL(formData.healthCheckUrl); }
      catch { setError('Invalid health check URL format'); return; }
    }

    setIsLoading(true);
    try {
      await onSave(formData);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save service');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!service || !onDelete) return;
    if (!confirm(`Delete "${service.name}"? This cannot be undone.`)) return;

    setIsLoading(true);
    try {
      await onDelete(service.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete service');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleTag = (tag: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.includes(tag) ? prev.tags.filter(t => t !== tag) : [...prev.tags, tag],
    }));
  };

  const addCustomTag = () => {
    const tag = customTag.trim().toLowerCase();
    if (tag && !formData.tags.includes(tag)) {
      setFormData(prev => ({ ...prev, tags: [...prev.tags, tag] }));
      setCustomTag('');
    }
  };

  const title = service ? 'Edit Service' : 'Add Service';

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      maxWidth="2xl"
      scrollable
      error={error}
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Name & Description */}
        <div>
          <LabelText>Service Name *</LabelText>
          <FocusInput
            type="text"
            value={formData.name}
            onChange={e => setFormData({ ...formData, name: e.target.value })}
            placeholder="My Service"
          />
        </div>

        <div>
          <LabelText>Description</LabelText>
          <FocusTextarea
            value={formData.description}
            onChange={e => setFormData({ ...formData, description: e.target.value })}
            placeholder="What this service does"
            rows={2}
          />
        </div>

        {/* URLs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <LabelText>Public URL *</LabelText>
            <FocusInput
              type="url"
              value={formData.url}
              onChange={e => setFormData({ ...formData, url: e.target.value })}
              placeholder="https://example.com"
            />
          </div>
          <div style={{ minWidth: 0 }}>
            <LabelText>LAN URL</LabelText>
            <FocusInput
              type="url"
              value={formData.lanUrl}
              onChange={e => setFormData({ ...formData, lanUrl: e.target.value })}
              placeholder="http://192.168.1.100"
            />
          </div>
        </div>

        {/* Health check */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <LabelText>Health Check URL</LabelText>
            <FocusInput
              type="url"
              value={formData.healthCheckUrl}
              onChange={e => setFormData({ ...formData, healthCheckUrl: e.target.value })}
              placeholder="https://example.com/health"
            />
          </div>
          <div style={{ minWidth: 0 }}>
            <LabelText>Check Interval (seconds)</LabelText>
            <FocusInput
              type="number"
              min="10"
              max="3600"
              value={formData.healthCheckInterval}
              onChange={e => setFormData({ ...formData, healthCheckInterval: parseInt(e.target.value) })}
            />
          </div>
        </div>

        {/* Icon picker */}
        <div>
          <LabelText>Icon</LabelText>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)',
            gap: 6, maxHeight: 176, overflowY: 'auto',
            padding: 8,
            background: 'var(--raised)',
            borderRadius: 'var(--r-sm)',
            border: '1px solid var(--line)',
          }}>
            {AVAILABLE_ICONS.map(iconName => {
              const Icon = ICON_MAP[iconName];
              const selected = formData.icon === iconName;
              return (
                <button
                  key={iconName}
                  type="button"
                  onClick={() => setFormData({ ...formData, icon: iconName })}
                  style={{
                    padding: 8,
                    borderRadius: 6,
                    border: '2px solid',
                    borderColor: selected ? 'var(--accent)' : 'transparent',
                    background: selected ? 'var(--accent-dim)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'all 100ms',
                    minWidth: 0,
                  }}
                  title={iconName}
                >
                  {Icon && <Icon size={18} color={selected ? 'var(--accent)' : 'var(--t2)'} />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Color picker */}
        <div>
          <LabelText>Color</LabelText>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {AVAILABLE_COLORS.map(color => (
              <button
                key={color.value}
                type="button"
                onClick={() => setFormData({ ...formData, color: color.value })}
                className={`w-9 h-9 rounded-lg ${color.value} transition-all ${
                  formData.color === color.value ? 'ring-4 ring-offset-2 ring-blue-500' : ''
                }`}
                style={{ minWidth: 0 }}
                title={color.name}
              />
            ))}
          </div>
        </div>

        {/* Tags */}
        <div>
          <LabelText>Tags</LabelText>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
            {DEFAULT_TAGS.map(tag => {
              const active = formData.tags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  style={{
                    padding: '4px 12px',
                    borderRadius: 99,
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: 'pointer',
                    border: 'none',
                    transition: 'all 100ms',
                    background: active ? 'var(--accent)' : 'var(--raised)',
                    color: active ? '#000' : 'var(--t2)',
                    minWidth: 0,
                  }}
                >
                  {tag}
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <FocusInput
              type="text"
              value={customTag}
              onChange={e => setCustomTag(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCustomTag())}
              placeholder="Custom tag…"
              style={{ flex: 1, minWidth: 0 }}
            />
            <button
              type="button"
              onClick={addCustomTag}
              style={{
                padding: '0 16px',
                background: 'var(--raised)',
                border: '1px solid var(--line-2)',
                borderRadius: 'var(--r-sm)',
                color: 'var(--t2)',
                fontSize: 13,
                cursor: 'pointer',
                flexShrink: 0,
                transition: 'background 100ms',
              }}
            >
              Add
            </button>
          </div>
          {formData.tags.filter(t => !DEFAULT_TAGS.includes(t)).length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              {formData.tags.filter(t => !DEFAULT_TAGS.includes(t)).map(tag => (
                <span
                  key={tag}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    padding: '4px 10px',
                    borderRadius: 99,
                    fontSize: 12,
                    background: 'rgba(139,92,246,0.15)',
                    color: '#a78bfa',
                    minWidth: 0,
                  }}
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => toggleTag(tag)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, display: 'flex' }}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Pin */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={formData.isPinned}
            onChange={e => setFormData({ ...formData, isPinned: e.target.checked })}
            style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--accent)' }}
          />
          <span style={{ fontSize: 13, color: 'var(--t2)' }}>Pin to top</span>
        </label>

        {/* Divider */}
        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 16, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          {service && onDelete ? (
            <button
              type="button"
              onClick={handleDelete}
              disabled={isLoading}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '9px 16px',
                background: 'var(--err-dim)',
                border: '1px solid rgba(239,68,68,0.20)',
                color: 'var(--err)',
                borderRadius: 'var(--r-sm)',
                fontSize: 13, fontWeight: 600,
                cursor: isLoading ? 'not-allowed' : 'pointer',
                opacity: isLoading ? 0.5 : 1,
                minWidth: 0,
              }}
            >
              <Trash2 size={15} />
              Delete
            </button>
          ) : <div />}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              style={{
                padding: '9px 16px',
                background: 'var(--raised)',
                border: '1px solid var(--line-2)',
                color: 'var(--t2)',
                borderRadius: 'var(--r-sm)',
                fontSize: 13, fontWeight: 500,
                cursor: isLoading ? 'not-allowed' : 'pointer',
                opacity: isLoading ? 0.5 : 1,
                minWidth: 0,
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '9px 16px',
                background: 'var(--accent)',
                border: 'none',
                color: '#000',
                borderRadius: 'var(--r-sm)',
                fontSize: 13, fontWeight: 600,
                cursor: isLoading ? 'not-allowed' : 'pointer',
                opacity: isLoading ? 0.6 : 1,
                minWidth: 0,
              }}
            >
              <Save size={15} />
              {isLoading ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </form>
    </BaseModal>
  );
};
