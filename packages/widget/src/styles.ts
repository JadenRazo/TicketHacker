/**
 * Widget styles - CSS-in-JS for Shadow DOM isolation
 */

export function getStyles(primaryColor: string = '#0066FF'): string {
  // Generate lighter and darker shades from primary color
  const cssVars = `
    --th-primary: ${primaryColor};
    --th-primary-hover: ${adjustColor(primaryColor, -10)};
    --th-primary-light: ${adjustColor(primaryColor, 90)};
    --th-text-primary: #1a1a1a;
    --th-text-secondary: #666;
    --th-text-inverse: #ffffff;
    --th-bg-primary: #ffffff;
    --th-bg-secondary: #f5f5f5;
    --th-border: #e0e0e0;
    --th-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    --th-shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.2);
  `;

  const darkModeVars = `
    --th-text-primary: #ffffff;
    --th-text-secondary: #b0b0b0;
    --th-bg-primary: #1e1e1e;
    --th-bg-secondary: #2a2a2a;
    --th-border: #404040;
  `;

  return `
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    :host {
      ${cssVars}
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      color: var(--th-text-primary);
      position: fixed;
      bottom: 20px;
      z-index: 2147483647;
    }

    :host(.position-right) {
      right: 20px;
    }

    :host(.position-left) {
      left: 20px;
    }

    @media (prefers-color-scheme: dark) {
      :host {
        ${darkModeVars}
      }
    }

    /* Chat Bubble Button */
    .th-bubble {
      width: 60px;
      height: 60px;
      border-radius: 30px;
      background: var(--th-primary);
      border: none;
      cursor: pointer;
      box-shadow: var(--th-shadow);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
      position: relative;
    }

    .th-bubble:hover {
      background: var(--th-primary-hover);
      transform: scale(1.05);
      box-shadow: var(--th-shadow-lg);
    }

    .th-bubble svg {
      width: 28px;
      height: 28px;
      fill: var(--th-text-inverse);
    }

    .th-bubble.open svg {
      transform: rotate(90deg);
      transition: transform 0.2s ease;
    }

    .th-unread-badge {
      position: absolute;
      top: -4px;
      right: -4px;
      background: #ff4444;
      color: white;
      border-radius: 10px;
      min-width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 600;
      padding: 0 6px;
    }

    /* Chat Panel */
    .th-panel {
      position: fixed;
      bottom: 90px;
      width: 380px;
      max-width: calc(100vw - 40px);
      height: 600px;
      max-height: calc(100vh - 120px);
      background: var(--th-bg-primary);
      border-radius: 12px;
      box-shadow: var(--th-shadow-lg);
      display: flex;
      flex-direction: column;
      opacity: 0;
      transform: scale(0.95) translateY(10px);
      pointer-events: none;
      transition: all 0.2s ease;
    }

    .th-panel.open {
      opacity: 1;
      transform: scale(1) translateY(0);
      pointer-events: auto;
    }

    :host(.position-right) .th-panel {
      right: 0;
    }

    :host(.position-left) .th-panel {
      left: 0;
    }

    /* Panel Header */
    .th-header {
      background: var(--th-primary);
      color: var(--th-text-inverse);
      padding: 16px 20px;
      border-radius: 12px 12px 0 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .th-header-title {
      font-size: 16px;
      font-weight: 600;
    }

    .th-header-subtitle {
      font-size: 12px;
      opacity: 0.9;
      margin-top: 2px;
    }

    .th-close-btn {
      background: transparent;
      border: none;
      cursor: pointer;
      padding: 4px;
      color: var(--th-text-inverse);
      opacity: 0.8;
      transition: opacity 0.2s;
    }

    .th-close-btn:hover {
      opacity: 1;
    }

    .th-close-btn svg {
      width: 20px;
      height: 20px;
      fill: currentColor;
    }

    /* Pre-chat Form */
    .th-prechat {
      padding: 24px;
      flex: 1;
      overflow-y: auto;
    }

    .th-prechat-greeting {
      font-size: 16px;
      margin-bottom: 20px;
      color: var(--th-text-primary);
      line-height: 1.6;
    }

    .th-form-group {
      margin-bottom: 16px;
    }

    .th-label {
      display: block;
      margin-bottom: 6px;
      font-weight: 500;
      color: var(--th-text-primary);
    }

    .th-input {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid var(--th-border);
      border-radius: 6px;
      font-size: 14px;
      background: var(--th-bg-primary);
      color: var(--th-text-primary);
      transition: border-color 0.2s;
    }

    .th-input:focus {
      outline: none;
      border-color: var(--th-primary);
    }

    .th-btn {
      width: 100%;
      padding: 12px;
      background: var(--th-primary);
      color: var(--th-text-inverse);
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
    }

    .th-btn:hover:not(:disabled) {
      background: var(--th-primary-hover);
    }

    .th-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    /* Messages */
    .th-messages {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .th-message {
      display: flex;
      gap: 8px;
      max-width: 80%;
      animation: messageSlide 0.2s ease;
    }

    @keyframes messageSlide {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .th-message.agent {
      align-self: flex-start;
    }

    .th-message.user {
      align-self: flex-end;
      flex-direction: row-reverse;
    }

    .th-message-avatar {
      width: 32px;
      height: 32px;
      border-radius: 16px;
      background: var(--th-primary-light);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      font-weight: 600;
      font-size: 12px;
      color: var(--th-primary);
    }

    .th-message.user .th-message-avatar {
      background: var(--th-bg-secondary);
      color: var(--th-text-secondary);
    }

    .th-message-bubble {
      padding: 10px 14px;
      border-radius: 12px;
      word-wrap: break-word;
      line-height: 1.5;
    }

    .th-message.agent .th-message-bubble {
      background: var(--th-bg-secondary);
      color: var(--th-text-primary);
      border-bottom-left-radius: 4px;
    }

    .th-message.user .th-message-bubble {
      background: var(--th-primary);
      color: var(--th-text-inverse);
      border-bottom-right-radius: 4px;
    }

    .th-message-time {
      font-size: 11px;
      color: var(--th-text-secondary);
      margin-top: 4px;
      padding: 0 14px;
    }

    /* Typing Indicator */
    .th-typing {
      display: flex;
      gap: 8px;
      align-self: flex-start;
      max-width: 80%;
    }

    .th-typing-bubble {
      padding: 10px 14px;
      background: var(--th-bg-secondary);
      border-radius: 12px;
      border-bottom-left-radius: 4px;
      display: flex;
      gap: 4px;
    }

    .th-typing-dot {
      width: 6px;
      height: 6px;
      border-radius: 3px;
      background: var(--th-text-secondary);
      animation: typingDot 1.4s infinite;
    }

    .th-typing-dot:nth-child(2) {
      animation-delay: 0.2s;
    }

    .th-typing-dot:nth-child(3) {
      animation-delay: 0.4s;
    }

    @keyframes typingDot {
      0%, 60%, 100% {
        opacity: 0.3;
        transform: translateY(0);
      }
      30% {
        opacity: 1;
        transform: translateY(-4px);
      }
    }

    /* Input Area */
    .th-input-area {
      padding: 16px;
      border-top: 1px solid var(--th-border);
      display: flex;
      gap: 8px;
      align-items: flex-end;
    }

    .th-message-input {
      flex: 1;
      padding: 10px 12px;
      border: 1px solid var(--th-border);
      border-radius: 20px;
      font-size: 14px;
      background: var(--th-bg-primary);
      color: var(--th-text-primary);
      resize: none;
      max-height: 100px;
      font-family: inherit;
      line-height: 1.5;
    }

    .th-message-input:focus {
      outline: none;
      border-color: var(--th-primary);
    }

    .th-send-btn {
      width: 40px;
      height: 40px;
      border-radius: 20px;
      background: var(--th-primary);
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s;
      flex-shrink: 0;
    }

    .th-send-btn:hover:not(:disabled) {
      background: var(--th-primary-hover);
    }

    .th-send-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .th-send-btn svg {
      width: 18px;
      height: 18px;
      fill: var(--th-text-inverse);
    }

    /* Rating */
    .th-rating {
      padding: 24px;
      text-align: center;
    }

    .th-rating-title {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 16px;
    }

    .th-rating-stars {
      display: flex;
      gap: 8px;
      justify-content: center;
      margin-bottom: 20px;
    }

    .th-rating-star {
      background: transparent;
      border: none;
      cursor: pointer;
      padding: 4px;
      transition: transform 0.2s;
    }

    .th-rating-star:hover {
      transform: scale(1.2);
    }

    .th-rating-star svg {
      width: 32px;
      height: 32px;
      fill: var(--th-border);
      transition: fill 0.2s;
    }

    .th-rating-star:hover svg,
    .th-rating-star.active svg {
      fill: #ffa500;
    }

    /* Loading */
    .th-loading {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 40px;
    }

    .th-spinner {
      width: 40px;
      height: 40px;
      border: 3px solid var(--th-border);
      border-top-color: var(--th-primary);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    /* Error */
    .th-error {
      padding: 16px;
      background: #fee;
      border: 1px solid #fcc;
      border-radius: 6px;
      color: #c00;
      margin: 16px;
    }

    /* Mobile Responsive */
    @media (max-width: 480px) {
      :host {
        bottom: 0;
        left: 0 !important;
        right: 0 !important;
      }

      .th-bubble {
        position: fixed;
        bottom: 16px;
        right: 16px;
      }

      .th-panel {
        bottom: 0;
        left: 0 !important;
        right: 0 !important;
        width: 100%;
        max-width: 100%;
        height: 100vh;
        max-height: 100vh;
        border-radius: 0;
      }

      .th-panel .th-header {
        border-radius: 0;
      }
    }

    /* Scrollbar Styling */
    .th-messages::-webkit-scrollbar,
    .th-prechat::-webkit-scrollbar {
      width: 6px;
    }

    .th-messages::-webkit-scrollbar-track,
    .th-prechat::-webkit-scrollbar-track {
      background: transparent;
    }

    .th-messages::-webkit-scrollbar-thumb,
    .th-prechat::-webkit-scrollbar-thumb {
      background: var(--th-border);
      border-radius: 3px;
    }

    .th-messages::-webkit-scrollbar-thumb:hover,
    .th-prechat::-webkit-scrollbar-thumb:hover {
      background: var(--th-text-secondary);
    }
  `;
}

/**
 * Adjust color brightness
 */
function adjustColor(color: string, amount: number): string {
  const hex = color.replace('#', '');
  const num = parseInt(hex, 16);

  let r = (num >> 16) + amount;
  let g = ((num >> 8) & 0x00FF) + amount;
  let b = (num & 0x0000FF) + amount;

  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));

  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
