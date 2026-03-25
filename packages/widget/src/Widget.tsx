import { Component } from 'preact';
import { io, Socket } from 'socket.io-client';
import type { WidgetConfig, Message } from './api';
import {
  initWidget,
  createConversation,
  getMessages,
  sendMessage,
  sendTyping,
  submitRating,
} from './api';

interface WidgetProps {
  tenantId: string;
}

interface WidgetState {
  isOpen: boolean;
  config: WidgetConfig | null;
  conversation: {
    token: string;
    conversationId: string;
    contactId: string;
  } | null;
  messages: Message[];
  inputText: string;
  isLoading: boolean;
  showPreChat: boolean;
  showRating: boolean;
  error: string | null;
  preChatData: Record<string, string>;
  isTyping: boolean;
  agentTyping: boolean;
  unreadCount: number;
}

export class Widget extends Component<WidgetProps, WidgetState> {
  private socket: Socket | null = null;
  private messagesEndRef: HTMLDivElement | null = null;
  private typingTimeout: number | null = null;
  private storageKey: string;

  constructor(props: WidgetProps) {
    super(props);
    this.storageKey = `th_widget_${props.tenantId}`;

    this.state = {
      isOpen: false,
      config: null,
      conversation: this.loadConversation(),
      messages: [],
      inputText: '',
      isLoading: false,
      showPreChat: true,
      showRating: false,
      error: null,
      preChatData: {},
      isTyping: false,
      agentTyping: false,
      unreadCount: 0,
    };
  }

  async componentDidMount() {
    await this.initialize();
  }

