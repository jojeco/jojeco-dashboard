import { ReactNode } from 'react';
import { X } from 'lucide-react';

interface BaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  /** Makes the content area scrollable with a max viewport height */
  scrollable?: boolean;
  error?: string;
  success?: string;
}

const maxWidthClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
};

export function BaseModal({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = 'lg',
  scrollable = false,
  error,
  success,
}: BaseModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className={`bg-white dark:bg-gray-800 rounded-lg shadow-xl ${maxWidthClasses[maxWidth]} w-full ${
          scrollable ? 'max-h-[90vh] flex flex-col' : ''
        }`}
        onClick={e => e.stopPropagation()}
      >
        {/* Header — never scrolls */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{title}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
            aria-label="Close"
          >
            <X size={24} />
          </button>
        </div>

        {/* Inline alerts — also don't scroll */}
        {error && (
          <div className="mx-6 mt-4 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-300 px-4 py-3 rounded shrink-0">
            {error}
          </div>
        )}
        {success && (
          <div className="mx-6 mt-4 bg-green-100 dark:bg-green-900/30 border border-green-400 dark:border-green-700 text-green-700 dark:text-green-300 px-4 py-3 rounded shrink-0">
            {success}
          </div>
        )}

        {/* Content */}
        <div className={`p-6 ${scrollable ? 'overflow-y-auto flex-1' : ''}`}>
          {children}
        </div>
      </div>
    </div>
  );
}
