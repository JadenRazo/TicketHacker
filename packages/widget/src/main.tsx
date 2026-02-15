import { render } from 'preact';
import { Widget } from './Widget';
import { getStyles } from './styles';

/**
 * TicketHacker Widget Entry Point
 *
 * Initializes the chat widget in a Shadow DOM for style isolation.
 * Reads configuration from script tag attributes.
 */

interface WidgetOptions {
  tenantId: string;
  apiUrl?: string;
}

class TicketHackerWidget {
  private host: HTMLDivElement | null = null;
  private shadow: ShadowRoot | null = null;
  private tenantId: string;

  constructor(options: WidgetOptions) {
    this.tenantId = options.tenantId;
    this.init();
  }

  private init() {
    // Create shadow host element
    this.host = document.createElement('div');
    this.host.id = 'tickethacker-widget';

    // Create shadow root for style isolation
    this.shadow = this.host.attachShadow({ mode: 'open' });

    // Create style element
    const style = document.createElement('style');
    style.textContent = getStyles();
    this.shadow.appendChild(style);

    // Create widget container
    const container = document.createElement('div');
    this.shadow.appendChild(container);

    // Render Preact component
    render(<Widget tenantId={this.tenantId} />, container);

    // Append to body
    document.body.appendChild(this.host);

    // Set position class based on config (will be updated after API call)
    this.host.classList.add('position-right');
  }

  public destroy() {
    if (this.host && this.host.parentNode) {
      this.host.parentNode.removeChild(this.host);
      this.host = null;
      this.shadow = null;
    }
  }
}

/**
 * Auto-initialize from script tag
 */
function autoInit() {
  const script = document.currentScript as HTMLScriptElement | null;

  if (!script) {
    console.error('TicketHacker Widget: Could not find script tag');
    return;
  }

  const tenantId = script.getAttribute('data-tenant-id');

  if (!tenantId) {
    console.error('TicketHacker Widget: data-tenant-id attribute is required');
    return;
  }

  const apiUrl = script.getAttribute('data-api-url');

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      new TicketHackerWidget({ tenantId, apiUrl: apiUrl || undefined });
    });
  } else {
    new TicketHackerWidget({ tenantId, apiUrl: apiUrl || undefined });
  }
}

// Auto-initialize if script tag is present
if (typeof window !== 'undefined' && document.currentScript) {
  autoInit();
}

/**
 * Programmatic API - exported as default
 */
const TicketHackerWidgetAPI = {
  init(options: WidgetOptions): TicketHackerWidget {
    return new TicketHackerWidget(options);
  }
};

export default TicketHackerWidgetAPI;