  componentWillUnmount() {
    this.disconnectSocket();
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
    }
  }

  componentDidUpdate(_prevProps: WidgetProps, prevState: WidgetState) {
    // Auto-scroll to bottom when new messages arrive
    if (prevState.messages.length !== this.state.messages.length) {
      this.scrollToBottom();

      // Increment unread count if panel is closed and message is from agent
      if (!this.state.isOpen) {
        const lastMessage = this.state.messages[this.state.messages.length - 1];
        if (lastMessage?.isAgent) {
          this.setState({ unreadCount: this.state.unreadCount + 1 });
        }
      }
    }

    // Clear unread when opened
    if (!prevState.isOpen && this.state.isOpen) {
      this.setState({ unreadCount: 0 });
    }
  }

  private async initialize() {
    try {
      this.setState({ isLoading: true, error: null });

      const config = await initWidget(this.props.tenantId);
      this.setState({ config });

      // If we have a saved conversation, load it
      if (this.state.conversation) {
        await this.loadConversationMessages();
        this.setState({ showPreChat: false });
        this.connectSocket();
      } else {
        this.setState({ showPreChat: true });
      }
    } catch (error) {
      this.setState({
        error: error instanceof Error ? error.message : 'Failed to initialize widget'
      });
    } finally {
      this.setState({ isLoading: false });
    }
  }

  private loadConversation() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  }

  private saveConversation(conversation: WidgetState['conversation']) {
    if (conversation) {
      localStorage.setItem(this.storageKey, JSON.stringify(conversation));
    }
  }

  private async loadConversationMessages() {
    if (!this.state.conversation) return;

    try {
      const messages = await getMessages(
        this.state.conversation.conversationId,
        this.state.conversation.token
      );
      this.setState({ messages });
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  }

  private connectSocket() {
    if (!this.state.conversation || this.socket) return;

    try {
      this.socket = io('http://localhost:3001', {
        auth: {
          token: this.state.conversation.token,
        },
        transports: ['websocket', 'polling'],
      });

      this.socket.on('connect', () => {
        console.log('Socket connected');
      });

      this.socket.on('message:created', (message: Message) => {
        // Only add if it's not from us (agent message)
        if (message.isAgent) {
          this.setState({
            messages: [...this.state.messages, message],
            agentTyping: false,
          });
        }
      });

      this.socket.on('typing:status', (data: { isTyping: boolean }) => {
        this.setState({ agentTyping: data.isTyping });
      });

      this.socket.on('conversation:resolved', () => {
        this.setState({ showRating: true });
      });

      this.socket.on('disconnect', () => {
        console.log('Socket disconnected');
      });

      this.socket.on('error', (error: Error) => {
        console.error('Socket error:', error);
      });
    } catch (error) {
      console.error('Failed to connect socket:', error);
    }
  }

  private disconnectSocket() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  private toggleWidget = () => {
    this.setState({ isOpen: !this.state.isOpen });
  };

  private handlePreChatSubmit = async (e: Event) => {
    e.preventDefault();

    if (!this.state.config) return;

    try {
      this.setState({ isLoading: true, error: null });

      const conversation = await createConversation(
        this.props.tenantId,
        this.state.preChatData
      );

      this.setState({
        conversation,
        showPreChat: false,
      });

      this.saveConversation(conversation);
      this.connectSocket();
      await this.loadConversationMessages();
    } catch (error) {
      this.setState({
        error: error instanceof Error ? error.message : 'Failed to start conversation',
      });
    } finally {
      this.setState({ isLoading: false });
    }
  };

  private handlePreChatChange = (field: string, value: string) => {
    this.setState({
      preChatData: {
        ...this.state.preChatData,
        [field]: value,
      },
    });
  };

  private handleInputChange = (e: Event) => {
    const target = e.target as HTMLTextAreaElement;
    this.setState({ inputText: target.value });

    // Send typing indicator
    if (!this.state.isTyping && target.value.length > 0) {
      this.setState({ isTyping: true });
      this.sendTypingStatus(true);
    }

    // Clear typing timeout
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
    }

    // Set timeout to stop typing
    this.typingTimeout = window.setTimeout(() => {
      this.setState({ isTyping: false });
      this.sendTypingStatus(false);
    }, 1000);
  };

  private sendTypingStatus = async (isTyping: boolean) => {
    if (!this.state.conversation) return;

    try {
      await sendTyping(
        this.state.conversation.conversationId,
        this.state.conversation.token,
        isTyping
      );
    } catch (error) {
      console.error('Failed to send typing status:', error);
    }
  };

  private handleSendMessage = async (e?: Event) => {
    if (e) e.preventDefault();

    const content = this.state.inputText.trim();
    if (!content || !this.state.conversation) return;

    try {
      this.setState({ inputText: '', isTyping: false });
      this.sendTypingStatus(false);

      const message = await sendMessage(
        this.state.conversation.conversationId,
        this.state.conversation.token,
        content
      );

      this.setState({
        messages: [...this.state.messages, message],
      });
    } catch (error) {
      this.setState({
        error: error instanceof Error ? error.message : 'Failed to send message',
      });
    }
  };

  private handleKeyPress = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.handleSendMessage();
    }
  };

  private handleRating = async (rating: number) => {
    if (!this.state.conversation) return;

    try {
      await submitRating(
        this.state.conversation.conversationId,
        this.state.conversation.token,
        rating
      );
      this.setState({ showRating: false });
    } catch (error) {
      console.error('Failed to submit rating:', error);
    }
  };

  private scrollToBottom() {
    if (this.messagesEndRef) {
      this.messagesEndRef.scrollIntoView({ behavior: 'smooth' });
    }
  }

  private formatTime(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;

    return date.toLocaleDateString();
  }

  private getInitials(name?: string): string {
    if (!name) return '?';
    return name
      .split(' ')
      .map(part => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  render() {
    const { config, isOpen, showPreChat, showRating, messages, isLoading, error, agentTyping, unreadCount } = this.state;

    if (!config) return null;

    return (
      <div>
        {/* Chat Bubble */}
        <button
          class={`th-bubble ${isOpen ? 'open' : ''}`}
          onClick={this.toggleWidget}
          aria-label="Toggle chat"
        >
          {!isOpen && unreadCount > 0 && (
            <span class="th-unread-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
          )}
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            {isOpen ? (
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            ) : (
              <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z" />
            )}
          </svg>
        </button>

        {/* Chat Panel */}
        <div class={`th-panel ${isOpen ? 'open' : ''}`}>
          {/* Header */}
          <div class="th-header">
            <div>
              <div class="th-header-title">TicketHacker Support</div>
              <div class="th-header-subtitle">We typically reply in minutes</div>
            </div>
            <button
              class="th-close-btn"
              onClick={this.toggleWidget}
              aria-label="Close chat"
            >
              <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
              </svg>
            </button>
          </div>

          {/* Error Display */}
          {error && <div class="th-error">{error}</div>}

          {/* Loading State */}
          {isLoading && (
            <div class="th-loading">
              <div class="th-spinner" />
            </div>
          )}

          {/* Pre-chat Form */}
          {!isLoading && showPreChat && (
            <div class="th-prechat">
              <div class="th-prechat-greeting">{config.greeting}</div>
              <form onSubmit={this.handlePreChatSubmit}>
                {config.preChatFields.map(field => (
                  <div key={field.name} class="th-form-group">
                    <label class="th-label">
                      {field.label}
                      {field.required && ' *'}
                    </label>
                    <input
                      type={field.type}
                      class="th-input"
                      required={field.required}
                      value={this.state.preChatData[field.name] || ''}
                      onInput={(e) => this.handlePreChatChange(
                        field.name,
                        (e.target as HTMLInputElement).value
                      )}
                    />
                  </div>
                ))}
                <button type="submit" class="th-btn">
                  Start Conversation
                </button>
              </form>
            </div>
          )}

          {/* Rating View */}
          {!isLoading && !showPreChat && showRating && (
            <div class="th-rating">
              <div class="th-rating-title">How was your experience?</div>
              <div class="th-rating-stars">
                {[1, 2, 3, 4, 5].map(rating => (
                  <button
                    key={rating}
                    class="th-rating-star"
                    onClick={() => this.handleRating(rating)}
                    aria-label={`Rate ${rating} stars`}
                  >
                    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                    </svg>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Chat View */}
          {!isLoading && !showPreChat && !showRating && (
            <>
              {/* Messages */}
              <div class="th-messages">
                {messages.map(message => (
                  <div key={message.id} class={`th-message ${message.isAgent ? 'agent' : 'user'}`}>
                    <div class="th-message-avatar">
                      {this.getInitials(message.senderName)}
                    </div>
                    <div>
                      <div class="th-message-bubble">{message.content}</div>
                      <div class="th-message-time">{this.formatTime(message.createdAt)}</div>
                    </div>
                  </div>
                ))}

                {/* Typing Indicator */}
                {agentTyping && (
                  <div class="th-typing">
                    <div class="th-message-avatar">A</div>
                    <div class="th-typing-bubble">
                      <div class="th-typing-dot" />
                      <div class="th-typing-dot" />
                      <div class="th-typing-dot" />
                    </div>
                  </div>
                )}

                <div ref={(el) => { this.messagesEndRef = el; }} />
              </div>

              {/* Input Area */}
              <div class="th-input-area">
                <textarea
                  class="th-message-input"
                  placeholder="Type your message..."
                  rows={1}
                  value={this.state.inputText}
                  onInput={this.handleInputChange}
                  onKeyPress={this.handleKeyPress}
                />
                <button
                  class="th-send-btn"
                  onClick={this.handleSendMessage}
                  disabled={!this.state.inputText.trim()}
                  aria-label="Send message"
                >
                  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                  </svg>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }
}
