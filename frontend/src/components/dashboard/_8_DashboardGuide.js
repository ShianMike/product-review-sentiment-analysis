// _8_DashboardGuide.js
// ─────────────────────────────────────────────────────────────────────────────
// Shared UI components that power the "?" info modals shown throughout the
// dashboard. Nothing in this file communicates with the backend; it only
// handles the display side of the explanation layer.
//
// Exports three components:
//   GuideButton       – the small circular "?" trigger button
//   CardHeaderWithGuide – card header row that bundles a title + GuideButton
//   InfoGuideModal    – the modal overlay that renders the active guide's
//                       title, description, and item cards
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect } from 'react';
import { CircleHelp, X } from 'lucide-react';

export function GuideButton({
  label,
  onClick,
  expanded = false,
  controls = 'dashboard-info-guide',
  className = '',
}) {
  // All dashboard help/info buttons use this one trigger component so the
  // button behavior stays consistent across overview, themes, trends, aspects,
  // and model-info screens.
  // These guide buttons support Project.txt's target users, including sellers
  // and product teams, by explaining analytics in plain language.
  //
  // aria-haspopup="dialog" tells screen readers that clicking this button
  // will open a dialog rather than navigating to a new page.
  // aria-expanded reflects whether that dialog is currently open.
  // aria-controls links the button to the modal's DOM id.
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

// CardHeaderWithGuide renders a standard card header row.
// It combines a title (with optional icon) on the left and an actions area
// on the right. When a guideKey is provided, a GuideButton is automatically
// appended to the actions slot so callers do not have to wire it manually.
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

// InfoGuideModal is a full-screen overlay modal.
// The parent component owns the `activeGuide` value. When it is null, the
// modal is unmounted entirely (returns null) so no invisible DOM lingers.
// When it is set to a guide object, the modal renders that guide's data.
export function InfoGuideModal({
  activeGuide,
  onClose,
  dialogId = 'dashboard-info-guide',
}) {
  // The modal is part of the prototype's explanation layer. It does not compute
  // analytics itself; it helps users interpret already-computed results coming
  // from the backend pipeline.
  useEffect(() => {
    if (!activeGuide) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    // Prevent the page behind the modal from scrolling while the overlay is open.
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
    // Clicking the semi-transparent backdrop (outside the card) closes the modal.
    // stopPropagation on the inner card prevents that click from bubbling up.
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
            {/* Parent sections define the content object. This modal only renders
                the selected guide's title, summary, and item cards. */}
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
