import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  /**
   * additional classes applied to the inner body wrapper (`.p-6` div).
   * this is useful when the card itself has `flex` styles and you want the
   * content area to grow/shrink.
   */
  bodyClassName?: string;
  title?: string | React.ReactNode;
  action?: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({ children, className = '', bodyClassName = '', title, action }) => {
  return (
    <div className={`bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm ${className}`}>
      {(title || action) && (
        <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center">
          {title && <h3 className="text-lg font-semibold text-slate-100">{title}</h3>}
          {action && <div>{action}</div>}
        </div>
      )}
      <div className={`p-6 ${bodyClassName || ''}`.trim()}>
        {children}
      </div>
    </div>
  );
};
