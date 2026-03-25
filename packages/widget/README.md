# TicketHacker Chat Widget

A lightweight, embeddable chat widget built with Preact for the TicketHacker support platform. Provides real-time messaging, typing indicators, and conversation persistence.

## Features

- **Lightweight**: ~23KB gzipped bundle size (Preact + Socket.IO)
- **Shadow DOM**: Complete style isolation from host page
- **Real-time**: WebSocket-based messaging with Socket.IO
- **Persistence**: Conversations saved in localStorage
- **Mobile Responsive**: Optimized for all screen sizes
- **Dark Mode**: Automatic dark mode support
- **Customizable**: Configurable colors, position, and pre-chat form
- **Accessible**: ARIA labels and keyboard navigation

## Installation

### Script Tag (Recommended)

Add the widget script to your website:

```html
<script src="https://your-domain.com/widget.iife.js"
        data-tenant-id="YOUR_TENANT_ID"
        data-api-url="https://api.your-domain.com/api/widget">
</script>
```

The widget will automatically initialize and appear in the bottom-right corner.

### Programmatic API

You can also initialize the widget programmatically:

```javascript
import TicketHackerWidget from './widget.iife.js';

TicketHackerWidget.init({
  tenantId: 'YOUR_TENANT_ID',
  apiUrl: 'https://api.your-domain.com/api/widget'
});
```

## Configuration

The widget reads configuration from the backend API (`POST /api/widget/init`):

```typescript
{
  primaryColor: '#0066FF',
  position: 'bottom-right' | 'bottom-left',
  greeting: 'Welcome! How can we help?',
  preChatFields: [
    { name: 'name', type: 'text', required: true, label: 'Your Name' },
    { name: 'email', type: 'email', required: true, label: 'Email Address' }
  ],
  enabled: true
}
```

## Backend API Endpoints

The widget expects these endpoints at the configured API URL:

### Initialize Widget
```
POST /api/widget/init
Body: { tenantId: string }
Response: WidgetConfig
```

### Create Conversation
```
POST /api/widget/conversations
Body: { tenantId: string, name?: string, email?: string, metadata?: object }
Response: { token: string, conversationId: string, contactId: string }
```

### Get Messages
```
GET /api/widget/conversations/:id/messages?token=...
Response: Message[]
```

### Send Message
```
POST /api/widget/conversations/:id/messages
Body: { token: string, content: string }
Response: Message
```

### Send Typing Status
```
POST /api/widget/conversations/:id/typing
Body: { token: string, isTyping: boolean }
```

### Submit Rating
```
POST /api/widget/conversations/:id/rate
Body: { token: string, rating: number }
```

## Socket.IO Events

The widget connects to Socket.IO for real-time updates:

### Client → Server
- `join` - Join conversation room (automatic on connect)
- `typing` - User typing status

### Server → Client
- `message:created` - New message received
- `typing:status` - Agent typing status
- `conversation:resolved` - Conversation marked as resolved (triggers rating)

## Development

### Setup
```bash
npm install
```

### Development Server
```bash
npm run dev
```

Opens at `http://localhost:5174` with hot reload.

### Build
```bash
npm run build
```

Outputs to `dist/widget.iife.js` - a single, self-contained IIFE bundle.

### Preview Production Build
```bash
npm run preview
```

## File Structure

```
src/
├── main.tsx       # Entry point, Shadow DOM setup, auto-initialization
├── Widget.tsx     # Main widget component (state, socket, UI)
├── api.ts         # API client for backend endpoints
└── styles.ts      # CSS-in-JS styles for Shadow DOM
```

## Conversation Flow

1. **Widget Loads**: Fetches configuration from `/api/widget/init`
2. **User Opens Widget**: Shows pre-chat form if no conversation exists
3. **Pre-chat Submitted**: Creates conversation via `/api/widget/conversations`
4. **Chat Active**:
   - Loads message history
   - Connects to Socket.IO for real-time updates
   - User can send messages, see typing indicators
   - Conversation token persists in localStorage
5. **Conversation Resolved**: Shows rating prompt
6. **Page Reload**: Widget automatically reconnects to existing conversation

## Browser Support

- Modern browsers (Chrome, Firefox, Safari, Edge)
- ES2022+ features
- Shadow DOM v1
- WebSocket/Polling fallback

## Customization

### Colors
Primary color is configured via the backend API. The widget automatically generates hover and light variants.

### Position
Set `position: 'bottom-left'` in the backend config to move the widget to the left side.

### Pre-chat Fields
Configure custom fields in the backend config. Each field supports:
- `name` - Field identifier
- `type` - HTML input type
- `required` - Validation flag
- `label` - Display label

## Security

- Widget token-based authentication
- All API requests use HTTPS in production
- No sensitive data in localStorage (only conversation token)
- CORS configured on backend
- XSS protection via Shadow DOM isolation

## Performance

- Lazy-loaded Socket.IO connection (only after conversation starts)
- Debounced typing indicators
- Efficient message rendering
- Small bundle size (~23KB gzipped)
- No external dependencies beyond Preact and Socket.IO

## License

Private - TicketHacker
