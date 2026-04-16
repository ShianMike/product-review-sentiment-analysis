import React, { useEffect } from 'react';
import { CircleHelp, X } from 'lucide-react';

export function GuideButton({
  label,
  onClick,
  expanded = false,
  controls = 'dashboard-info-guide',
  className = '',
}) {
  return (
    <button
      type="button"
      className={`btn-icon section-info-trigger ${className}`.trim()}
      onClick={onClick}
      aria-label={label}
      aria-haspopup="dialog"
      aria-expanded={expanded}
      aria-controls={controls}
      title={label}
    >
      <CircleHelp size={14} />
    </button>
  );
}

export function CardHeaderWithGuide({
  title,
  icon = null,
  guideKey,
  activeGuideKey,
  onOpenGuide,
  dialogId = 'dashboard-info-guide',
  actions = null,
  titleStyle = null,
}) {
  return (
    <div className="card-header card-header-with-action">
      <div className="card-header-title-group">
        {icon}
        <h3 style={titleStyle}>{title}</h3>
      </div>
      <div className="card-header-actions">
        {actions}
        {guideKey && onOpenGuide && (
          <GuideButton
            label={`Explain ${title}`}
            onClick={() => onOpenGuide(guideKey)}
            expanded={activeGuideKey === guideKey}
            controls={dialogId}
          />
        )}
      </div>
    </div>
  );
}

export function InfoGuideModal({
  activeGuide,
  onClose,
  dialogId = 'dashboard-info-guide',
}) {
  useEffect(() => {
    if (!activeGuide) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeGuide, onClose]);

  if (!activeGuide) {
    return null;
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        id={dialogId}
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${dialogId}-title`}
        aria-describedby={`${dialogId}-description`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div className="modal-header-copy">
            <h3 id={`${dialogId}-title`}>{activeGuide.title}</h3>
            <p id={`${dialogId}-description`}>{activeGuide.description}</p>
          </div>
          <button
            type="button"
            className="btn-icon"
            onClick={onClose}
            aria-label={`Close ${activeGuide.title} guide`}
          >
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          <div className="info-guide-grid">
            {(activeGuide.items || []).map((item) => (
              <article key={item.label} className="info-guide-card">
                <div className="info-guide-card-top">
                  <div className="info-guide-label">{item.label}</div>
                  {item.value ? <div className="info-guide-value mono">{item.value}</div> : null}
                </div>
                <p className="info-guide-description">{item.description}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
