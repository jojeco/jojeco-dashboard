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
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Name & Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Service Name *
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={e => setFormData({ ...formData, name: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="My Service"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Description
          </label>
          <textarea
            value={formData.description}
            onChange={e => setFormData({ ...formData, description: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="What this service does"
            rows={2}
          />
        </div>

        {/* URLs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Public URL *
            </label>
            <input
              type="url"
              value={formData.url}
              onChange={e => setFormData({ ...formData, url: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="https://example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              LAN URL
            </label>
            <input
              type="url"
              value={formData.lanUrl}
              onChange={e => setFormData({ ...formData, lanUrl: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="http://192.168.1.100"
            />
          </div>
        </div>

        {/* Health check */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Health Check URL
            </label>
            <input
              type="url"
              value={formData.healthCheckUrl}
              onChange={e => setFormData({ ...formData, healthCheckUrl: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="https://example.com/health"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Check Interval (seconds)
            </label>
            <input
              type="number"
              min="10"
              max="3600"
              value={formData.healthCheckInterval}
              onChange={e => setFormData({ ...formData, healthCheckInterval: parseInt(e.target.value) })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Icon picker — renders actual Lucide icons */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Icon
          </label>
          <div className="grid grid-cols-8 gap-1.5 max-h-44 overflow-y-auto p-2 border border-gray-300 dark:border-gray-600 rounded-lg">
            {AVAILABLE_ICONS.map(iconName => {
              const Icon = ICON_MAP[iconName];
              return (
                <button
                  key={iconName}
                  type="button"
                  onClick={() => setFormData({ ...formData, icon: iconName })}
                  className={`p-2 rounded-lg border-2 flex items-center justify-center ${
                    formData.icon === iconName
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/40'
                      : 'border-transparent hover:border-gray-300 dark:hover:border-gray-500'
                  }`}
                  title={iconName}
                >
                  {Icon && <Icon className="w-5 h-5 text-gray-700 dark:text-gray-300" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Color picker */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Color
          </label>
          <div className="flex gap-2 flex-wrap">
            {AVAILABLE_COLORS.map(color => (
              <button
                key={color.value}
                type="button"
                onClick={() => setFormData({ ...formData, color: color.value })}
                className={`w-9 h-9 rounded-lg ${color.value} transition-all ${
                  formData.color === color.value ? 'ring-4 ring-offset-2 ring-blue-500 dark:ring-offset-gray-800' : ''
                }`}
                title={color.name}
              />
            ))}
          </div>
        </div>

        {/* Tags */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Tags
          </label>
          <div className="flex flex-wrap gap-2 mb-2">
            {DEFAULT_TAGS.map(tag => (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                className={`px-3 py-1 rounded-full text-sm transition-colors ${
                  formData.tags.includes(tag)
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={customTag}
              onChange={e => setCustomTag(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCustomTag())}
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Custom tag…"
            />
            <button
              type="button"
              onClick={addCustomTag}
              className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
            >
              Add
            </button>
          </div>
          {formData.tags.filter(t => !DEFAULT_TAGS.includes(t)).length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {formData.tags.filter(t => !DEFAULT_TAGS.includes(t)).map(tag => (
                <span
                  key={tag}
                  className="px-3 py-1 rounded-full text-sm bg-purple-500 text-white flex items-center gap-1"
                >
                  {tag}
                  <button type="button" onClick={() => toggleTag(tag)} className="hover:text-red-200">
                    <X size={13} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Pin */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={formData.isPinned}
            onChange={e => setFormData({ ...formData, isPinned: e.target.checked })}
            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">Pin to top</span>
        </label>

        {/* Actions */}
        <div className="flex justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
          {service && onDelete ? (
            <button
              type="button"
              onClick={handleDelete}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              <Trash2 size={16} />
              Delete
            </button>
          ) : <div />}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              <Save size={16} />
              {isLoading ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </form>
    </BaseModal>
  );
};
